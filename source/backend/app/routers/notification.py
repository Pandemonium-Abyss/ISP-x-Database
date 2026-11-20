from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pymongo.asynchronous.database import AsyncDatabase

from app.model import Account
from app.mongo import getMongo
from app.service import account_service, notification_service

# Always the caller's own inbox; there is no way to read anyone else's.
notificationRouter = APIRouter(prefix="/notification")

Mongo = Annotated[AsyncDatabase, Depends(getMongo)]
Me = Annotated[Account, Depends(account_service.get_current_account)]


@notificationRouter.get("/", tags=["Notification"])
async def list_notifications(
    db: Mongo,
    me: Me,
    unread_only: bool = False,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
):
    return await notification_service.list_for(
        db, me, unread_only=unread_only, offset=offset, limit=limit
    )


@notificationRouter.get("/unread-count", tags=["Notification"])
async def unread_count(db: Mongo, me: Me):
    """Cheap enough to poll - one count on an indexed field."""
    return {"Unread": await notification_service.unread_count(db, me)}


@notificationRouter.put("/read-all", tags=["Notification"])
async def mark_all_read(db: Mongo, me: Me):
    count = await notification_service.mark_all_read(db, me)
    return {"Message": f"Marked {count} as read"}


@notificationRouter.put("/{notification_id}/read", tags=["Notification"])
async def mark_read(notification_id: str, db: Mongo, me: Me):
    return {"Notification": await notification_service.mark_read(db, me, notification_id)}


@notificationRouter.delete("/{notification_id}", tags=["Notification"])
async def delete_notification(notification_id: str, db: Mongo, me: Me):
    await notification_service.delete_one(db, me, notification_id)
    return {"Message": "Deleted"}
