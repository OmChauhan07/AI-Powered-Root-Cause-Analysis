import pytest
import pymupdf
from app.services.document_parser import (
    parse_pdf_bytes,
    parse_pasted_text,
    parse_email_text,
    parse_eml_bytes,
    sanitize_filename,
    compute_sha256,
)


def test_sanitize_filename():
    """Verifies that path traversal attacks and unsafe chars are cleaned."""
    assert sanitize_filename("../../etc/passwd.pdf") == "passwd.pdf"
    assert sanitize_filename("..\\..\\windows\\system32\\calc.exe") == "calc.exe"
    assert sanitize_filename("safe_report_2026.pdf") == "safe_report_2026.pdf"


def test_compute_sha256():
    """Verifies deterministic SHA256 hashing."""
    data = b"Sample pharmaceutical deviation record"
    hash1 = compute_sha256(data)
    hash2 = compute_sha256(data)
    assert hash1 == hash2
    assert len(hash1) == 64


def test_parse_pasted_text():
    """Verifies normalization of raw operational narratives."""
    content = "Batch BATCH-2026-014 observed slower crystallization trajectory."
    res = parse_pasted_text(content, title="Operator Notes")
    assert res.source_type == "pasted_text"
    assert res.filename == "Operator Notes"
    assert res.total_pages == 1
    assert res.char_count == len(content)
    assert res.parse_status == "processed"
    assert len(res.pages) == 1
    assert res.pages[0].page_number == 1


def test_parse_email_text():
    """Verifies parsing of structured email communications."""
    res = parse_email_text(
        subject="OOS Alert API-X",
        body="Immediate containment initiated for batch BATCH-2026-014.",
        sender="quality.assurance@pharma.invalid",
        received_at="2026-11-20T08:35:00Z",
    )
    assert res.source_type == "email"
    assert "OOS Alert API-X" in res.content_text
    assert "quality.assurance@pharma.invalid" in res.content_text
    assert res.total_pages == 1
    assert res.parse_status == "processed"


def test_parse_eml_bytes():
    """Verifies parsing of standard RFC 822 .eml byte strings."""
    eml_raw = (
        b"From: qa-lead@pharma.invalid\r\n"
        b"To: plant-manager@pharma.invalid\r\n"
        b"Subject: Deviation Notice - Batch 014\r\n"
        b"Date: Fri, 20 Nov 2026 09:00:00 +0000\r\n"
        b"Content-Type: text/plain; charset=utf-8\r\n"
        b"\r\n"
        b"Crystallization sensor TEMP-SENSOR-014 requires immediate recalibration."
    )
    res = parse_eml_bytes(eml_raw, "alert.eml")
    assert res.source_type == "eml"
    assert "TEMP-SENSOR-014" in res.content_text
    assert res.parse_status == "processed"


def test_parse_pdf_bytes_readable():
    """Verifies PyMuPDF page-by-page extraction from in-memory PDF."""
    doc = pymupdf.open()
    page1 = doc.new_page()
    page1.insert_text((50, 72), "API-X Quality Control Laboratory Investigation Report")
    page1.insert_text((50, 100), "Observed Purity: 98.1% (Registered limit: >= 99.0%)")

    page2 = doc.new_page()
    page2.insert_text((50, 72), "Equipment Check: Crystallization Vessel 02 Sensor Log")

    pdf_bytes = doc.tobytes()
    doc.close()

    res = parse_pdf_bytes(pdf_bytes, "investigation_report.pdf")
    assert res.source_type == "pdf"
    assert res.total_pages == 2
    assert res.parse_status == "processed"
    assert len(res.pages) == 2
    assert "98.1%" in res.pages[0].text
    assert "Sensor Log" in res.pages[1].text
    assert res.char_count > 0


def test_parse_pdf_bytes_scanned_unreadable():
    """Verifies detection of image-only or scanned PDFs without text layers."""
    doc = pymupdf.open()
    doc.new_page()  # Empty blank page with no text
    pdf_bytes = doc.tobytes()
    doc.close()

    res = parse_pdf_bytes(pdf_bytes, "scanned_doc.pdf")
    assert res.source_type == "pdf"
    assert res.parse_status == "unreadable_scanned"
    assert any("OCR" in w or "text layer" in w for w in res.warnings)
