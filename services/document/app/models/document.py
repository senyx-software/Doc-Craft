import uuid
from sqlalchemy import Column, String, DateTime, JSON, Index, func
from app.services.db import Base

class Document(Base):
    __tablename__ = "documents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(String, nullable=False, index=True)
    userEmail = Column(String, nullable=True)
    plan = Column(String, nullable=False, server_default="free")
    documentType = Column(String, nullable=False)  # invoice, quotation, proposal, receipt, purchaseOrder
    templateId = Column(String, nullable=False)    # classic, modern, minimal
    title = Column(String, nullable=False)
    slots = Column(JSON, nullable=False)           # filled template slots data
    status = Column(String, nullable=False, server_default="pending")  # pending | success | failed
    errorMessage = Column(String, nullable=True)
    pdfKey = Column(String, nullable=False)         # Supabase Storage path / key or local filename
    shareToken = Column(String, nullable=True, unique=True, index=True)
    shareExpiresAt = Column(DateTime, nullable=True)
    createdAt = Column(DateTime, server_default=func.now(), nullable=False)
    updatedAt = Column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_documents_user_id", "userId"),
        Index("ix_documents_share_token", "shareToken"),
    )
