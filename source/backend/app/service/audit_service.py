"""The audit log, stored in MongoDB.

One document per change to one record: which table and row, whether it was
created, updated or deleted, every field that changed with its value before
and after, who did it and when. Values keep their types (a quota is a number,
a due date a date) rather than being flattened to strings.

How an entry gets written:

1. Code that changes something calls `record(session, ...)` once per field,
   next to the change itself, exactly where it used to add an AuditLog row.
   That only parks the field change on the SQLAlchemy session.
2. When that session commits, an `after_commit` hook moves the parked changes
   to "committed". A rollback throws them away instead, so a change that never
   happened is never logged.
3. `audit_writer`, a dependency on every router that writes, sends the
   committed ones to Mongo before the response goes out, grouped into one
   document per (table, row, person).

The log is no longer in the same transaction as the change, so a Mongo outage
loses entries rather than blocking the app; that is logged as an error.
"""

import datetime as dt
import decimal
import enum
import logging
import uuid
from collections.abc import AsyncIterator
from typing import Annotated, Any, Literal

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import PyMongoError
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.database import getSession
from app.mongo import AUDIT_LOGS, getMongo

log = logging.getLogger(__name__)

Action = Literal["created", "updated", "deleted"]

PENDING = "audit_pending"
COMMITTED = "audit_committed"


def to_bson(value: Any) -> Any:
    """Something Mongo can store and a reader can make sense of."""
    if value is None or isinstance(value, (bool, int, float, str, dt.datetime)):
        return value
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, dt.date):
        return dt.datetime(value.year, value.month, value.day, tzinfo=dt.timezone.utc)
    if isinstance(value, (list, tuple, set)):
        return [to_bson(v) for v in value]
    if isinstance(value, dict):
        return {str(k): to_bson(v) for k, v in value.items()}
    return str(value)


def record(
    session: AsyncSession | Session,
    table: str,
    row_id: object,
    field: str,
    old: object,
    new: object,
    by: uuid.UUID | None,
    action: Action = "updated",
) -> None:
    """Note one field change. Nothing is written until the session commits."""
    sync = session.sync_session if isinstance(session, AsyncSession) else session
    sync.info.setdefault(PENDING, []).append(
        {
            "table": table,
            "row_id": str(row_id),
            "field": field,
            "from": to_bson(old),
            "to": to_bson(new),
            "by": str(by) if by is not None else None,
            "action": action,
            "at": dt.datetime.now(dt.timezone.utc),
        }
    )


@event.listens_for(Session, "after_commit")
def _committed(session: Session) -> None:
    pending = session.info.pop(PENDING, None)
    if pending:
        session.info.setdefault(COMMITTED, []).extend(pending)


@event.listens_for(Session, "after_rollback")
def _rolled_back(session: Session) -> None:
    session.info.pop(PENDING, None)


def group(changes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Field changes -> one document per (table, row, person), in the order
    they happened. Created or deleted wins over updated for the whole entry."""
    docs: dict[tuple, dict[str, Any]] = {}
    for change in changes:
        key = (change["table"], change["row_id"], change["by"])
        doc = docs.get(key)
        if doc is None:
            doc = docs[key] = {
                "table": change["table"],
                "row_id": change["row_id"],
                "action": change["action"],
                "changes": [],
                "by": change["by"],
                "at": change["at"],
            }
        elif change["action"] != "updated":
            doc["action"] = change["action"]
        doc["changes"].append({"field": change["field"], "from": change["from"], "to": change["to"]})
    return list(docs.values())


async def write(db: AsyncDatabase, changes: list[dict[str, Any]]) -> None:
    docs = group(changes)
    if not docs:
        return
    try:
        await db[AUDIT_LOGS].insert_many(docs, ordered=False)
    except PyMongoError:
        log.exception("Could not write %d audit log entries", len(docs))


async def log_now(
    db: AsyncDatabase,
    table: str,
    row_id: object,
    changes: list[tuple[str, object, object]],
    by: uuid.UUID | None,
    action: Action = "updated",
) -> None:
    """For changes to Mongo data, which has no Postgres commit to wait on:
    called right after the write succeeded."""
    now = dt.datetime.now(dt.timezone.utc)
    await write(
        db,
        [
            {
                "table": table,
                "row_id": str(row_id),
                "field": field,
                "from": to_bson(old),
                "to": to_bson(new),
                "by": str(by) if by is not None else None,
                "action": action,
                "at": now,
            }
            for field, old, new in changes
        ],
    )


async def audit_writer(
    session: Annotated[AsyncSession, Depends(getSession)],
    db: Annotated[AsyncDatabase, Depends(getMongo)],
) -> AsyncIterator[None]:
    """Router dependency. Same session object as the endpoint's (FastAPI hands
    one per request), so whatever it committed is waiting in session.info."""
    yield
    committed = session.sync_session.info.pop(COMMITTED, None)
    if committed:
        await write(db, committed)


# function scope: the write happens as the endpoint returns, before the
# response is sent, so a reader who asks straight afterwards sees it.
AuditWriter = Depends(audit_writer, scope="function")
