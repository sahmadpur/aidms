"""
Claude streaming chat service with RAG.

Embeds user query → retrieves top-k document chunks via pgvector →
streams Claude response as SSE → persists full message to DB.
"""

import json
import re
import uuid
from collections.abc import AsyncGenerator

import anthropic
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.chat import ChatMessage
from app.services.embeddings import embed_texts

claude_client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

SYSTEM_PROMPT = """You are an AI assistant for a multilingual document management system.
Answer questions based ONLY on the provided document excerpts.
Always cite your sources using the format: [Source: {document_title}, Page {page_number}].
If the answer is not found in the provided documents, say so clearly.
Respond in the same language the user wrote in (auto-detect)."""

TOP_K_CHUNKS = 8
RRF_K = 60


async def _retrieve_chunks(
    db: AsyncSession, user_id: uuid.UUID, query: str, query_embedding: list[float]
) -> list[dict]:
    """
    Retrieve top-k chunks via Reciprocal Rank Fusion over:
      1. Semantic search (pgvector cosine similarity on embeddings)
      2. Full-text search (tsvector on chunk_text — catches exact name/surname matches)
    """
    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    semantic_sql = text(f"""
        SELECT
            dc.id::text      AS chunk_id,
            dc.chunk_text,
            dc.page_number,
            d.id::text       AS document_id,
            d.title          AS document_title,
            ROW_NUMBER() OVER (ORDER BY dc.embedding <=> '{embedding_str}'::vector) AS sem_rank
        FROM document_chunks dc
        JOIN documents d ON d.id = dc.document_id
        WHERE d.user_id = :user_id
          AND d.ocr_status = 'completed'
        ORDER BY dc.embedding <=> '{embedding_str}'::vector
        LIMIT 20
    """)

    sem_rows = (await db.execute(semantic_sql, {"user_id": str(user_id)})).mappings().all()

    # OR all words so a chunk matching ANY query word (e.g. just "Aliyev") is
    # returned — plainto_tsquery would require ALL words to match. Strip
    # tsquery operator characters (&|!():*<>) from each word first.
    tokens = [re.sub(r"[&|!():*<>\s]", "", w) for w in query.split()]
    tokens = [t for t in tokens if t]
    fts_or_query = " | ".join(tokens)

    fts_rows = []
    if fts_or_query:
        fts_sql = text("""
            SELECT
                dc.id::text  AS chunk_id,
                dc.chunk_text,
                dc.page_number,
                d.id::text   AS document_id,
                d.title      AS document_title,
                ROW_NUMBER() OVER (
                    ORDER BY ts_rank(to_tsvector('simple', dc.chunk_text),
                                     to_tsquery('simple', :fts_or_query)) DESC
                ) AS fts_rank
            FROM document_chunks dc
            JOIN documents d ON d.id = dc.document_id
            WHERE d.user_id = :user_id
              AND d.ocr_status = 'completed'
              AND to_tsvector('simple', dc.chunk_text) @@ to_tsquery('simple', :fts_or_query)
            LIMIT 20
        """)
        fts_rows = (
            await db.execute(
                fts_sql, {"user_id": str(user_id), "fts_or_query": fts_or_query}
            )
        ).mappings().all()

    rrf_scores: dict[str, float] = {}
    best_row: dict[str, dict] = {}

    for row in sem_rows:
        cid = row["chunk_id"]
        rrf_scores[cid] = rrf_scores.get(cid, 0) + 1 / (RRF_K + row["sem_rank"])
        best_row[cid] = dict(row)

    for row in fts_rows:
        cid = row["chunk_id"]
        rrf_scores[cid] = rrf_scores.get(cid, 0) + 1 / (RRF_K + row["fts_rank"])
        if cid not in best_row:
            best_row[cid] = dict(row)

    ranked = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:TOP_K_CHUNKS]
    return [best_row[cid] for cid, _ in ranked]


async def stream_chat_response(
    db: AsyncSession,
    user_id: uuid.UUID,
    session_id: uuid.UUID,
    user_message: str,
) -> AsyncGenerator[str, None]:
    """
    Async generator that yields SSE-formatted strings.

    Event types emitted:
      data: {"type": "text_delta", "text": "..."}
      data: {"type": "citations", "citations": [...]}
      data: [DONE]
    """
    # 1. Embed query and retrieve relevant chunks
    [query_embedding] = await embed_texts([user_message])
    chunks = await _retrieve_chunks(db, user_id, user_message, query_embedding)

    # 2. Build context string
    context_parts: list[str] = []
    source_chunks_meta: list[dict] = []

    for chunk in chunks:
        context_parts.append(
            f"[Document: {chunk['document_title']}, Page {chunk['page_number']}]\n{chunk['chunk_text']}"
        )
        source_chunks_meta.append(
            {
                "document_id": chunk["document_id"],
                "document_title": chunk["document_title"],
                "page_number": chunk["page_number"],
                "chunk_text": chunk["chunk_text"][:200],
            }
        )

    context = "\n\n---\n\n".join(context_parts) if context_parts else "No relevant documents found."

    messages = [
        {
            "role": "user",
            "content": f"Context documents:\n\n{context}\n\n---\n\nQuestion: {user_message}",
        }
    ]

    # 3. Stream Claude response
    full_response = ""

    async with claude_client.messages.stream(
        model="claude-sonnet-4-6",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=messages,
    ) as stream:
        async for text_chunk in stream.text_stream:
            full_response += text_chunk
            yield f"data: {json.dumps({'type': 'text_delta', 'text': text_chunk})}\n\n"

    # 4. Send citations
    yield f"data: {json.dumps({'type': 'citations', 'citations': source_chunks_meta})}\n\n"
    yield "data: [DONE]\n\n"

    # 5. Persist assistant message to DB
    db.add(
        ChatMessage(
            id=uuid.uuid4(),
            session_id=session_id,
            role="assistant",
            content=full_response,
            source_chunks=source_chunks_meta if source_chunks_meta else None,
        )
    )
    await db.commit()
