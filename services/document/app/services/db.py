import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from dotenv import load_dotenv

# Load service-specific environment file
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "document.env"))

DATABASE_URL = os.environ["DATABASE_URL"]
# SQLAlchemy compat fix
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    if os.getenv("DOCUMENT_RUN_MIGRATIONS","true")!="true":return
    # Import models here to register them with metadata
    from app.models.document import Document
    from app.models.custom_template import CustomTemplate
    Base.metadata.create_all(bind=engine)

    # create_all only creates missing tables — it never alters an existing
    # one, so columns added to the Document model after the table already
    # exists in the real database need an explicit, idempotent migration.
    if engine.dialect.name == "postgresql":
        with engine.begin() as conn:
            for stmt in [
                'ALTER TABLE documents ADD COLUMN IF NOT EXISTS "userEmail" VARCHAR',
                'ALTER TABLE documents ADD COLUMN IF NOT EXISTS "plan" VARCHAR NOT NULL DEFAULT \'free\'',
                'ALTER TABLE documents ADD COLUMN IF NOT EXISTS "status" VARCHAR NOT NULL DEFAULT \'pending\'',
                'ALTER TABLE documents ADD COLUMN IF NOT EXISTS "errorMessage" VARCHAR',
            ]:
                conn.exec_driver_sql(stmt)
