"""Per-user notifications, stored in MongoDB.

One document per recipient, so marking one read never touches anyone else's.
They expire on their own: a TTL index on `expires_at` has MongoDB delete each
one once it passes, with nothing for the app to clean up.

Writing them is best effort. The Postgres change that caused one has already
been committed by the time it is sent, so a Mongo hiccup is logged and
swallowed rather than turning a saved task into a 500.
"""

import enum
import logging
import uuid
from collections.abc import Iterable
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends, HTTPException, status
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import PyMongoError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.model import Account, AccountRole
from app.mongo import NOTIFICATIONS, getMongo

log = logging.getLogger(__name__)

# How long a notification lives, read or not.
TTL = timedelta(days=30)


class NotificationType(str, enum.Enum):
    TASK_ASSIGNED = "task_assigned"
    TASK_STATUS = "task_status"
    TICKET_CREATED = "ticket_created"
    TICKET_STATUS = "ticket_status"
    TICKET_COMMENT = "ticket_comment"
    ANNOUNCEMENT = "announcement"


class Notifier:
    """Collects notifications while a request runs, and sends them once the
    request's own work has been committed. Services call `add`; the router
    calls `send` after the service returns, so a request that fails part way
    notifies nobody about a change that never happened."""

    def __init__(self, db: AsyncDatabase):
        self.db = db
        self.pending: list[dict[str, Any]] = []

    def add(
        self,
        recipients: Iterable[uuid.UUID],
        *,
        type: NotificationType,
        title: str,
        actor: Account,
        link: str | None = None,
        body: str | None = None,
    ) -> None:
        now = datetime.now(timezone.utc)
        for recipient in set(recipients):
            # Nobody needs telling about what they just did themselves.
            if recipient == actor.id:
                continue
            self.pending.append(
                {
                    "account_id": str(recipient),
                    "type": type.value,
                    "title": title,
                    "body": body,
                    "link": link,
                    "actor": {"id": str(actor.id), "username": actor.username},
                    "read": False,
                    "created_at": now,
                    "expires_at": now + TTL,
                }
            )

    async def send(self) -> None:
        if not self.pending:
            return
        docs, self.pending = self.pending, []
        try:
            await self.db[NOTIFICATIONS].insert_many(docs, ordered=False)
        except PyMongoError:
            log.exception("Could not store %d notification(s)", len(docs))


def get_notifier(db: Annotated[AsyncDatabase, Depends(getMongo)]) -> Notifier:
    return Notifier(db)


# ---- recipient lookups (Postgres) ----

async def admin_ids(session: AsyncSession) -> list[uuid.UUID]:
    """Everyone who can judge a ticket."""
    rows = await session.scalars(
        select(Account.id).where(
            Account.active.is_(True),
            Account.role.in_([AccountRole.LAB_OWNER, AccountRole.LAB_ADMIN]),
        )
    )
    return list(rows.all())


async def active_ids(session: AsyncSession) -> list[uuid.UUID]:
    rows = await session.scalars(select(Account.id).where(Account.active.is_(True)))
    return list(rows.all())


# ---- reading and marking ----

def serialize(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(doc["_id"]),
        **{k: v for k, v in doc.items() if k not in ("_id", "account_id", "expires_at")},
    }


async def list_for(
    db: AsyncDatabase, me: Account, *, unread_only: bool, offset: int, limit: int
) -> dict[str, Any]:
    query: dict[str, Any] = {"account_id": str(me.id)}
    if unread_only:
        query["read"] = False

    collection = db[NOTIFICATIONS]
    cursor = (
        collection.find(query)
        # Unread first, then newest. Served by the (account_id, read, created_at) index.
        .sort([("read", 1), ("created_at", -1), ("_id", -1)])
        .skip(offset)
        .limit(limit)
    )
    items = [serialize(doc) async for doc in cursor]
    unread = await collection.count_documents({"account_id": str(me.id), "read": False})
    return {"Notifications": items, "Unread": unread}


async def unread_count(db: AsyncDatabase, me: Account) -> int:
    return await db[NOTIFICATIONS].count_documents({"account_id": str(me.id), "read": False})


async def mark_read(db: AsyncDatabase, me: Account, notification_id: str) -> dict[str, Any]:
    not_found = HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Notification with id {notification_id} not found",
    )
    try:
        oid = ObjectId(notification_id)
    except InvalidId as exc:
        raise not_found from exc

    # account_id in the filter: someone else's id is simply not found, which
    # also keeps it from confirming that the id exists.
    doc = await db[NOTIFICATIONS].find_one_and_update(
        {"_id": oid, "account_id": str(me.id)},
        {"$set": {"read": True}},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        raise not_found
    return serialize(doc)


async def mark_all_read(db: AsyncDatabase, me: Account) -> int:
    result = await db[NOTIFICATIONS].update_many(
        {"account_id": str(me.id), "read": False}, {"$set": {"read": True}}
    )
    return result.modified_count


async def delete_one(db: AsyncDatabase, me: Account, notification_id: str) -> None:
    try:
        oid = ObjectId(notification_id)
    except InvalidId:
        oid = None
    result = (
        await db[NOTIFICATIONS].delete_one({"_id": oid, "account_id": str(me.id)})
        if oid is not None
        else None
    )
    if result is None or result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Notification with id {notification_id} not found",
        )
