"""Move the old Postgres audit_log table into MongoDB, then drop it.

Runs on every startup and does nothing once the table is gone. Rows are
grouped the way new entries are: everything one person changed on one record
at one instant becomes a single document.

The copy happens before the drop, inside one Postgres transaction: if the
Mongo insert fails, the transaction rolls back and the table stays where it
is, to be tried again on the next start. Nothing is ever lost.

    uv run python -m app.migrate_audit_log    # run it by hand
"""

import asyncio
import logging
from collections import OrderedDict
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase
from sqlalchemy import text

from app.database import engine
from app.mongo import AUDIT_LOGS

log = logging.getLogger(__name__)

# Different from create_tables' key, same idea: several workers start at
# once, and only one of them should move the rows.
MIGRATE_LOCK = 72_201_002


def to_docs(rows: list[Any]) -> list[dict[str, Any]]:
    groups: "OrderedDict[tuple, list[Any]]" = OrderedDict()
    for row in rows:
        key = (row.from_table, row.row_id, row.by_whom, row.occurred_at)
        groups.setdefault(key, []).append(row)

    docs = []
    for (table, row_id, by, at), group in groups.items():
        changes = []
        action = None
        for row in group:
            # Accounts marked creation and deletion with a pseudo column
            # holding the username, which is now the entry's action.
            if row.column_name in ("created", "deleted"):
                action = row.column_name
                changes.append({"field": "username", "from": row.old_value, "to": row.new_value})
            else:
                changes.append({"field": row.column_name, "from": row.old_value, "to": row.new_value})
        if action is None:
            if all(c["from"] is None for c in changes) and any(c["to"] is not None for c in changes):
                action = "created"
            elif all(c["to"] is None for c in changes) and any(c["from"] is not None for c in changes):
                action = "deleted"
            else:
                action = "updated"
        docs.append(
            {
                "table": table,
                "row_id": str(row_id),
                "action": action,
                "changes": changes,
                "by": str(by) if by is not None else None,
                "at": at,
                # Old values were stored as text, so they stay text.
                "migrated": True,
            }
        )
    return docs


async def migrate(db: AsyncDatabase) -> int:
    """Copy and drop. Returns how many old rows were moved (0 = nothing to do)."""
    async with engine.begin() as conn:
        await conn.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": MIGRATE_LOCK})
        if await conn.scalar(text("SELECT to_regclass('public.audit_log')")) is None:
            return 0

        rows = (
            await conn.execute(
                text(
                    "SELECT from_table, row_id, column_name, old_value, new_value, "
                    "by_whom, occurred_at FROM audit_log ORDER BY occurred_at, id"
                )
            )
        ).all()

        docs = to_docs(rows)
        if docs:
            # Raises on failure, which rolls back and keeps the table.
            await db[AUDIT_LOGS].insert_many(docs, ordered=True)

        await conn.execute(text("DROP TABLE audit_log"))

    log.warning("Moved %d audit_log rows (%d entries) to MongoDB and dropped the table", len(rows), len(docs))
    return len(rows)


if __name__ == "__main__":
    from app.mongo import MONGO_DB, connect, init_mongo

    async def main() -> None:
        client = connect()
        try:
            db = client[MONGO_DB]
            await init_mongo(db)
            moved = await migrate(db)
            print(f"Moved {moved} rows" if moved else "Nothing to move: audit_log is already gone")
        finally:
            await client.close()
            await engine.dispose()

    asyncio.run(main())
