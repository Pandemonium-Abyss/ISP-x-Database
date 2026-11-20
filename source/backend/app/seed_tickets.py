"""Fill a dev database with sample tickets, so there is something to look at.

    uv run python -m app.seed_tickets
    docker compose -f docker-compose.dev.yaml exec fastapi uv run python -m app.seed_tickets

Goes through the same service code as the API, so everything a real ticket
sets off happens here too: quota, audit log entries, notifications, the task
made when a ticket is accepted, and the discussion threads.

Uses the accounts already there: tickets are filed by the active Lab Users in
turn, and judged by the first active Lab Owner or Lab Admin. Categories it
needs are created if missing. Safe to run again: a sample ticket that already
exists (same name, same filer) is left alone.
"""

import asyncio
import datetime as dt
from dataclasses import dataclass, field

from sqlalchemy import select

from app.database import SessionLocal, create_tables, engine
from app.model import Account, AccountRole, Category, Ticket, TicketStatus
from app.mongo import MONGO_DB, connect, init_mongo
from app.routers.ticket import TicketCreate, TicketUpdate
from app.service import audit_service, ticket_service, ticket_thread_service
from app.service.notification_service import Notifier
from app.service.ticket_thread_service import MessageBody


@dataclass
class Sample:
    name: str
    category: str
    description: str
    due_in_days: int | None
    # pending, accepted or rejected
    outcome: str = "pending"
    # (who, text): "filer" or "admin"
    thread: list[tuple[str, str]] = field(default_factory=list)


SAMPLES = [
    Sample(
        "Book the confocal microscope for Friday",
        "Equipment booking",
        "Need 2 hours on the confocal for live-cell imaging of the HeLa samples.",
        3,
        thread=[
            ("filer", "Is Friday afternoon free? Mornings clash with my lab session."),
            ("admin", "Friday 14:00–16:00 is open. Bring your own glass-bottom dishes."),
            ("filer", "Perfect, thanks!"),
        ],
    ),
    Sample(
        "Order more 1.5 mL microcentrifuge tubes",
        "Supplies",
        "We are down to the last bag. Two boxes of 500 should last the term.",
        7,
        outcome="accepted",
        thread=[("admin", "Ordered from the usual supplier, should arrive Tuesday.")],
    ),
    Sample(
        "Centrifuge in Room 101 is making a grinding noise",
        "Maintenance",
        "Started this morning at high speed. I stopped the run and put a sign on it.",
        1,
        outcome="accepted",
        thread=[
            ("admin", "Thanks for stopping it. Probably the rotor - I'll take it out of service."),
            ("filer", "Is there another one I can use meanwhile?"),
            ("admin", "Use the one in Room 104 until this is fixed."),
        ],
    ),
    Sample(
        "Access to the -80 °C freezer",
        "General",
        "I need a shelf for my project samples from next week.",
        10,
    ),
    Sample(
        "Borrow the 3D printer over the weekend",
        "Equipment booking",
        "Printing parts for the microscope stage adapter, about 14 hours total.",
        5,
        outcome="rejected",
        thread=[
            ("admin", "The printer can't run unattended overnight. Could you split it into daytime jobs?"),
            ("filer", "Okay, I'll resubmit with a schedule."),
        ],
    ),
    Sample(
        "Replace the burnt-out lamp on the fume hood",
        "Maintenance",
        "Fume hood 2 has no light, hard to see what you're pipetting.",
        2,
    ),
    Sample(
        "Nitrile gloves, size S",
        "Supplies",
        "All the boxes left are M and L.",
        None,
    ),
    Sample(
        "Training session for the new spectrophotometer",
        "General",
        "A few of us would like a short walkthrough before using it.",
        14,
        thread=[("filer", "Any day next week works for me.")],
    ),
]


async def main() -> None:
    client = connect()
    db = client[MONGO_DB]
    await create_tables()
    await init_mongo(db)

    async with SessionLocal() as session:
        filers = list(
            (
                await session.scalars(
                    select(Account)
                    .where(Account.role == AccountRole.LAB_USER, Account.active.is_(True))
                    .order_by(Account.username)
                )
            ).all()
        )
        judge = await session.scalar(
            select(Account)
            .where(
                Account.role.in_([AccountRole.LAB_OWNER, AccountRole.LAB_ADMIN]),
                Account.active.is_(True),
            )
            .order_by(Account.role, Account.username)
            .limit(1)
        )
        if not filers or judge is None:
            raise SystemExit(
                "Needs at least one active Lab User (to file tickets) and one active "
                "Lab Owner or Lab Admin (to judge them)."
            )

        categories: dict[str, int] = {}
        for name in sorted({s.category for s in SAMPLES}):
            category = await session.scalar(select(Category).where(Category.name == name))
            if category is None:
                category = Category(name=name)
                session.add(category)
                await session.flush()
                audit_service.record(session, "category", category.id, "name", None, name, judge.id, "created")
            categories[name] = category.id
        await session.commit()

        made = skipped = 0
        now = dt.datetime.now(dt.timezone.utc)

        for i, sample in enumerate(SAMPLES):
            filer = filers[i % len(filers)]
            exists = await session.scalar(
                select(Ticket.id).where(Ticket.name == sample.name, Ticket.created_by == filer.id)
            )
            if exists is not None:
                skipped += 1
                continue

            notifier = Notifier(db)
            ticket = await ticket_service.create_ticket(
                session,
                filer,
                TicketCreate(
                    name=sample.name,
                    description=sample.description,
                    category_id=categories[sample.category],
                    due_date=now + dt.timedelta(days=sample.due_in_days) if sample.due_in_days else None,
                ),
                notifier,
            )
            ticket_id = ticket.id

            for who, text in sample.thread:
                author = filer if who == "filer" else judge
                await ticket_thread_service.post_message(
                    db, session, author, ticket_id, MessageBody(text=text), notifier
                )

            if sample.outcome != "pending":
                await ticket_service.update_ticket(
                    session,
                    judge,
                    ticket_id,
                    TicketUpdate(
                        status=TicketStatus(sample.outcome),
                        # accepting makes a task, given to whoever filed it
                        assignees=[filer.id] if sample.outcome == "accepted" else None,
                    ),
                    notifier,
                )

            await notifier.send()
            made += 1

        # What the API's AuditWriter does at the end of a request.
        committed = session.sync_session.info.pop(audit_service.COMMITTED, None)
        if committed:
            await audit_service.write(db, committed)

    await client.close()
    await engine.dispose()
    print(
        f"Seeded {made} ticket(s), skipped {skipped} already there. "
        f"Filed by {', '.join(f.username for f in filers)}; judged by {judge.username}."
    )


if __name__ == "__main__":
    asyncio.run(main())
