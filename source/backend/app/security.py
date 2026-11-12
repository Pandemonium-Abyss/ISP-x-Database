"""Password hashing and access tokens.

Both of these used to be Supabase's job. The login now lives in `auth.users`
in our own PostgreSQL database, so the hashing and the token signing happen
here instead.
"""

import datetime as dt
import os
import uuid
from dataclasses import dataclass

import bcrypt
import jwt
from dotenv import load_dotenv

load_dotenv()

JWT_SECRET: str | None = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    raise ValueError("JWT_SECRET is missing from .env")

# HS256 signs with this key and nothing else, so a guessable one is a way in.
# 32 bytes is the length RFC 7518 asks for; `openssl rand -hex 32` gives one.
JWT_SECRET_MIN_LENGTH = 32
if len(JWT_SECRET) < JWT_SECRET_MIN_LENGTH:
    raise ValueError(
        f"JWT_SECRET is only {len(JWT_SECRET)} characters. Use at least "
        f"{JWT_SECRET_MIN_LENGTH} - run `openssl rand -hex 32` for one."
    )

JWT_ALGORITHM = "HS256"

# How long a login lasts. There are no refresh tokens: when this runs out the
# frontend sends them back to /auth to sign in again.
ACCESS_TOKEN_TTL_MINUTES = int(os.environ.get("ACCESS_TOKEN_TTL_MINUTES", "720"))

# bcrypt hashes at most 72 bytes and silently drops the rest, which is where
# the password ceiling in the account router comes from.
PASSWORD_MAX_BYTES = 72


@dataclass(frozen=True)
class TokenUser:
    """Who the bearer token says is calling - the same two fields the Supabase
    user object was ever read for, so the routers did not have to change."""

    id: str
    email: str | None = None


def hash_password(password: str) -> str:
    return bcrypt.hashpw(
        password.encode()[:PASSWORD_MAX_BYTES], bcrypt.gensalt()
    ).decode()


# Compared against when the address is unknown, so a wrong email and a wrong
# password take the same time to refuse. The value is a real bcrypt hash of a
# passphrase nobody holds.
DUMMY_HASH = hash_password(uuid.uuid4().hex)


def password_matches(password: str, hashed: str | None) -> bool:
    try:
        return bcrypt.checkpw(
            password.encode()[:PASSWORD_MAX_BYTES],
            (hashed or DUMMY_HASH).encode(),
        )
    except ValueError:
        # A stored value that is not a bcrypt hash at all. Nobody can sign in
        # with it, which is the right answer, not a 500.
        return False


def create_access_token(user_id: uuid.UUID, email: str) -> tuple[str, int]:
    """The signed token and how many seconds it is good for."""
    expires_in = ACCESS_TOKEN_TTL_MINUTES * 60
    now = dt.datetime.now(dt.timezone.utc)
    token = jwt.encode(
        {
            "sub": str(user_id),
            "email": email,
            "iat": now,
            "exp": now + dt.timedelta(seconds=expires_in),
        },
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )
    return token, expires_in


def decode_access_token(token: str) -> TokenUser:
    """Raises `jwt.PyJWTError` on anything the caller should be turned away
    for - a bad signature, an expired token, a payload without a subject."""
    payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])

    subject = payload.get("sub")
    if not subject:
        raise jwt.InvalidTokenError("Token has no subject")

    return TokenUser(id=subject, email=payload.get("email"))
