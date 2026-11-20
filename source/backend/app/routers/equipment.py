from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pymongo.asynchronous.database import AsyncDatabase

from app.model import Account
from app.mongo import getMongo
from app.service import account_service, equipment_service
from app.service.equipment_service import (
    EquipmentCreate,
    EquipmentStatus,
    EquipmentType,
    EquipmentUpdate,
    MaintenanceEntry,
)

# Everyone signed in can see the equipment; only admins change it.
equipmentRouter = APIRouter(
    prefix="/equipment", dependencies=[Depends(account_service.get_current_account)]
)

Mongo = Annotated[AsyncDatabase, Depends(getMongo)]
Admin = Annotated[Account, Depends(account_service.require_admin)]


@equipmentRouter.get("/", tags=["Equipment"])
async def list_equipment(
    db: Mongo,
    type: EquipmentType | None = None,
    status: EquipmentStatus | None = None,
    search: str | None = Query(default=None, max_length=100),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
):
    return await equipment_service.list_equipment(
        db, type=type, status=status, search=search, offset=offset, limit=limit
    )


@equipmentRouter.get("/{equipment_id}", tags=["Equipment"])
async def retrieve_equipment(equipment_id: str, db: Mongo):
    doc = await equipment_service.get_or_404(db, equipment_id)
    return {"Equipment": equipment_service.serialize(doc)}


@equipmentRouter.post("/", tags=["Equipment"], status_code=status.HTTP_201_CREATED)
async def create_equipment(body: EquipmentCreate, db: Mongo, me: Admin):
    return {"Equipment": await equipment_service.create_equipment(db, body, me.id)}


@equipmentRouter.put("/{equipment_id}", tags=["Equipment"])
async def update_equipment(equipment_id: str, body: EquipmentUpdate, db: Mongo, me: Admin):
    return {"Equipment": await equipment_service.update_equipment(db, equipment_id, body, me.id)}


@equipmentRouter.post(
    "/{equipment_id}/maintenance", tags=["Equipment"], status_code=status.HTTP_201_CREATED
)
async def add_maintenance(equipment_id: str, body: MaintenanceEntry, db: Mongo, me: Admin):
    return {"Equipment": await equipment_service.add_maintenance(db, equipment_id, body, me.id)}


@equipmentRouter.delete("/{equipment_id}", tags=["Equipment"])
async def delete_equipment(equipment_id: str, db: Mongo, me: Admin):
    name = await equipment_service.delete_equipment(db, equipment_id, me.id)
    return {"Message": f"Deleted {name}"}
