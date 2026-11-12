import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import getSession
from app.model import AuthUser
from app.security import create_access_token, password_matches

# No router level dependency here: this is where a token comes from, so it is
# the one place that cannot already require one.
authRouter = APIRouter(prefix="/auth", tags=["Auth"])


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    user_id: uuid.UUID
    email: EmailStr


# One wording for an unknown address and for a wrong password, so the response
# cannot be used to find out which addresses have logins.
INVALID_CREDENTIALS = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Incorrect email or password",
    headers={"WWW-Authenticate": "Bearer"},
)


@authRouter.post("/login")
async def login(
    body: LoginRequest,
    session: Annotated[AsyncSession, Depends(getSession)],
) -> LoginResponse:
    """Exchange an email and password for a bearer token.

    A deactivated account still gets one: the token only says who is calling,
    and `get_current_account` is what turns them away, with a 403 the frontend
    shows as "your account has been deactivated" rather than a wrong password."""
    email = body.email.strip().lower()

    login = await session.scalar(
        select(AuthUser).where(func.lower(AuthUser.email) == email)
    )
    # password_matches compares against a dummy hash when there is no row, so
    # an unknown address costs the same time as a wrong password.
    if not password_matches(
        body.password, login.encrypted_password if login else None
    ):
        raise INVALID_CREDENTIALS

    token, expires_in = create_access_token(login.id, login.email)

    return LoginResponse(
        access_token=token,
        expires_in=expires_in,
        user_id=login.id,
        email=login.email,
    )
