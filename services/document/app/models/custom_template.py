import uuid
from sqlalchemy import Column, String, Integer, DateTime, JSON, Index, func
from app.services.db import Base

class CustomTemplate(Base):
    __tablename__ = "custom_templates"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    userId = Column(String, nullable=False, index=True)
    documentType = Column(String, nullable=False)  # invoice, quotation, proposal, receipt, purchaseOrder
    name = Column(String, nullable=False)
    # Static snapshot of the Builder canvas at save time — a literal
    # InvoiceElement[] array (positions/text/styles as they were), not a
    # data-bound generator like the built-in templates. Selecting it later
    # loads this exact layout; text fields don't auto-refill with new data.
    canvasElements = Column(JSON, nullable=False)
    pageWidth = Column(Integer, nullable=True)
    pageHeight = Column(Integer, nullable=True)
    pageBackgroundColor = Column(String, nullable=True)
    createdAt = Column(DateTime, server_default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_custom_templates_user_id", "userId"),
    )
