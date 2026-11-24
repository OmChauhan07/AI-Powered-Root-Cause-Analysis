import os
import re
import uuid
import hashlib
import email
from email import policy
from typing import Optional, Tuple
from app.schemas.document import NormalizedSource, NormalizedPage

# Dedicated secure local storage directory for uploaded files
STORAGE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "storage", "uploads"))
os.makedirs(STORAGE_DIR, exist_ok=True)


def sanitize_filename(filename: str) -> str:
    """Removes path traversal components and unsafe characters from filenames."""
    clean_name = os.path.basename(filename)
    clean_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', clean_name)
    return clean_name or "document.bin"


def compute_sha256(data: bytes) -> str:
    """Computes SHA-256 digest of binary content for integrity tracking."""
    return hashlib.sha256(data).hexdigest()


def save_uploaded_file(file_bytes: bytes, original_filename: str) -> Tuple[str, str]:
    """
    Saves an uploaded file to the private storage directory with a secure UUID key.
    Returns: (storage_key, file_path)
    """
    sanitized = sanitize_filename(original_filename)
    storage_key = f"{uuid.uuid4().hex}_{sanitized}"
    target_path = os.path.join(STORAGE_DIR, storage_key)

    with open(target_path, "wb") as f:
        f.write(file_bytes)

    return storage_key, target_path


def parse_pasted_text(content: str, title: Optional[str] = None) -> NormalizedSource:
    """Normalizes raw pasted operational text narratives into a NormalizedSource."""
    clean_text = content.strip()
    char_count = len(clean_text)

    pages = [
        NormalizedPage(
            page_number=1,
            text=clean_text,
            char_count=char_count,
        )
    ]

    return NormalizedSource(
        source_id=f"src-{uuid.uuid4().hex[:12]}",
        source_type="pasted_text",
        filename=title or "Pasted Incident Narrative",
        content_text=clean_text,
        pages=pages,
        total_pages=1,
        char_count=char_count,
        parse_status="processed",
        metadata={"title": title, "input_mode": "pasted_text"},
    )


def parse_email_text(
    subject: str,
    body: str,
    sender: Optional[str] = None,
    received_at: Optional[str] = None,
) -> NormalizedSource:
    """Normalizes email text records into a NormalizedSource."""
    combined_text = f"Subject: {subject}\nFrom: {sender or 'Not specified'}\nDate: {received_at or 'Not specified'}\n\n{body}".strip()
    char_count = len(combined_text)

    pages = [
        NormalizedPage(
            page_number=1,
            text=combined_text,
            char_count=char_count,
        )
    ]

    return NormalizedSource(
        source_id=f"src-{uuid.uuid4().hex[:12]}",
        source_type="email",
        filename=f"Email: {subject[:40]}",
        content_text=combined_text,
        pages=pages,
        total_pages=1,
        char_count=char_count,
        parse_status="processed",
        metadata={
            "subject": subject,
            "sender": sender,
            "received_at": received_at,
            "input_mode": "email_text",
        },
    )


def parse_eml_bytes(file_bytes: bytes, filename: str) -> NormalizedSource:
    """Parses standard .eml RFC-822 email files into a NormalizedSource."""
    try:
        msg = email.message_from_bytes(file_bytes, policy=policy.default)
        subject = msg.get("subject", "No Subject")
        sender = msg.get("from", "Unknown Sender")
        date_str = msg.get("date", "Unknown Date")

        body_parts = []
        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()
                if content_type == "text/plain":
                    body_parts.append(part.get_content())
                elif content_type == "text/html" and not body_parts:
                    body_parts.append(part.get_content())
        else:
            body_parts.append(msg.get_content())

        body_text = "\n\n".join(body_parts).strip()
        combined_text = f"Subject: {subject}\nFrom: {sender}\nDate: {date_str}\n\n{body_text}".strip()
        char_count = len(combined_text)

        pages = [
            NormalizedPage(
                page_number=1,
                text=combined_text,
                char_count=char_count,
            )
        ]

        return NormalizedSource(
            source_id=f"src-{uuid.uuid4().hex[:12]}",
            source_type="eml",
            filename=filename,
            content_text=combined_text,
            pages=pages,
            total_pages=1,
            char_count=char_count,
            parse_status="processed",
            metadata={"subject": subject, "from": sender, "date": date_str},
        )
    except Exception as exc:
        return NormalizedSource(
            source_id=f"src-{uuid.uuid4().hex[:12]}",
            source_type="eml",
            filename=filename,
            content_text="",
            pages=[],
            total_pages=0,
            char_count=0,
            parse_status="failed",
            warnings=[f"Failed to parse .eml structure: {str(exc)}"],
        )


def parse_pdf_bytes(file_bytes: bytes, filename: str) -> NormalizedSource:
    """
    Extracts text page-by-page from PDF binary data using PyMuPDF (fitz).
    Detects scanned or unreadable pages and reports clear status flags.
    """
    try:
        import pymupdf

        doc = pymupdf.open(stream=file_bytes, filetype="pdf")
        pages = []
        all_text = []
        warnings = []

        total_pages = len(doc)
        if total_pages == 0:
            return NormalizedSource(
                source_id=f"src-{uuid.uuid4().hex[:12]}",
                source_type="pdf",
                filename=filename,
                content_text="",
                pages=[],
                total_pages=0,
                char_count=0,
                parse_status="empty",
                warnings=["The uploaded PDF contains zero pages."],
            )

        for page_idx in range(total_pages):
            page = doc[page_idx]
            page_text = page.get_text("text").strip()
            char_count = len(page_text)

            if char_count == 0:
                warnings.append(f"Page {page_idx + 1} has no readable text (may be image or scanned).")

            pages.append(
                NormalizedPage(
                    page_number=page_idx + 1,
                    text=page_text,
                    char_count=char_count,
                )
            )
            all_text.append(f"--- [Page {page_idx + 1}] ---\n{page_text}")

        combined_text = "\n\n".join(all_text).strip()
        total_chars = sum(p.char_count for p in pages)

        parse_status = "processed"
        if total_chars == 0:
            parse_status = "unreadable_scanned"
            warnings.append("Document has no machine-readable text layer. OCR would be required.")
        elif any(p.char_count == 0 for p in pages):
            parse_status = "partial"

        return NormalizedSource(
            source_id=f"src-{uuid.uuid4().hex[:12]}",
            source_type="pdf",
            filename=filename,
            content_text=combined_text,
            pages=pages,
            total_pages=total_pages,
            char_count=total_chars,
            parse_status=parse_status,
            warnings=warnings,
            metadata={"total_pages": total_pages, "input_mode": "pdf"},
        )
    except Exception as exc:
        return NormalizedSource(
            source_id=f"src-{uuid.uuid4().hex[:12]}",
            source_type="pdf",
            filename=filename,
            content_text="",
            pages=[],
            total_pages=0,
            char_count=0,
            parse_status="failed",
            warnings=[f"PyMuPDF failed to parse PDF: {str(exc)}"],
        )
