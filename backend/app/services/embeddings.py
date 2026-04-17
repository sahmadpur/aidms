import uuid

import tiktoken
from openai import AsyncOpenAI
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.chunk import DocumentChunk

openai_client = AsyncOpenAI(api_key=settings.openai_api_key)

TOKENIZER = tiktoken.get_encoding("cl100k_base")
CHUNK_SIZE = 800
CHUNK_OVERLAP = 100
EMBED_BATCH_SIZE = 100
EMBED_MODEL = "text-embedding-3-small"


def split_into_chunks(text: str) -> list[str]:
    """Split text into overlapping token chunks."""
    tokens = TOKENIZER.encode(text)
    chunks = []
    start = 0
    while start < len(tokens):
        end = min(start + CHUNK_SIZE, len(tokens))
        chunk_text = TOKENIZER.decode(tokens[start:end])
        if chunk_text.strip():
            chunks.append(chunk_text)
        start += CHUNK_SIZE - CHUNK_OVERLAP
    return chunks


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed a list of texts via OpenAI. Returns list of 1536-dim vectors."""
    response = await openai_client.embeddings.create(model=EMBED_MODEL, input=texts)
    return [item.embedding for item in response.data]


async def chunk_and_embed(
    db: AsyncSession,
    doc,
    page_texts: list[tuple[int, str]],
) -> None:
    """
    Chunk text per page, embed in batches, and store DocumentChunk records.
    Deletes any existing chunks for the document first (for reprocessing).
    """
    await db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == doc.id))

    # Build flat list of (chunk_text, page_number)
    all_chunks: list[tuple[str, int]] = []
    for page_number, text in page_texts:
        for chunk_text in split_into_chunks(text):
            all_chunks.append((chunk_text, page_number))

    if not all_chunks:
        return

    # Batch embed and insert
    for batch_start in range(0, len(all_chunks), EMBED_BATCH_SIZE):
        batch = all_chunks[batch_start : batch_start + EMBED_BATCH_SIZE]
        texts = [c[0] for c in batch]
        embeddings = await embed_texts(texts)

        for idx, ((chunk_text, page_number), embedding) in enumerate(zip(batch, embeddings)):
            db.add(
                DocumentChunk(
                    id=uuid.uuid4(),
                    document_id=doc.id,
                    chunk_index=batch_start + idx,
                    chunk_text=chunk_text,
                    embedding=embedding,
                    page_number=page_number,
                )
            )

    await db.flush()
