import io
import os

from google.cloud import vision
from pdf2image import convert_from_bytes
from pypdf import PdfReader
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.storage import get_file_stream
from app.services.embeddings import chunk_and_embed
from app.services import audit
from app.services.validation import notify_validation_failed, validate_document

# Set Google credentials from config
if settings.google_cloud_credentials:
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = settings.google_cloud_credentials

_vision_client: vision.ImageAnnotatorClient | None = None

# Minimum average characters per page to consider a PDF text-extractable
_MIN_CHARS_PER_PAGE = 100


def get_vision_client() -> vision.ImageAnnotatorClient:
    global _vision_client
    if _vision_client is None:
        _vision_client = vision.ImageAnnotatorClient()
    return _vision_client


def _try_extract_pdf_text(pdf_bytes: bytes) -> list[tuple[int, str]] | None:
    """
    Attempt direct text extraction from a PDF.
    Returns a list of (page_number, text) tuples if the PDF has sufficient
    embedded text, or None if the PDF appears to be image-based/scanned.
    """
    reader = PdfReader(io.BytesIO(pdf_bytes))
    page_texts: list[tuple[int, str]] = []

    for page_num, page in enumerate(reader.pages, start=1):
        text = page.extract_text() or ""
        page_texts.append((page_num, text.strip()))

    total_chars = sum(len(text) for _, text in page_texts)
    avg_chars = total_chars / len(page_texts) if page_texts else 0

    if avg_chars < _MIN_CHARS_PER_PAGE:
        return None  # too sparse — likely scanned

    return page_texts


async def _ocr_via_vision(pdf_bytes: bytes) -> list[tuple[int, str]]:
    """
    Extract text page-by-page using Google Cloud Vision OCR.
    Used as fallback for image-based/scanned PDFs.
    """
    images = convert_from_bytes(pdf_bytes, dpi=200)
    client = get_vision_client()
    page_texts: list[tuple[int, str]] = []

    for page_num, image in enumerate(images, start=1):
        buf = io.BytesIO()
        image.save(buf, format="PNG")

        vision_image = vision.Image(content=buf.getvalue())
        response = client.document_text_detection(image=vision_image)

        if response.error.message:
            raise RuntimeError(
                f"Vision API error on page {page_num}: {response.error.message}"
            )

        page_texts.append((page_num, response.full_text_annotation.text or ""))

    return page_texts


async def run_ocr_pipeline(db: AsyncSession, doc) -> None:
    """
    Download PDF from MinIO, extract text (direct extraction if possible,
    Google Cloud Vision OCR otherwise), store result, and trigger embedding.
    """
    stream = get_file_stream(doc.file_path)
    try:
        pdf_bytes = stream.read()
    finally:
        stream.close()
        stream.release_conn()

    # Try direct text extraction first
    page_texts = _try_extract_pdf_text(pdf_bytes)

    if page_texts is not None:
        doc.ocr_method = "direct"
    else:
        # Fall back to Google Cloud Vision for scanned/image PDFs
        page_texts = await _ocr_via_vision(pdf_bytes)
        doc.ocr_method = "vision"

    doc.ocr_text = "\n\n".join(
        f"--- Page {num} ---\n{text}" for num, text in page_texts
    ).strip()

    await chunk_and_embed(db, doc, page_texts)

    outcome = await validate_document(db, doc)
    await audit.log(
        db,
        user_id=None,
        action="document.validate",
        entity_type="document",
        entity_id=doc.id,
        metadata={
            "status": outcome.status,
            "failed_count": len(outcome.failed_rules),
            "rule_ids": [str(r.rule_id) for r in outcome.failed_rules],
            "trigger": "ocr_worker",
        },
    )
    if outcome.status == "failed":
        await notify_validation_failed(db, doc, outcome.failed_rules)
