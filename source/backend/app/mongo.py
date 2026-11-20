"""The MongoDB side of the backend.

Postgres keeps everything relational - accounts, tasks, tickets, categories.
Mongo holds the data whose shape varies from document to document, starting
with lab equipment, where a microscope and a centrifuge share almost no fields.

Documents refer to Postgres rows by their ids (an account UUID as a string,
a ticket id as an int); there are no cross-database foreign keys, so the
backend is what keeps those references honest.
"""

import os
from collections.abc import AsyncIterator

from dotenv import load_dotenv
from fastapi import Request
from pymongo import ASCENDING, DESCENDING, TEXT, AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import CollectionInvalid, OperationFailure

# Server error code for "a collection with that name already exists".
NAMESPACE_EXISTS = 48

load_dotenv()

MONGO_URL: str | None = os.environ.get("MONGO_URL")
if not MONGO_URL:
    raise ValueError("MONGO_URL is missing from .env")

MONGO_DB = os.environ.get("MONGO_DB", "isp")

EQUIPMENT = "equipment"
NOTIFICATIONS = "notifications"

# A last line of defence under the Pydantic models: even a document written
# from mongosh has to carry these, with these types. `specs` is deliberately
# left open - its shape depends on `type`, which the API checks.
EQUIPMENT_SCHEMA = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": ["name", "type", "status", "specs", "maintenance", "created_by", "created_at"],
        "properties": {
            "name": {"bsonType": "string", "minLength": 1, "maxLength": 255},
            "type": {"enum": ["microscope", "centrifuge", "printer_3d", "other"]},
            "status": {"enum": ["available", "in_use", "maintenance", "retired"]},
            "location": {"bsonType": ["string", "null"]},
            "serial_number": {"bsonType": ["string", "null"]},
            "specs": {"bsonType": "object"},
            "maintenance": {
                "bsonType": "array",
                "items": {
                    "bsonType": "object",
                    "required": ["date", "by", "note"],
                    "properties": {
                        "date": {"bsonType": "date"},
                        "by": {"bsonType": "string"},
                        "note": {"bsonType": "string"},
                    },
                },
            },
            "created_by": {"bsonType": "string"},
            "created_at": {"bsonType": "date"},
            "updated_at": {"bsonType": ["date", "null"]},
        },
    }
}


NOTIFICATION_SCHEMA = {
    "$jsonSchema": {
        "bsonType": "object",
        "required": ["account_id", "type", "title", "actor", "read", "created_at", "expires_at"],
        "properties": {
            "account_id": {"bsonType": "string"},
            "type": {
                "enum": [
                    "task_assigned",
                    "task_status",
                    "ticket_created",
                    "ticket_status",
                    "announcement",
                ]
            },
            "title": {"bsonType": "string", "minLength": 1, "maxLength": 300},
            "body": {"bsonType": ["string", "null"]},
            "link": {"bsonType": ["string", "null"]},
            "actor": {
                "bsonType": "object",
                "required": ["id", "username"],
                "properties": {
                    "id": {"bsonType": "string"},
                    "username": {"bsonType": "string"},
                },
            },
            "read": {"bsonType": "bool"},
            "created_at": {"bsonType": "date"},
            "expires_at": {"bsonType": "date"},
        },
    }
}


def connect() -> AsyncMongoClient:
    """One client per app lifetime, made in the lifespan rather than at import:
    an async client belongs to the event loop it first runs on, and once
    closed it cannot be reopened."""
    # Lazy: nothing connects until the first operation.
    return AsyncMongoClient(MONGO_URL, tz_aware=True, serverSelectionTimeoutMS=5000)


async def getMongo(request: Request) -> AsyncIterator[AsyncDatabase]:
    """FastAPI dependency. Tests override it to point at a throwaway database."""
    yield request.app.state.mongo[MONGO_DB]


async def ensure_collection(db: AsyncDatabase, name: str, schema: dict) -> None:
    try:
        await db.create_collection(name, validator=schema)
    except (CollectionInvalid, OperationFailure) as exc:
        # CollectionInvalid: pymongo saw it already exists. NamespaceExists:
        # another worker created it between that check and ours.
        if isinstance(exc, OperationFailure) and exc.code != NAMESPACE_EXISTS:
            raise
        # Already there - bring its validator up to date instead.
        await db.command("collMod", name, validator=schema)


async def init_mongo(db: AsyncDatabase) -> None:
    """Create the collections, validators and indexes if they are missing.
    Safe to run on every start, and from several workers at once: each step is
    either idempotent or tolerates having lost the race."""

    await ensure_collection(db, EQUIPMENT, EQUIPMENT_SCHEMA)
    await ensure_collection(db, NOTIFICATIONS, NOTIFICATION_SCHEMA)

    notifications = db[NOTIFICATIONS]
    # The bell's query: one person's, unread first, newest first.
    await notifications.create_index(
        [("account_id", ASCENDING), ("read", ASCENDING), ("created_at", DESCENDING)],
        name="inbox",
    )
    # TTL: MongoDB deletes each document once expires_at has passed (checked
    # about once a minute), so old notifications clean themselves up.
    await notifications.create_index("expires_at", expireAfterSeconds=0, name="expire")

    equipment = db[EQUIPMENT]
    # A serial number identifies one physical device, so two documents may
    # not share one. Partial, so the many without one do not collide on null.
    await equipment.create_index(
        [("serial_number", ASCENDING)],
        unique=True,
        partialFilterExpression={"serial_number": {"$type": "string"}},
        name="serial_number_unique",
    )
    await equipment.create_index([("type", ASCENDING), ("status", ASCENDING)], name="type_status")
    await equipment.create_index([("name", TEXT), ("location", TEXT)], name="search_text")
