import datetime as dt
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import getSession
from app.limits import DESCRIPTION_MAX, Name
from app.model import Account, TicketStatus
from app.service.notification_service import Notifier, get_notifier
from app.service.audit_service import AuditWriter
from app.service import account_service, ticket_service, ticket_thread_service
from app.service.ticket_thread_service import MessageBody
from app.mongo import getMongo
from pymongo.asynchronous.database import AsyncDatabase


class TicketCreate(BaseModel):
    name: Name
    description: str | None = Field(
        default=None,
        max_length=DESCRIPTION_MAX,
    )
    category_id: int
    due_date: dt.datetime | None = None


class TicketUpdate(BaseModel):
    name: Name | None = None
    description: str | None = Field(
        default=None,
        max_length=DESCRIPTION_MAX,
    )
    status: TicketStatus | None = None
    category_id: int | None = None
    due_date: dt.datetime | None = None
    # only read on accept: who the new task goes to
    assignees: list[uuid.UUID] | None = None


ticketRouter = APIRouter(
    prefix="/ticket",
    dependencies=[
        Depends(account_service.get_current_auth_user),
        AuditWriter,
    ],
)


@ticketRouter.get("/", tags=["Tickets"])
async def retrieve_tickets(
    session: Annotated[AsyncSession, Depends(getSession)],
    me: Annotated[Account, Depends(account_service.get_current_account)],
    ticket_id: int | None = None,
    search: str | None = None,
    status: TicketStatus | None = None,
    category_id: int | None = None,
    due_after: dt.datetime | None = None,
    due_before: dt.datetime | None = None,
    onlyOwned: bool = False,
    notOwned: bool = False,
    get_count: bool = False,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=0),
):
    return await ticket_service.retrieve_tickets(
        session=session,
        me=me,
        ticket_id=ticket_id,
        search=search,
        status=status,
        category_id=category_id,
        due_after=due_after,
        due_before=due_before,
        onlyOwned=onlyOwned,
        notOwned=notOwned,
        get_count=get_count,
        offset=offset,
        limit=limit,
    )


@ticketRouter.post("/", tags=["Tickets"])
async def create_ticket(
    data: TicketCreate,
    session: Annotated[AsyncSession, Depends(getSession)],
    me: Annotated[Account, Depends(account_service.get_current_account)],
    notifier: Annotated[Notifier, Depends(get_notifier)],
):
    result = await ticket_service.create_ticket(
        session=session,
        me=me,
        data=data,
        notifier=notifier,
    )
    await notifier.send()
    return result


@ticketRouter.put("/{ticket_id}", tags=["Tickets"])
async def update_ticket(
    ticket_id: int,
    data: TicketUpdate,
    session: Annotated[AsyncSession, Depends(getSession)],
    me: Annotated[Account, Depends(account_service.get_current_account)],
    notifier: Annotated[Notifier, Depends(get_notifier)],
):
    result = await ticket_service.update_ticket(
        session=session,
        me=me,
        ticket_id=ticket_id,
        data=data,
        notifier=notifier,
    )
    await notifier.send()
    return result


@ticketRouter.delete("/{ticket_id}", tags=["Tickets"])
async def delete_ticket(
    ticket_id: int,
    session: Annotated[AsyncSession, Depends(getSession)],
    me: Annotated[Account, Depends(account_service.get_current_account)],
    db: Annotated[AsyncDatabase, Depends(getMongo)],
):
    result = await ticket_service.delete_ticket(
        session=session,
        me=me,
        ticket_id=ticket_id,
    )
    # Its discussion goes with it. After the delete succeeded, so a refused
    # delete leaves the thread in place.
    await ticket_thread_service.delete_thread(db, ticket_id)
    return result


# ---- discussion (MongoDB: ticket_threads) ----

Mongo = Annotated[AsyncDatabase, Depends(getMongo)]
Session = Annotated[AsyncSession, Depends(getSession)]
Me = Annotated[Account, Depends(account_service.get_current_account)]


@ticketRouter.get("/{ticket_id}/thread", tags=["Ticket thread"])
async def get_thread(ticket_id: int, db: Mongo, session: Session, me: Me):
    return await ticket_thread_service.get_thread(db, session, me, ticket_id)


@ticketRouter.post("/{ticket_id}/thread", tags=["Ticket thread"], status_code=201)
async def post_message(
    ticket_id: int,
    body: MessageBody,
    db: Mongo,
    session: Session,
    me: Me,
    notifier: Annotated[Notifier, Depends(get_notifier)],
):
    result = await ticket_thread_service.post_message(db, session, me, ticket_id, body, notifier)
    await notifier.send()
    return result


@ticketRouter.put("/{ticket_id}/thread/{message_id}", tags=["Ticket thread"])
async def edit_message(ticket_id: int, message_id: str, body: MessageBody, db: Mongo, session: Session, me: Me):
    return await ticket_thread_service.edit_message(db, session, me, ticket_id, message_id, body)


@ticketRouter.delete("/{ticket_id}/thread/{message_id}", tags=["Ticket thread"])
async def delete_message(ticket_id: int, message_id: str, db: Mongo, session: Session, me: Me):
    await ticket_thread_service.delete_message(db, session, me, ticket_id, message_id)
    return {"Message": "Deleted"}
