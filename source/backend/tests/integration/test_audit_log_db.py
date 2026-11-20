"""The audit log in MongoDB: what gets written, and the /audit-log endpoints.

Each test has its own throwaway Mongo database (see the client fixture), so
every entry seen here was written by that test.
"""

import datetime as dt
import uuid

from sqlalchemy import select, text

from app.migrate_audit_log import migrate
from app.model import Account, Category
from app.mongo import AUDIT_LOGS
from tests.integration.conftest import AUTH_HEADER, unique


def make_category(client, db) -> tuple[int, str]:
    name = unique()
    assert client.post("/category/", json={"name": name}, headers=AUTH_HEADER).status_code == 200
    category_id = db.scalar(select(Category.id).where(Category.name == name))
    db.track("category", category_id)
    return category_id, name


def test_one_entry_per_change_with_every_field(client, db, lab_user_id):
    response = client.post(
        "/task/",
        json={
            "name": "pytest grouped",
            "category_id": db.category_id,
            "assignees": [str(lab_user_id)],
            "due_date": (dt.datetime.now(dt.timezone.utc) + dt.timedelta(days=5)).isoformat(),
        },
        headers=AUTH_HEADER,
    )
    assert response.status_code == 200, response.text
    task_id = response.json()["Task"]["id"]
    db.track("task", task_id)

    client.put(f"/task/{task_id}", json={"name": "pytest renamed", "status": "completed"}, headers=AUTH_HEADER)

    created, updated = db.audit_entries("task", task_id)
    assert created["action"] == "created"
    assert {c["field"] for c in created["changes"]} == {
        "name", "description", "status", "category_id", "due_date", "assignees",
    }
    # Values keep their types now: a list, an int, a real date.
    by_field = {c["field"]: c["to"] for c in created["changes"]}
    assert by_field["assignees"] == [str(lab_user_id)]
    assert by_field["category_id"] == db.category_id
    assert isinstance(by_field["due_date"], dt.datetime)

    # Two fields in one PUT are one entry, not two rows.
    assert updated["action"] == "updated"
    assert [(c["field"], c["from"], c["to"]) for c in updated["changes"]] == [
        ("name", "pytest grouped", "pytest renamed"),
        ("status", "in_progress", "completed"),
    ]
    assert updated["by"] == str(db.me_id)


def test_a_rolled_back_change_is_not_logged(client, db):
    _, taken = make_category(client, db)
    other_id, _ = make_category(client, db)

    # Rename into a name that exists: the UNIQUE constraint fails at commit,
    # after the audit change was already noted.
    response = client.put(f"/category/{other_id}", json={"name": taken}, headers=AUTH_HEADER)

    assert response.status_code == 409
    assert [e["action"] for e in db.audit_entries("category", other_id)] == ["created"]


def test_equipment_changes_are_logged(client, db):
    made = client.post(
        "/equipment/",
        json={"name": "pytest scale", "type": "other", "specs": {"precision_g": 0.01}},
        headers=AUTH_HEADER,
    ).json()["Equipment"]
    client.put(f"/equipment/{made['id']}", json={"status": "in_use"}, headers=AUTH_HEADER)
    client.post(f"/equipment/{made['id']}/maintenance", json={"note": "calibrated"}, headers=AUTH_HEADER)
    client.delete(f"/equipment/{made['id']}", headers=AUTH_HEADER)

    entries = db.audit_entries("equipment", made["id"])
    assert [e["action"] for e in entries] == ["created", "updated", "updated", "deleted"]
    assert entries[1]["changes"] == [{"field": "status", "from": "available", "to": "in_use"}]
    assert entries[2]["changes"][0]["to"]["note"] == "calibrated"
    deleted = {c["field"]: c["from"] for c in entries[3]["changes"]}
    assert deleted["name"] == "pytest scale" and deleted["maintenance_entries"] == 1
    # Nested values stay documents, not their text.
    assert entries[0]["changes"][-1] == {"field": "specs", "from": None, "to": {"precision_g": 0.01}}


def test_list_endpoint_shape_and_actor_username(client, db):
    category_id, name = make_category(client, db)
    my_username = db.scalar(select(Account.username).where(Account.id == db.me_id))

    response = client.get(
        "/audit-log/",
        params={"from_table": "category", "row_id": str(category_id)},
        headers=AUTH_HEADER,
    )

    assert response.status_code == 200
    [entry] = response.json()["AuditLogs"]
    assert entry["table"] == "category"
    assert entry["action"] == "created"
    assert entry["changes"] == [{"field": "name", "from": None, "to": name}]
    assert entry["by_whom"] == str(db.me_id)
    assert entry["by_username"] == my_username


def test_list_is_newest_first_and_filters(client, db):
    first_id, _ = make_category(client, db)
    second_id, _ = make_category(client, db)

    rows = client.get("/audit-log/", params={"from_table": "category"}, headers=AUTH_HEADER).json()["AuditLogs"]
    assert [r["row_id"] for r in rows[:2]] == [str(second_id), str(first_id)]

    mine = client.get("/audit-log/", params={"by_whom": str(db.me_id)}, headers=AUTH_HEADER).json()["AuditLogs"]
    assert len(mine) >= 2
    nobody = client.get("/audit-log/", params={"by_whom": str(uuid.uuid4())}, headers=AUTH_HEADER).json()["AuditLogs"]
    assert nobody == []


def test_fetch_by_id_and_missing(client, db):
    announcement_id = db.seed_announcement(name=unique("audited"))
    client.put(f"/announcement/{announcement_id}", json={"name": "pytest edited"}, headers=AUTH_HEADER)
    entry_id = db.audit_rows("announcement", announcement_id)[0].entry_id

    one = client.get(f"/audit-log/{entry_id}", headers=AUTH_HEADER)
    assert one.status_code == 200
    assert one.json()["AuditLog"]["changes"][0]["to"] == "pytest edited"

    assert client.get("/audit-log/0123456789abcdef01234567", headers=AUTH_HEADER).status_code == 404
    assert client.get("/audit-log/not-an-id", headers=AUTH_HEADER).status_code == 404


def test_audit_log_is_admin_only(client, db, lab_user_id):
    client.login(lab_user_id)

    assert client.get("/audit-log/", headers=AUTH_HEADER).status_code == 403
    assert client.get("/audit-log/0123456789abcdef01234567", headers=AUTH_HEADER).status_code == 403


def test_old_postgres_table_is_moved_and_dropped(client, db):
    """The startup migration, on a stand-in table built the old way."""
    at = dt.datetime(2026, 1, 2, 3, 4, 5, tzinfo=dt.timezone.utc)

    async def build():
        async with db.session() as s:
            await s.execute(text(
                "CREATE TABLE audit_log (id bigserial PRIMARY KEY, from_table varchar(64), "
                "row_id varchar(36), column_name varchar(64), old_value text, new_value text, "
                "by_whom uuid, occurred_at timestamptz)"
            ))
            await s.execute(
                text(
                    "INSERT INTO audit_log (from_table, row_id, column_name, old_value, new_value, by_whom, occurred_at) VALUES "
                    "('task', '7', 'name', 'a', 'b', :me, :at), "
                    "('task', '7', 'status', 'in_progress', 'completed', :me, :at), "
                    "('account', 'x', 'created', NULL, 'newbie', NULL, :at)"
                ),
                {"me": db.me_id, "at": at},
            )
            await s.commit()

    async def table_exists():
        async with db.session() as s:
            return await s.scalar(text("SELECT to_regclass('public.audit_log')")) is not None

    db.run(build)
    try:
        moved = db.run(migrate, client.mongo)
    finally:
        if db.run(table_exists):
            async def drop():
                async with db.session() as s:
                    await s.execute(text("DROP TABLE audit_log"))
                    await s.commit()
            db.run(drop)

    assert moved == 3
    assert not db.run(table_exists)

    task_entry = db.audit_entries("task", "7")
    assert len(task_entry) == 1
    assert task_entry[0]["action"] == "updated" and task_entry[0]["migrated"] is True
    assert [c["field"] for c in task_entry[0]["changes"]] == ["name", "status"]

    [account_entry] = db.audit_entries("account", "x")
    assert account_entry["action"] == "created"
    assert account_entry["changes"] == [{"field": "username", "from": None, "to": "newbie"}]
    assert account_entry["by"] is None

    # A second run finds nothing to do.
    assert db.run(migrate, client.mongo) == 0
