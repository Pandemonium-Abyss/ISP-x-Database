"""Create (or recover) the Lab Owner login.

The first account used to be made in the Supabase dashboard, which there no
longer is: every other way of creating a member goes through POST
/account/admin, which already needs an admin to call it. This is the way in.

    uv run python -m app.create_owner --username owner --email owner@lab.test

The password is read from the OWNER_PASSWORD environment variable, or asked
for on the terminal. Run it again with the same email to reset that password
and put the account back to an active Lab Owner, which is the only way back in
if the owner forgets it.
"""

import argparse
import asyncio
import getpass
import os
import sys

from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy import func, select

from app.database import SessionLocal, create_tables
from app.model import Account, AccountRole, AuthUser
from app.security import hash_password


async def create_owner(username: str, email: str, password: str) -> str:
    """What happened, as a line to print."""
    await create_tables()

    async with SessionLocal() as session:
        login = await session.scalar(
            select(AuthUser).where(func.lower(AuthUser.email) == email)
        )

        if login is None:
            login = AuthUser(email=email, encrypted_password=hash_password(password))
            session.add(login)
            await session.flush()  # for the id the account row points at
            session.add(
                Account(
                    id=login.id,
                    username=username,
                    email=email,
                    role=AccountRole.LAB_OWNER,
                )
            )
            await session.commit()
            return f"Created {username} <{email}> as Lab Owner"

        login.encrypted_password = hash_password(password)
        account = await session.get(Account, login.id)

        if account is None:
            # A login whose account row was never claimed or has been deleted.
            session.add(
                Account(
                    id=login.id,
                    username=username,
                    email=email,
                    role=AccountRole.LAB_OWNER,
                )
            )
            await session.commit()
            return f"Reset the password for <{email}> and gave it a Lab Owner account"

        account.role = AccountRole.LAB_OWNER
        account.active = True
        await session.commit()
        return (
            f"Reset the password for {account.username} <{email}>, "
            "now an active Lab Owner"
        )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", default=os.environ.get("OWNER_USERNAME", "owner"))
    parser.add_argument("--email", default=os.environ.get("OWNER_EMAIL"))
    args = parser.parse_args()

    if not args.email:
        parser.error("--email is required (or set OWNER_EMAIL)")

    # The same check POST /auth/login puts the address through, so a login
    # that cannot be used is refused here rather than at the login page.
    try:
        TypeAdapter(EmailStr).validate_python(args.email)
    except ValidationError as exc:
        print(f"{args.email} is not an address you could sign in with:", file=sys.stderr)
        print(f"  {exc.errors()[0]['msg']}", file=sys.stderr)
        return 1

    password = os.environ.get("OWNER_PASSWORD") or getpass.getpass("Password: ")
    if len(password) < 8:
        print("The password has to be at least 8 characters", file=sys.stderr)
        return 1

    print(
        asyncio.run(
            create_owner(args.username.strip(), args.email.strip().lower(), password)
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
