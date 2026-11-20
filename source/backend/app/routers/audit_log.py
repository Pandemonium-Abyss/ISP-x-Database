import uuid
from typing import Annotated, Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo.asynchronous.database import AsyncDatabase
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import getSession
from app.model import Account
from app.mongo import AUDIT_LOGS, getMongo
from app.service import account_service

# The log spans every table, so all of it is Lab Owner and Lab Admin only.
auditLogRouter = APIRouter(
    prefix="/audit-log", dependencies=[Depends(account_service.require_admin)]
)

Mongo = Annotated[AsyncDatabase, Depends(getMongo)]
Session = Annotated[AsyncSession, Depends(getSession)]


async def usernames(session: AsyncSession, docs: list[dict[str, Any]]) -> dict[str, str]:
    """The log is read by name, but it stores ids - a name changes, an id does
    not. One Postgres lookup for the whole page."""
    ids = set()
    for doc in docs:
        try:
            if doc.get("by"):
                ids.add(uuid.UUID(doc["by"]))
        except ValueError:
            continue
    if not ids:
        return {}
    rows = await session.execute(select(Account.id, Account.username).where(Account.id.in_(ids)))
    return {str(account_id): name for account_id, name in rows.all()}


def serialize(doc: dict[str, Any], names: dict[str, str]) -> dict[str, Any]:
    return {
        "id": str(doc["_id"]),
        "table": doc["table"],
        "row_id": doc["row_id"],
        "action": doc["action"],
        "changes": doc["changes"],
        "by_whom": doc.get("by"),
        # None when that account has since been deleted.
        "by_username": names.get(doc.get("by") or ""),
        "occurred_at": doc["at"],
    }


@auditLogRouter.get("/", tags=["AuditLog"])
async def retrieve_audit_logs(
    db: Mongo,
    session: Session,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0)] = 0,
    from_table: Annotated[str | None, Query(max_length=64)] = None,
    row_id: Annotated[str | None, Query(max_length=36)] = None,
    by_whom: uuid.UUID | None = None,
):
    """Newest first - a change history is read from the most recent change back."""
    query: dict[str, Any] = {}
    if from_table is not None:
        query["table"] = from_table
    if row_id is not None:
        query["row_id"] = row_id
    if by_whom is not None:
        query["by"] = str(by_whom)

    cursor = db[AUDIT_LOGS].find(query).sort([("at", -1), ("_id", -1)]).skip(offset).limit(limit)
    docs = [doc async for doc in cursor]
    names = await usernames(session, docs)
    return {"AuditLogs": [serialize(doc, names) for doc in docs]}


@auditLogRouter.get("/{audit_log_id}", tags=["AuditLog"])
async def retrieve_audit_log(audit_log_id: str, db: Mongo, session: Session):
    not_found = HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Audit log with id {audit_log_id} not found",
    )
    try:
        oid = ObjectId(audit_log_id)
    except InvalidId as exc:
        raise not_found from exc

    doc = await db[AUDIT_LOGS].find_one({"_id": oid})
    if doc is None:
        raise not_found
    return {"AuditLog": serialize(doc, await usernames(session, [doc]))}
