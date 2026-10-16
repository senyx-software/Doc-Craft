import os
from urllib.parse import urlsplit, urlunsplit
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

# Load service-specific environment file
load_dotenv(
    dotenv_path=os.path.join(
        os.path.dirname(os.path.dirname(
            os.path.dirname(os.path.abspath(__file__)))),
        "analytics.env",
    )
)

DATABASE_URL = os.environ["DATABASE_URL"]
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Remove Prisma-only options, preserving libpq security options such as sslmode.
# SQLite URLs must not pass through urlunsplit (sqlite:// would become sqlite:).
if DATABASE_URL.startswith("postgresql://"):
    from urllib.parse import parse_qsl, urlencode
    parts = urlsplit(DATABASE_URL)
    prisma_options = {"schema", "pgbouncer", "connection_limit", "pool_timeout", "statement_cache_size"}
    query = urlencode([(key, value) for key, value in parse_qsl(parts.query) if key not in prisma_options])
    DATABASE_URL = urlunsplit((parts.scheme, parts.netloc, parts.path, query, ""))

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
