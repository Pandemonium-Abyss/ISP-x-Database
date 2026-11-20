import logging
import uuid
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import getSession
from app.model import Account, AccountRole, AuthUser
from app.service.audit_service import record
from app.security import TokenUser, decode_access_token, hash_password, password_matches

logger = logging.getLogger(__name__)

bearer_scheme = HTTPBearer(auto_error=False, description="Access token from POST /auth/login")

UNAUTHENTICATED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)

def get_current_auth_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> TokenUser:
    """Who the token says is calling. Signature and expiry only - whether that
    user still exists, and whether they are still allowed in, is
    `get_current_account`'s job."""
    if credentials is None:
        raise UNAUTHENTICATED
    try:
        return decode_access_token(credentials.credentials)
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


ADMIN_ROLES = frozenset({AccountRole.LAB_OWNER, AccountRole.LAB_ADMIN})


def is_admin(account: Account) -> bool:
    return account.role in ADMIN_ROLES


async def get_current_account(
    auth_user: Annotated[TokenUser, Depends(get_current_auth_user)],
    session: Annotated[AsyncSession, Depends(getSession)],
) -> Account:
    """The account row behind the logged in user, so we can read their role.

    This is also where a deactivated account is turned away. Every endpoint
    that needs to know who is calling depends on this, so gating it here keeps
    an inactive member out of the whole lab rather than one route at a time."""
    account = await session.get(Account, auth_user.id)
    if account is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    if not account.active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "This account is deactivated. Ask a Lab Owner or Lab Admin to "
                "turn it back on."
            ),
        )
    return account

async def require_admin(
    me: Annotated[Account, Depends(get_current_account)],
) -> Account:
    """Gate for the admin only endpoints. Returns the caller so handlers can use it."""
    if not is_admin(me):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only a Lab Owner or Lab Admin can do this",
        )
    return me


async def get_account_or_404(session: AsyncSession, account_id: uuid.UUID) -> Account:
    account = await session.get(Account, account_id)
    if account is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Account with id {account_id} not found",
        )
    return account


def audit_account(
    session: AsyncSession,
    account_id: uuid.UUID,
    column: str,
    old_value: object,
    new_value: object,
    by_whom: uuid.UUID,
) -> None:
    """One field of an account change. "created" and "deleted" are not
    fields: they mark the whole entry, with the username as what it is about."""
    if column in ("created", "deleted"):
        record(session, "account", account_id, "username", old_value, new_value, by_whom, action=column)
    else:
        record(session, "account", account_id, column, old_value, new_value, by_whom)


# Which constraint failed -> what actually went wrong. Reporting every
# IntegrityError as a username clash hid a duplicate primary key behind a
# message about a username that was never taken, so name the real one.
ACCOUNT_CONFLICTS = {
    "account_username_key": "That username is already taken",
    "account_email_key": "That email address is already taken",
    "auth_users_email_key": "That email address is already taken",
    "account_pkey": "An account already exists for that login",
    "account_quota_check": "Quota cannot be negative",
    "account_id_fkey": "There is no login behind that account id",
}


def account_conflict(exc: IntegrityError, fallback: str) -> HTTPException:
    """A 409 that says which constraint the insert or update actually tripped.
    asyncpg hands us the constraint name; anything we do not recognise keeps
    the caller's own wording."""
    constraint = getattr(exc.orig, "constraint_name", None)
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=ACCOUNT_CONFLICTS.get(constraint, fallback),
    )


STALE_LOGIN = (
    "{email} is still registered to a login in auth.users with no account "
    "behind it. Delete that row, or use another address."
)


async def auth_login_for_email(session: AsyncSession, email: str) -> uuid.UUID | None:
    """The auth.users id holding an address, if one does.

    The account table only mirrors the login, so an address can be free there
    and still taken here - a user who signed up but never claimed an account
    row holds their email either way. Reading auth.users lets us say so."""
    return await session.scalar(
        select(AuthUser.id).where(func.lower(AuthUser.email) == email)
    )


async def assert_login_available(
    session: AsyncSession, username: str, email: str
) -> None:
    """Checked up front so the clash comes back as our own 409 rather than as
    whichever unique constraint the insert happened to hit first."""
    clash = await session.scalar(
        select(Account).where(
            or_(Account.username == username, Account.email == email)
        )
    )
    if clash is None:
        if await auth_login_for_email(session, email) is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=STALE_LOGIN.format(email=email),
            )
        return

    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=(
            "That username is already taken"
            if clash.username == username
            else f"{email} already belongs to {clash.username}"
        ),
    )


async def create_auth_user(
    session: AsyncSession, email: str, password: str
) -> uuid.UUID:
    """The login half of creating a member, added to the caller's session.

    It commits with the account row rather than before it, so the two can no
    longer end up disagreeing: there is no second system left to undo by hand
    when the insert after this one fails."""
    login = AuthUser(
        id=uuid.uuid4(), email=email, encrypted_password=hash_password(password)
    )
    session.add(login)

    try:
        # Flushed, not committed. The account row that follows points at this
        # id with a foreign key, and nothing tells the ORM that these two go
        # in that order, so the login is sent now and the whole transaction
        # still stands or falls together.
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        raise account_conflict(exc, "That email address is already taken") from exc

    return login.id


async def delete_auth_user(session: AsyncSession, user_id: uuid.UUID) -> None:
    """Dropping the login is what removes the account row with it -
    account.id is ON DELETE CASCADE from auth.users - and it frees the email
    address for reuse, which deleting only the mirror would not."""
    await session.execute(delete(AuthUser).where(AuthUser.id == user_id))


WRONG_PASSWORD = HTTPException(
    status_code=status.HTTP_403_FORBIDDEN,
    detail="That is not your current password",
)


async def verify_password(session: AsyncSession, email: str, password: str) -> None:
    """Confirms a password against auth.users without signing anybody in, so
    checking one no longer costs a round trip and a session to throw away."""
    stored = await session.scalar(
        select(AuthUser.encrypted_password).where(func.lower(AuthUser.email) == email)
    )
    if not password_matches(password, stored):
        raise WRONG_PASSWORD


async def get_auth_user_or_502(session: AsyncSession, user_id: uuid.UUID) -> AuthUser:
    """The login row behind an account that is already known to exist. Missing
    means the foreign key let us down, which is ours to fix, not the caller's."""
    login = await session.get(AuthUser, user_id)
    if login is None:
        logger.error("Account %s has no row in auth.users", user_id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The login behind that account is missing",
        )
    return login


async def set_auth_email(session: AsyncSession, user_id: uuid.UUID, email: str) -> None:
    """Points the login at a different address. The account row mirrors it, and
    the caller commits both together."""
    login = await get_auth_user_or_502(session, user_id)
    login.email = email


async def set_auth_password(
    session: AsyncSession, user_id: uuid.UUID, password: str
) -> None:
    """Nothing is revoked, so nobody with a live token is bounced to the login
    page - the same way a password change behaved under Supabase."""
    login = await get_auth_user_or_502(session, user_id)
    login.encrypted_password = hash_password(password)


async def assert_email_available(
    session: AsyncSession, email: str, account_id: uuid.UUID
) -> None:
    """Checked before anything is written, so the clash is reported in the
    caller's own words rather than as a bare unique violation."""
    clash = await session.scalar(
        select(Account).where(Account.email == email, Account.id != account_id)
    )
    if clash is None:
        # Their own id coming back means the login already holds the address
        # and only the mirror is behind, which is the one case worth going
        # ahead on.
        holder = await auth_login_for_email(session, email)
        if holder is not None and holder != account_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=STALE_LOGIN.format(email=email),
            )
        return

    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail=f"{email} already belongs to {clash.username}",
    )


# Lab Owner outranks Lab Admin outranks Lab User.
ROLE_RANK = {
    AccountRole.LAB_USER: 0,
    AccountRole.LAB_ADMIN: 1,
    AccountRole.LAB_OWNER: 2,
}


def outranks(actor: Account, target: Account) -> bool:
    return ROLE_RANK[actor.role] > ROLE_RANK[target.role]


def assert_can_manage(me: Account, target: Account, action: str) -> None:
    if not is_admin(me) or not outranks(me, target):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Only someone above {target.role.value} can {action}",
        )


async def resolve_login_target(
    session: AsyncSession, me: Account, account_id: uuid.UUID
) -> Account:
    """Your own login, or one belonging to somebody you outrank."""
    if account_id == me.id:
        return me

    target = await get_account_or_404(session, account_id)
    assert_can_manage(me, target, "reset that login. Your own is always yours to change")
    return target
