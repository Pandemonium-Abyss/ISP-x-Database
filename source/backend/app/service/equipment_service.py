"""Lab equipment, stored in MongoDB.

Each item has a handful of common fields plus `specs`, whose shape depends on
`type` - which is the reason this lives in a document store rather than as a
table full of nullable columns. Maintenance history is embedded in the item,
since it is always read together with it and never on its own.
"""

import enum
import uuid
from datetime import date as Date, datetime, timezone
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.limits import DESCRIPTION_MAX, Name
from app.mongo import EQUIPMENT


class EquipmentType(str, enum.Enum):
    MICROSCOPE = "microscope"
    CENTRIFUGE = "centrifuge"
    PRINTER_3D = "printer_3d"
    OTHER = "other"


class EquipmentStatus(str, enum.Enum):
    AVAILABLE = "available"
    IN_USE = "in_use"
    MAINTENANCE = "maintenance"
    RETIRED = "retired"


# ---- specs, one model per type ----
# extra="forbid" so a typo such as "max_rmp" is a 422, not a silently stored
# field nobody ever reads back.

class _Specs(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MicroscopeSpecs(_Specs):
    kind: str = Field(min_length=1, max_length=50)  # optical, electron, ...
    max_magnification: int = Field(gt=0)
    camera: bool = False


class CentrifugeSpecs(_Specs):
    max_rpm: int = Field(gt=0)
    rotor: str = Field(min_length=1, max_length=50)
    capacity_ml: float = Field(gt=0)
    refrigerated: bool = False


class Printer3DSpecs(_Specs):
    technology: str = Field(min_length=1, max_length=50)  # FDM, SLA, ...
    build_volume_mm: tuple[int, int, int]
    materials: list[str] = Field(default_factory=list, max_length=20)


SPECS_BY_TYPE: dict[EquipmentType, type[_Specs] | None] = {
    EquipmentType.MICROSCOPE: MicroscopeSpecs,
    EquipmentType.CENTRIFUGE: CentrifugeSpecs,
    EquipmentType.PRINTER_3D: Printer3DSpecs,
    # Anything else the lab owns: free-form, but still an object.
    EquipmentType.OTHER: None,
}


def validate_specs(kind: EquipmentType, specs: dict[str, Any]) -> dict[str, Any]:
    model = SPECS_BY_TYPE[kind]
    if model is None:
        return specs
    try:
        return model.model_validate(specs).model_dump(mode="json")
    except ValidationError as exc:
        # Same shape FastAPI uses for its own 422s, with the path under specs.
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=[
                {**err, "loc": ["body", "specs", *err["loc"]]}
                for err in exc.errors(include_url=False, include_context=False)
            ],
        ) from exc


# ---- request bodies ----

class EquipmentCreate(BaseModel):
    name: Name
    type: EquipmentType
    status: EquipmentStatus = EquipmentStatus.AVAILABLE
    location: str | None = Field(default=None, max_length=255)
    serial_number: str | None = Field(default=None, min_length=1, max_length=100)
    specs: dict[str, Any] = Field(default_factory=dict)


class EquipmentUpdate(BaseModel):
    """Every field optional; only the ones sent are written. `type` is not
    here on purpose - changing it would orphan the specs, so make a new item."""

    name: Name | None = None
    status: EquipmentStatus | None = None
    location: str | None = Field(default=None, max_length=255)
    serial_number: str | None = Field(default=None, min_length=1, max_length=100)
    specs: dict[str, Any] | None = None


class MaintenanceEntry(BaseModel):
    note: str = Field(min_length=1, max_length=DESCRIPTION_MAX)
    # Defaults to today; a past date records work done earlier.
    date: Date | None = None


# ---- helpers ----

SERIAL_TAKEN = HTTPException(
    status_code=status.HTTP_409_CONFLICT,
    detail="Another item already has that serial number",
)


def parse_id(equipment_id: str) -> ObjectId:
    try:
        return ObjectId(equipment_id)
    except InvalidId as exc:
        # Not a 422: from the caller's side it is just an id that matches nothing.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Equipment with id {equipment_id} not found",
        ) from exc


def serialize(doc: dict[str, Any]) -> dict[str, Any]:
    """ObjectId is not JSON; everything else pymongo hands back already is."""
    return {"id": str(doc["_id"]), **{k: v for k, v in doc.items() if k != "_id"}}


async def get_or_404(db: AsyncDatabase, equipment_id: str) -> dict[str, Any]:
    doc = await db[EQUIPMENT].find_one({"_id": parse_id(equipment_id)})
    if doc is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Equipment with id {equipment_id} not found",
        )
    return doc


def now() -> datetime:
    return datetime.now(timezone.utc)


# ---- operations ----

async def list_equipment(
    db: AsyncDatabase,
    *,
    type: EquipmentType | None,
    status: EquipmentStatus | None,
    search: str | None,
    offset: int,
    limit: int,
) -> dict[str, Any]:
    query: dict[str, Any] = {}
    if type is not None:
        query["type"] = type.value
    if status is not None:
        query["status"] = status.value
    if search and search.strip():
        query["$text"] = {"$search": search.strip()}

    collection = db[EQUIPMENT]
    total = await collection.count_documents(query)
    # The maintenance log can grow without bound and a list never shows it.
    cursor = (
        collection.find(query, {"maintenance": 0})
        .sort([("name", 1), ("_id", 1)])
        .skip(offset)
        .limit(limit)
    )
    return {"Equipment": [serialize(doc) async for doc in cursor], "Total": total}


async def create_equipment(db: AsyncDatabase, body: EquipmentCreate, by: uuid.UUID) -> dict[str, Any]:
    doc = {
        "name": body.name,
        "type": body.type.value,
        "status": body.status.value,
        "location": body.location,
        "serial_number": body.serial_number,
        "specs": validate_specs(body.type, body.specs),
        "maintenance": [],
        "created_by": str(by),
        "created_at": now(),
        "updated_at": None,
    }
    try:
        result = await db[EQUIPMENT].insert_one(doc)
    except DuplicateKeyError as exc:
        raise SERIAL_TAKEN from exc
    doc["_id"] = result.inserted_id
    return serialize(doc)


async def update_equipment(db: AsyncDatabase, equipment_id: str, body: EquipmentUpdate) -> dict[str, Any]:
    current = await get_or_404(db, equipment_id)
    sent = body.model_fields_set
    changes: dict[str, Any] = {}

    if "name" in sent and body.name is not None:
        changes["name"] = body.name
    if "status" in sent and body.status is not None:
        changes["status"] = body.status.value
    # These two may be sent as null to clear them.
    if "location" in sent:
        changes["location"] = body.location
    if "serial_number" in sent:
        changes["serial_number"] = body.serial_number
    if "specs" in sent and body.specs is not None:
        changes["specs"] = validate_specs(EquipmentType(current["type"]), body.specs)

    changes = {k: v for k, v in changes.items() if current.get(k) != v}
    if not changes:
        return serialize(current)

    changes["updated_at"] = now()
    try:
        updated = await db[EQUIPMENT].find_one_and_update(
            {"_id": current["_id"]},
            {"$set": changes},
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError as exc:
        raise SERIAL_TAKEN from exc
    if updated is None:
        # Deleted between the read and the write.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Equipment with id {equipment_id} not found")
    return serialize(updated)


async def add_maintenance(
    db: AsyncDatabase, equipment_id: str, body: MaintenanceEntry, by: uuid.UUID
) -> dict[str, Any]:
    day = body.date or now().date()
    entry = {
        # BSON has no date-only type, so midnight UTC stands in for the day.
        "date": datetime(day.year, day.month, day.day, tzinfo=timezone.utc),
        "by": str(by),
        "note": body.note.strip(),
    }
    updated = await db[EQUIPMENT].find_one_and_update(
        {"_id": parse_id(equipment_id)},
        # Newest first, which is how it is always read.
        {"$push": {"maintenance": {"$each": [entry], "$position": 0}}, "$set": {"updated_at": now()}},
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Equipment with id {equipment_id} not found")
    return serialize(updated)


async def delete_equipment(db: AsyncDatabase, equipment_id: str) -> str:
    doc = await db[EQUIPMENT].find_one_and_delete({"_id": parse_id(equipment_id)}, {"name": 1})
    if doc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Equipment with id {equipment_id} not found")
    return doc["name"]
