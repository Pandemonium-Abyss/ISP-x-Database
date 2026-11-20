import os
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from pymongo.asynchronous.database import AsyncDatabase

from app.database import create_tables, engine, getSession
from app.migrate_audit_log import migrate as migrate_audit_log
from app.mongo import MONGO_DB, connect as connect_mongo, getMongo, init_mongo
from app.routers.account import accountRouter
from app.routers.announcement import announcementRouter
from app.routers.audit_log import auditLogRouter
from app.routers.auth import authRouter
from app.routers.category import categoryRouter
from app.routers.equipment import equipmentRouter
from app.routers.notification import notificationRouter
from app.routers.task import taskRouter
from app.routers.ticket import ticketRouter

@asynccontextmanager
async def lifespan(app: FastAPI):
    # The database is ours to set up now rather than Supabase's, and a fresh
    # one starts empty. create_all only adds what is missing, so this is a
    # no-op on every start after the first.
    await create_tables()
    app.state.mongo = connect_mongo()
    await init_mongo(app.state.mongo[MONGO_DB])
    # One-off: an audit_log table from before the move to Mongo is copied
    # over and dropped. A no-op once it is gone.
    await migrate_audit_log(app.state.mongo[MONGO_DB])
    yield
    await engine.dispose()
    await app.state.mongo.close()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", tags=["Systems"])
def check_health():
    return {"Ok"}

@app.get("/db", tags=["Systems"])
async def check_db(session: Annotated[AsyncSession, Depends(getSession)]):
    # A round trip through the pool, which is what this is really checking.
    if await session.scalar(text("SELECT 1")) == 1:
        return {"Ok"}
    else:
        return {"Not Ok"}

@app.get("/mongo", tags=["Systems"])
async def check_mongo(db: Annotated[AsyncDatabase, Depends(getMongo)]):
    if (await db.command("ping")).get("ok") == 1:
        return {"Ok"}
    else:
        return {"Not Ok"}

app.include_router(authRouter)
app.include_router(ticketRouter)
app.include_router(accountRouter)
app.include_router(categoryRouter)
app.include_router(announcementRouter)
app.include_router(taskRouter)
app.include_router(equipmentRouter)
app.include_router(notificationRouter)
app.include_router(auditLogRouter)
