"""The discussion on a ticket, stored in MongoDB.

One document per ticket, holding its messages in order:

    {ticket_id: 17, messages: [{id, by, text, at, edited_at}], updated_at}

A thread is always read whole, together with the ticket it belongs to, so the
messages live inside it instead of in a collection of their own. It is
created by the first message (an upsert), and removed with its ticket.

Who may read and write a thread is whoever may see the ticket: the person
who filed it, and admins.
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException, status
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.model import Account, Ticket
from app.mongo import TICKET_THREADS
from app.service.account_service import is_admin
from app.service.notification_service import NotificationType, Notifier, admin_ids

MESSAGE_MAX = 2000
# Far below Mongo's 16 MB document cap even at full length, and far beyond
# what a ticket conversation needs.
THREAD_MAX_MESSAGES = 500


class MessageBody(BaseModel):
    text: str = Field(min_length=1, max_length=MESSAGE_MAX)


async def get_ticket_for(session: AsyncSession, me: Account, ticket_id: int) -> Ticket:
    """The ticket, if `me` may see it. Someone else's ticket is a 404 to a
    member, the same as the ticket list hiding it, so ids cannot be probed."""
    ticket = await session.get(Ticket, ticket_id)
    if ticket is None or (ticket.created_by != me.id and not is_admin(me)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return ticket


async def usernames(session: AsyncSession, ids: set[str]) -> dict[str, str]:
    valid = set()
    for value in ids:
        try:
            valid.add(uuid.UUID(value))
        except ValueError:
            continue
    if not valid:
        return {}
    rows = await session.execute(select(Account.id, Account.username).where(Account.id.in_(valid)))
    return {str(account_id): name for account_id, name in rows.all()}


def serialize_message(message: dict[str, Any], names: dict[str, str]) -> dict[str, Any]:
    return {
        "id": str(message["id"]),
        "by": message["by"],
        # None once that account is deleted.
        "by_username": names.get(message["by"]),
        "text": message["text"],
        "at": message["at"],
        "edited_at": message.get("edited_at"),
    }


async def get_thread(db: AsyncDatabase, session: AsyncSession, me: Account, ticket_id: int) -> dict[str, Any]:
    await get_ticket_for(session, me, ticket_id)
    doc = await db[TICKET_THREADS].find_one({"ticket_id": ticket_id})
    messages = doc["messages"] if doc else []
    names = await usernames(session, {m["by"] for m in messages})
    return {"Messages": [serialize_message(m, names) for m in messages]}


async def post_message(
    db: AsyncDatabase,
    session: AsyncSession,
    me: Account,
    ticket_id: int,
    body: MessageBody,
    notifier: Notifier | None = None,
) -> dict[str, Any]:
    ticket = await get_ticket_for(session, me, ticket_id)
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Message cannot be blank")

    now = datetime.now(timezone.utc)
    message = {"id": ObjectId(), "by": str(me.id), "text": text, "at": now, "edited_at": None}

    # One round trip: create the thread if this is its first message, and
    # refuse (match nothing) once it is full. A full thread that matches
    # nothing would upsert a second document, which the unique index on
    # ticket_id turns into a DuplicateKeyError instead.
    try:
        doc = await db[TICKET_THREADS].find_one_and_update(
            {"ticket_id": ticket_id, f"messages.{THREAD_MAX_MESSAGES - 1}": {"$exists": False}},
            {
                "$push": {"messages": message},
                "$set": {"updated_at": now},
                "$setOnInsert": {"ticket_id": ticket_id, "created_at": now},
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"This thread has reached {THREAD_MAX_MESSAGES} messages",
        ) from exc

    if notifier is not None:
        # Everyone already in the conversation, plus the person who filed it.
        # If nobody from the admin side has spoken yet, a message from the
        # filer goes to every admin so it does not go unseen.
        involved = {uuid.UUID(m["by"]) for m in doc["messages"]} | {ticket.created_by}
        if involved == {ticket.created_by}:
            involved |= set(await admin_ids(session))
        snippet = text if len(text) <= 80 else text[:77] + "…"
        notifier.add(
            involved,
            type=NotificationType.TICKET_COMMENT,
            title=f'{me.username} on "{ticket.name}": {snippet}',
            link=f"/request-table/ticket/{ticket_id}",
            actor=me,
        )

    names = await usernames(session, {str(me.id)})
    return {"Message": serialize_message(message, names)}


def _parse_message_id(message_id: str) -> ObjectId:
    try:
        return ObjectId(message_id)
    except InvalidId as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found") from exc


async def edit_message(
    db: AsyncDatabase, session: AsyncSession, me: Account, ticket_id: int, message_id: str, body: MessageBody
) -> dict[str, Any]:
    """Your own messages only - even an admin does not put words in someone
    else's mouth."""
    await get_ticket_for(session, me, ticket_id)
    text = body.text.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Message cannot be blank")

    oid = _parse_message_id(message_id)
    now = datetime.now(timezone.utc)
    doc = await db[TICKET_THREADS].find_one_and_update(
        {"ticket_id": ticket_id, "messages": {"$elemMatch": {"id": oid, "by": str(me.id)}}},
        {"$set": {"messages.$.text": text, "messages.$.edited_at": now, "updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        raise await _missing_or_forbidden(db, ticket_id, oid)

    message = next(m for m in doc["messages"] if m["id"] == oid)
    return {"Message": serialize_message(message, await usernames(session, {message["by"]}))}


async def delete_message(
    db: AsyncDatabase, session: AsyncSession, me: Account, ticket_id: int, message_id: str
) -> None:
    """Your own, or any as an admin (to take down something that should not
    be there)."""
    await get_ticket_for(session, me, ticket_id)
    oid = _parse_message_id(message_id)
    match: dict[str, Any] = {"id": oid} if is_admin(me) else {"id": oid, "by": str(me.id)}

    result = await db[TICKET_THREADS].update_one(
        {"ticket_id": ticket_id, "messages": {"$elemMatch": match}},
        {"$pull": {"messages": {"id": oid}}, "$set": {"updated_at": datetime.now(timezone.utc)}},
    )
    if result.modified_count == 0:
        raise await _missing_or_forbidden(db, ticket_id, oid)


async def _missing_or_forbidden(db: AsyncDatabase, ticket_id: int, oid: ObjectId) -> HTTPException:
    exists = await db[TICKET_THREADS].count_documents({"ticket_id": ticket_id, "messages.id": oid}, limit=1)
    if exists:
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="That is not your message")
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")


async def delete_thread(db: AsyncDatabase, ticket_id: int) -> None:
    await db[TICKET_THREADS].delete_one({"ticket_id": ticket_id})
