from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.model import Announcement, Account
from app.service.audit_service import record
from app.service.notification_service import NotificationType, Notifier, active_ids


async def retrieve_announcements(
    session: AsyncSession,
    offset: int = 0,
    limit: int = 0
):
    query = (
        select(Announcement)
        .order_by(Announcement.created.desc())
        .offset(offset)
    )

    if limit:
        query = query.limit(limit)

    announcements = await session.scalars(query)

    return {"Announcements": announcements.all()}


async def create_announcement(
    session: AsyncSession,
    me: Account,
    data,
    notifier: Notifier | None = None,
):
    announcement = Announcement(
        name=data.name,
        description=data.description,
        created_by=me.id
    )

    session.add(announcement)
    await session.flush()

    record(session, "announcement", announcement.id, "name", None, announcement.name, me.id, action="created")
    record(session, "announcement", announcement.id, "description", None, announcement.description, me.id, action="created")

    if notifier is not None:
        notifier.add(
            await active_ids(session),
            type=NotificationType.ANNOUNCEMENT,
            title=f"New announcement: {announcement.name}",
            link=f"/announcement/{announcement.id}",
            actor=me,
        )

    await session.commit()
    await session.refresh(announcement)

    return announcement


async def update_announcement(
    session: AsyncSession,
    me: Account,
    announcement_id: int,
    data
):
    announcement = await session.get(Announcement, announcement_id)

    if announcement is None:
        raise HTTPException(
            status_code=404,
            detail=f"Announcement not found"
        )

    # A field change worth logging, or None when it did not really change.
    def update_announcement_log(col_name, old_val, new_value):
        if old_val == new_value:
            return None
        return (col_name, old_val, new_value)

    audit_list = []
    # only fields sent get touched. description null = clear it
    sent = data.model_fields_set

    if "name" in sent and data.name is not None:
        name_changed = update_announcement_log(
            "name",
            announcement.name,
            data.name
        )

        if name_changed:
            audit_list.append(name_changed)

        announcement.name = data.name

    if "description" in sent:
        description_changed = update_announcement_log(
            "description",
            announcement.description,
            data.description
        )

        if description_changed:
            audit_list.append(description_changed)
            announcement.description = data.description

    for change in audit_list:
        record(session, "announcement", announcement.id, *change, me.id)

    await session.commit()
    await session.refresh(announcement)

    return announcement


async def delete_announcement(
    session: AsyncSession,
    me: Account,
    announcement_id: int
):
    announcement = await session.get(Announcement, announcement_id)

    if announcement is None:
        raise HTTPException(
            status_code=404,
            detail="Announcement not found"
        )

    record(session, "announcement", announcement.id, "name", announcement.name, None, me.id, action="deleted")
    record(session, "announcement", announcement.id, "description", announcement.description, None, me.id, action="deleted")

    await session.delete(announcement)
    await session.commit()

    return {"message": "Announcement deleted successfully"}
