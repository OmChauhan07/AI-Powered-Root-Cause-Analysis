import os
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session
from app.database.session import get_db, SessionLocal
from app.models.investigation import Investigation, SourceDocument
from app.schemas.document import (
    TextIntakeRequest,
    EmailIntakeRequest,
    DocumentUploadResponse,
    NormalizedSource,
)
from app.services.document_parser import (
    parse_pdf_bytes,
    parse_pasted_text,
    parse_email_text,
    parse_eml_bytes,
    save_uploaded_file,
    compute_sha256,
)

router = APIRouter(prefix="/investigations", tags=["Document Intake & Normalization"])

MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20 Megabytes limit
ALLOWED_EXTENSIONS = {".pdf", ".eml", ".txt"}


def get_or_create_investigation(investigation_id: str, db: Session) -> Investigation:
    """Finds existing investigation or creates a transient draft if missing."""
    inv = db.query(Investigation).filter(Investigation.id == investigation_id).first()
    if not inv:
        inv = Investigation(
            id=investigation_id,
            reference_code=f"RCA-{uuid.uuid4().hex[:6].upper()}",
            title="Active Incident Investigation Draft",
            status="draft",
        )
        db.add(inv)
        db.commit()
        db.refresh(inv)
    return inv


@router.post(
    "",
    summary="Create New Investigation Draft",
    description="Initializes a new RCA investigation shell.",
)
async def create_investigation(
    title: str = "New Incident Investigation",
    db: Session = Depends(get_db),
):
    inv = Investigation(
        reference_code=f"RCA-{uuid.uuid4().hex[:6].upper()}",
        title=title,
        status="draft",
    )
    db.add(inv)
    db.commit()
    db.refresh(inv)
    return {
        "id": inv.id,
        "reference_code": inv.reference_code,
        "title": inv.title,
        "status": inv.status,
    }


@router.post(
    "/{investigation_id}/documents/upload",
    response_model=DocumentUploadResponse,
    summary="Upload Document (PDF / EML)",
    description="Accepts PDF or EML evidence files, validates integrity and size, extracts page text, and normalizes.",
)
async def upload_document(
    investigation_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> DocumentUploadResponse:
    # 1. Validate file extension
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type '{ext}'. Allowed types: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # 2. Read and validate file size
    file_bytes = await file.read()
    if len(file_bytes) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds maximum upload size of {MAX_UPLOAD_SIZE // (1024*1024)}MB.",
        )

    # 3. Save to private storage with safe UUID key
    storage_key, _ = save_uploaded_file(file_bytes, file.filename)
    sha256 = compute_sha256(file_bytes)

    # 4. Parse content based on type
    if ext == ".pdf":
        norm_source: NormalizedSource = parse_pdf_bytes(file_bytes, file.filename)
        doc_type = "pdf"
    elif ext == ".eml":
        norm_source: NormalizedSource = parse_eml_bytes(file_bytes, file.filename)
        doc_type = "eml"
    else:
        text_str = file_bytes.decode("utf-8", errors="replace")
        norm_source: NormalizedSource = parse_pasted_text(text_str, file.filename)
        doc_type = "text"

    # 5. Ensure investigation exists and persist SourceDocument
    inv = get_or_create_investigation(investigation_id, db)
    doc_record = SourceDocument(
        id=norm_source.source_id,
        investigation_id=inv.id,
        source_type=doc_type,
        original_filename=file.filename,
        storage_key=storage_key,
        content_sha256=sha256,
        mime_type=file.content_type,
        page_count=norm_source.total_pages,
        parse_status=norm_source.parse_status,
        extracted_text=norm_source.content_text,
    )
    db.add(doc_record)
    db.commit()
    db.refresh(doc_record)

    return DocumentUploadResponse(
        document_id=doc_record.id,
        investigation_id=inv.id,
        source_type=doc_record.source_type,
        filename=doc_record.original_filename,
        page_count=doc_record.page_count,
        char_count=norm_source.char_count,
        parse_status=doc_record.parse_status,
        preview=norm_source.content_text[:200] + ("..." if len(norm_source.content_text) > 200 else ""),
        warnings=norm_source.warnings,
        created_at=doc_record.created_at.isoformat(),
    )


@router.post(
    "/{investigation_id}/documents/text",
    response_model=DocumentUploadResponse,
    summary="Ingest Pasted Text",
    description="Accepts raw pasted text, normalizes line breaks and whitespace, and attaches to the investigation.",
)
async def ingest_pasted_text(
    investigation_id: str,
    payload: TextIntakeRequest,
    db: Session = Depends(get_db),
) -> DocumentUploadResponse:
    norm_source = parse_pasted_text(payload.content, payload.title)
    inv = get_or_create_investigation(investigation_id, db)

    doc_record = SourceDocument(
        id=norm_source.source_id,
        investigation_id=inv.id,
        source_type="pasted_text",
        original_filename=payload.title,
        page_count=1,
        parse_status="processed",
        extracted_text=norm_source.content_text,
    )
    db.add(doc_record)
    db.commit()
    db.refresh(doc_record)

    return DocumentUploadResponse(
        document_id=doc_record.id,
        investigation_id=inv.id,
        source_type=doc_record.source_type,
        filename=doc_record.original_filename,
        page_count=1,
        char_count=norm_source.char_count,
        parse_status=doc_record.parse_status,
        preview=norm_source.content_text[:200],
        warnings=norm_source.warnings,
        created_at=doc_record.created_at.isoformat(),
    )


@router.post(
    "/{investigation_id}/documents/email",
    response_model=DocumentUploadResponse,
    summary="Ingest Email Narrative",
    description="Accepts email communications (subject, body, sender) and structures into normalized source records.",
)
async def ingest_email_record(
    investigation_id: str,
    payload: EmailIntakeRequest,
    db: Session = Depends(get_db),
) -> DocumentUploadResponse:
    norm_source = parse_email_text(
        subject=payload.subject,
        body=payload.body,
        sender=payload.sender,
        received_at=payload.received_at,
    )
    inv = get_or_create_investigation(investigation_id, db)

    doc_record = SourceDocument(
        id=norm_source.source_id,
        investigation_id=inv.id,
        source_type="email",
        original_filename=f"Email: {payload.subject[:40]}",
        page_count=1,
        parse_status="processed",
        extracted_text=norm_source.content_text,
    )
    db.add(doc_record)
    db.commit()
    db.refresh(doc_record)

    return DocumentUploadResponse(
        document_id=doc_record.id,
        investigation_id=inv.id,
        source_type=doc_record.source_type,
        filename=doc_record.original_filename,
        page_count=1,
        char_count=norm_source.char_count,
        parse_status=doc_record.parse_status,
        preview=norm_source.content_text[:200],
        warnings=norm_source.warnings,
        created_at=doc_record.created_at.isoformat(),
    )


@router.get(
    "/{investigation_id}/documents",
    response_model=List[DocumentUploadResponse],
    summary="List Investigation Documents",
    description="Retrieves all source documents associated with an investigation.",
)
async def list_documents(
    investigation_id: str,
    db: Session = Depends(get_db),
) -> List[DocumentUploadResponse]:
    docs = db.query(SourceDocument).filter(SourceDocument.investigation_id == investigation_id).all()
    return [
        DocumentUploadResponse(
            document_id=d.id,
            investigation_id=d.investigation_id,
            source_type=d.source_type,
            filename=d.original_filename or "Document",
            page_count=d.page_count,
            char_count=len(d.extracted_text or ""),
            parse_status=d.parse_status,
            preview=(d.extracted_text or "")[:200],
            warnings=[],
            created_at=d.created_at.isoformat(),
        )
        for d in docs
    ]
