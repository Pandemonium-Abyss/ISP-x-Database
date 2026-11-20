"""Ticket discussions (MongoDB ticket_threads) against the real databases.

Tickets are seeded in Postgres under the test's own category; threads and
notifications land in the test's throwaway Mongo database.
"""

from app.mongo import NOTIFICATIONS, TICKET_THREADS
from app.service import ticket_thread_service
from tests.integration.conftest import AUTH_HEADER


def thread_url(ticket_id: int) -> str:
    return f"/ticket/{ticket_id}/thread"


def post(client, ticket_id: int, text: str):
    return client.post(thread_url(ticket_id), json={"text": text}, headers=AUTH_HEADER)


def inbox(client, account_id) -> list[dict]:
    async def go():
        cursor = client.mongo[NOTIFICATIONS].find({"account_id": str(account_id)}).sort("created_at", 1)
        return [doc async for doc in cursor]

    return client.portal.call(go)


def stored_thread(client, ticket_id: int):
    return client.portal.call(client.mongo[TICKET_THREADS].find_one, {"ticket_id": ticket_id})


def test_conversation_between_filer_and_admin(client, db, lab_user_id):
    ticket_id = db.seed_ticket(created_by=lab_user_id)
    assert client.get(thread_url(ticket_id), headers=AUTH_HEADER).json() == {"Messages": []}
    assert stored_thread(client, ticket_id) is None  # nothing until the first message

    client.login(lab_user_id)
    first = post(client, ticket_id, "  Can I have it by Friday?  ")
    assert first.status_code == 201, first.text
    assert first.json()["Message"]["text"] == "Can I have it by Friday?"

    # Nobody from the admin side had spoken, so the admins hear about it.
    assert [n["type"] for n in inbox(client, db.me_id)] == ["ticket_comment"]
    assert inbox(client, lab_user_id) == []

    client.as_me()
    assert post(client, ticket_id, "Yes, Friday works.").status_code == 201
    [reply_note] = inbox(client, lab_user_id)
    assert reply_note["link"] == f"/request-table/ticket/{ticket_id}"
    assert "Friday works" in reply_note["title"]

    messages = client.get(thread_url(ticket_id), headers=AUTH_HEADER).json()["Messages"]
    assert [m["text"] for m in messages] == ["Can I have it by Friday?", "Yes, Friday works."]
    assert messages[0]["by"] == str(lab_user_id) and messages[0]["by_username"]
    assert messages[1]["edited_at"] is None

    # One document for the whole thread.
    doc = stored_thread(client, ticket_id)
    assert len(doc["messages"]) == 2


def test_only_the_filer_and_admins_can_see_a_thread(client, db, lab_user_id):
    # Filed by the admin, so the member has no business in it.
    ticket_id = db.seed_ticket()
    post(client, ticket_id, "admin only")

    client.login(lab_user_id)
    assert client.get(thread_url(ticket_id), headers=AUTH_HEADER).status_code == 404
    assert post(client, ticket_id, "let me in").status_code == 404
    assert client.get(thread_url(999_999_999), headers=AUTH_HEADER).status_code == 404


def test_edit_and_delete_rules(client, db, lab_user_id):
    ticket_id = db.seed_ticket(created_by=lab_user_id)
    client.login(lab_user_id)
    mine = post(client, ticket_id, "typo hre").json()["Message"]["id"]
    client.as_me()
    admins = post(client, ticket_id, "noted").json()["Message"]["id"]

    # Admins cannot reword someone else's message...
    assert client.put(f"{thread_url(ticket_id)}/{mine}", json={"text": "x"}, headers=AUTH_HEADER).status_code == 403

    client.login(lab_user_id)
    edited = client.put(f"{thread_url(ticket_id)}/{mine}", json={"text": "typo here"}, headers=AUTH_HEADER)
    assert edited.status_code == 200, edited.text
    assert edited.json()["Message"]["text"] == "typo here"
    assert edited.json()["Message"]["edited_at"] is not None
    # ...and members cannot remove an admin's.
    assert client.delete(f"{thread_url(ticket_id)}/{admins}", headers=AUTH_HEADER).status_code == 403

    # ...but an admin can take down any message.
    client.as_me()
    assert client.delete(f"{thread_url(ticket_id)}/{mine}", headers=AUTH_HEADER).status_code == 200
    texts = [m["text"] for m in client.get(thread_url(ticket_id), headers=AUTH_HEADER).json()["Messages"]]
    assert texts == ["noted"]

    for bad in ("not-an-id", "0123456789abcdef01234567"):
        assert client.delete(f"{thread_url(ticket_id)}/{bad}", headers=AUTH_HEADER).status_code == 404


def test_blank_and_too_long_messages_are_refused(client, db):
    ticket_id = db.seed_ticket()

    assert post(client, ticket_id, "").status_code == 422
    assert post(client, ticket_id, "   ").status_code == 422
    assert post(client, ticket_id, "x" * (ticket_thread_service.MESSAGE_MAX + 1)).status_code == 422
    assert stored_thread(client, ticket_id) is None


def test_a_full_thread_refuses_more(client, db, monkeypatch):
    monkeypatch.setattr(ticket_thread_service, "THREAD_MAX_MESSAGES", 2)
    ticket_id = db.seed_ticket()

    assert post(client, ticket_id, "one").status_code == 201
    assert post(client, ticket_id, "two").status_code == 201
    third = post(client, ticket_id, "three")

    assert third.status_code == 409
    # Refused, not split into a second thread.
    assert len(stored_thread(client, ticket_id)["messages"]) == 2


def test_deleting_the_ticket_deletes_its_thread(client, db, lab_user_id):
    ticket_id = db.seed_ticket(created_by=lab_user_id)
    client.login(lab_user_id)
    post(client, ticket_id, "never mind")

    response = client.delete(f"/ticket/{ticket_id}", headers=AUTH_HEADER)

    assert response.status_code == 200, response.text
    assert stored_thread(client, ticket_id) is None
