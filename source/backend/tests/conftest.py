"""Environment for every test.

The app modules read their settings at import time and raise when they are
missing, so this has to run before any `app.*` import. The real source/.env
wins when it exists; the placeholders only fill gaps so the collection still
works on a machine without one (the database tests then skip themselves).
"""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:5432/isp"
)
os.environ.setdefault("JWT_SECRET", "test-secret-" + "0" * 32)
