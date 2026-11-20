"""Notifications: that the right people get one, and the inbox endpoints.

Every test runs against its own throwaway Mongo database (client fixture), so
inboxes start empty and nothing reaches real accounts.
"""

import uuid
from datetime import datetime, timedelta, timezone

from bson import ObjectId

from app.mongo import NOTIFICATIONS
from tests.integration.conftest import AUTH_HEADER

FUTURE = (datetime.now(timezone.utc) + timedelta(days=30)).isoformat()


def inbox(client, account_id) -> list[dict]:
    """Straight from Mongo, newest first, so a test sees exactly what was stored."""

    async def go():
        cursor = client.mongo[NOTIFICATIONS].find({"account_id": str(account_id)}).sort("created_at", -1)
        return [doc async for doc in cursor]

    return client.portal.call(go)


def make_task(client, db, assignees) -> int:
    response = client.post(
        "/task/",
        json={
            "name": f"pytest task {uuid.uuid4().hex[:8]}",
            "category_id": db.category_id,
            "due_date": FUTURE,
            "assignees": [str(a) for a in assignees],
        },
        headers=AUTH_HEADER,
    )
    assert response.status_code == 200, response.text
    task_id = response.json()["Task"]["id"]
    db.track("task", task_id)
    return task_id


def test_assignee_is_told_but_not_the_one_who_assigned(client, db, lab_user_id):
    task_id = make_task(client, db, [lab_user_id, db.me_id])

    [note] = inbox(client, lab_user_id)
    assert note["type"] == "task_assigned"
    assert note["link"] == f"/request-table/task/{task_id}"
    assert note["read"] is False
    assert note["actor"]["id"] == str(db.me_id)
    assert note["expires_at"] > note["created_at"]
    # Assigned themselves, did it themselves - nothing to tell them.
    assert inbox(client, db.me_id) == []


def test_status_change_reaches_the_creator(client, db, lab_user_id):
    task_id = make_task(client, db, [lab_user_id])

    client.login(lab_user_id)
    response = client.put(f"/task/{task_id}", json={"status": "completed"}, headers=AUTH_HEADER)
    assert response.status_code == 200, response.text

    [note] = inbox(client, db.me_id)
    assert note["type"] == "task_status"
    assert "completed" in note["title"]
    # The assignee made the change, so only the original assignment is theirs.
    assert [n["type"] for n in inbox(client, lab_user_id)] == ["task_assigned"]


def test_only_newly_added_assignees_are_told(client, db, lab_user_id):
    task_id = make_task(client, db, [db.me_id])
    assert inbox(client, lab_user_id) == []

    response = client.put(
        f"/task/{task_id}",
        json={"assignees": [str(db.me_id), str(lab_user_id)]},
        headers=AUTH_HEADER,
    )
    assert response.status_code == 200, response.text
    assert [n["type"] for n in inbox(client, lab_user_id)] == ["task_assigned"]

    # Sending the same list again changes nothing and tells nobody.
    client.put(f"/task/{task_id}", json={"assignees": [str(db.me_id), str(lab_user_id)]}, headers=AUTH_HEADER)
    assert len(inbox(client, lab_user_id)) == 1


def test_failed_request_notifies_nobody(client, db, lab_user_id):
    task_id = make_task(client, db, [db.me_id])

    # Status is fine, but the past due date makes the whole update a 400.
    response = client.put(
        f"/task/{task_id}",
        json={"status": "completed", "assignees": [str(lab_user_id)], "due_date": "2000-01-01T00:00:00Z"},
        headers=AUTH_HEADER,
    )

    assert response.status_code == 400
    assert inbox(client, lab_user_id) == []


def test_new_ticket_reaches_admins_and_verdict_reaches_the_filer(client, db, lab_user_id):
    client.login(lab_user_id)
    response = client.post(
        "/ticket/",
        json={"name": f"pytest ticket {uuid.uuid4().hex[:8]}", "category_id": db.category_id},
        headers=AUTH_HEADER,
    )
    assert response.status_code in (200, 201), response.text
    ticket_id = response.json()["id"] if "id" in response.json() else response.json()["Ticket"]["id"]
    db.track("ticket", ticket_id)

    [filed] = inbox(client, db.me_id)
    assert filed["type"] == "ticket_created"
    assert filed["link"] == f"/request-table/ticket/{ticket_id}"

    client.as_me()
    response = client.put(f"/ticket/{ticket_id}", json={"status": "rejected"}, headers=AUTH_HEADER)
    assert response.status_code == 200, response.text

    [verdict] = inbox(client, lab_user_id)
    assert verdict["type"] == "ticket_status"
    assert "rejected" in verdict["title"]


def test_announcement_reaches_everyone_else(client, db, lab_user_id):
    response = client.post(
        "/announcement/",
        json={"name": f"pytest announcement {uuid.uuid4().hex[:8]}"},
        headers=AUTH_HEADER,
    )
    assert response.status_code in (200, 201), response.text
    body = response.json()
    announcement_id = body["id"] if "id" in body else body["Announcement"]["id"]
    db.track("announcement", announcement_id)

    [note] = inbox(client, lab_user_id)
    assert note["type"] == "announcement"
    assert note["link"] == f"/announcement/{announcement_id}"
    assert inbox(client, db.me_id) == []


def test_inbox_endpoints(client, db, lab_user_id):
    make_task(client, db, [lab_user_id])
    make_task(client, db, [lab_user_id])
    make_task(client, db, [lab_user_id])
    client.login(lab_user_id)

    assert client.get("/notification/unread-count", headers=AUTH_HEADER).json() == {"Unread": 3}

    listed = client.get("/notification/", headers=AUTH_HEADER).json()
    assert listed["Unread"] == 3
    first = listed["Notifications"][0]
    assert "account_id" not in first and "expires_at" not in first

    read = client.put(f"/notification/{first['id']}/read", headers=AUTH_HEADER)
    assert read.status_code == 200 and read.json()["Notification"]["read"] is True

    # Unread first: the one just read sorts to the end.
    order = client.get("/notification/", headers=AUTH_HEADER).json()["Notifications"]
    assert [n["read"] for n in order] == [False, False, True]
    assert len(client.get("/notification/?unread_only=true", headers=AUTH_HEADER).json()["Notifications"]) == 2

    assert client.put("/notification/read-all", headers=AUTH_HEADER).json()["Message"] == "Marked 2 as read"
    assert client.get("/notification/unread-count", headers=AUTH_HEADER).json() == {"Unread": 0}

    assert client.delete(f"/notification/{first['id']}", headers=AUTH_HEADER).status_code == 200
    assert len(inbox(client, lab_user_id)) == 2


def test_someone_elses_notification_is_not_found(client, db, lab_user_id):
    make_task(client, db, [lab_user_id])
    [theirs] = inbox(client, lab_user_id)

    # Signed in as the admin, who did not receive it.
    for response in (
        client.put(f"/notification/{theirs['_id']}/read", headers=AUTH_HEADER),
        client.delete(f"/notification/{theirs['_id']}", headers=AUTH_HEADER),
        client.put(f"/notification/{ObjectId()}/read", headers=AUTH_HEADER),
        client.put("/notification/not-an-id/read", headers=AUTH_HEADER),
    ):
        assert response.status_code == 404
    assert inbox(client, lab_user_id)[0]["read"] is False


def test_ttl_index_is_in_place(client):
    async def go():
        return await client.mongo[NOTIFICATIONS].index_information()

    indexes = client.portal.call(go)
    assert indexes["expire"]["expireAfterSeconds"] == 0
    assert indexes["expire"]["key"] == [("expires_at", 1)]
