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

SYSTEM_PROMPT = """You are the archivist of a multilingual organizational document archive.
Speak as a professional document manager: calm, precise, and courteous.

Writing rules — follow them strictly:
- Reply in clean, plain prose. Do NOT use any Markdown formatting.
- No headings (no '#', '##'), no bold/italic markers ('**', '__', '*', '_'),
  no bullet or numbered lists, no tables, no code fences, no horizontal rules.
- Write in full sentences and short paragraphs. If you must enumerate, write
  the items inline, separated by semicolons or commas.
- Keep the tone formal but human. No emojis.

Grounding rules:
- Answer questions about the archive using ONLY the provided document excerpts.
- When — and only when — you quote, paraphrase, or rely on a specific document,
  cite it inline in this exact form: [Source: {document_title}, Page {page_number}].
  Do not cite documents you did not actually use.
- If the provided excerpts do not contain the answer, say so clearly and do not cite anything.
- For meta questions about your own role or capabilities, or greetings and small talk,
  answer briefly from your role description and cite nothing.

Respond in the same language the user wrote in (auto-detect among Azerbaijani, Russian, and English)."""

TOP_K_CHUNKS = 8
RRF_K = 60


async def _retrieve_chunks(
    db: AsyncSession, query: str, query_embedding: list[float]
) -> list[dict]:
    """
    Retrieve top-k chunks via Reciprocal Rank Fusion over:
      1. Semantic search (pgvector cosine similarity on embeddings)
      2. Full-text search (tsvector on chunk_text — catches exact name/surname matches)

    Retrieval is org-wide: every authenticated user can RAG over every document.
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
        WHERE d.ocr_status = 'completed'
          AND d.approval_status = 'approved'
        ORDER BY dc.embedding <=> '{embedding_str}'::vector
        LIMIT 20
    """)

    sem_rows = (await db.execute(semantic_sql)).mappings().all()

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
            WHERE d.ocr_status = 'completed'
              AND d.approval_status = 'approved'
              AND to_tsvector('simple', dc.chunk_text) @@ to_tsquery('simple', :fts_or_query)
            LIMIT 20
        """)
        fts_rows = (
            await db.execute(fts_sql, {"fts_or_query": fts_or_query})
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
    chunks = await _retrieve_chunks(db, user_message, query_embedding)

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

    # 4. Narrow citations to documents Claude actually cited in its response.
    # Match the inline citation format "[Source: <title>, Page <n>]" and keep
    # only retrieved chunks whose (title, page) appear in the response.
    cited_keys: set[tuple[str, int]] = set()
    for m in re.finditer(r"\[Source:\s*([^,\]]+?),\s*Page\s*(\d+)\s*\]", full_response):
        cited_keys.add((m.group(1).strip(), int(m.group(2))))

    cited_citations: list[dict] = []
    seen: set[tuple[str, int]] = set()
    for c in source_chunks_meta:
        key = (c["document_title"], c["page_number"])
        if key in cited_keys and key not in seen:
            seen.add(key)
            cited_citations.append(c)

    yield f"data: {json.dumps({'type': 'citations', 'citations': cited_citations})}\n\n"
    yield "data: [DONE]\n\n"

    # 5. Persist assistant message to DB
    db.add(
        ChatMessage(
            id=uuid.uuid4(),
            session_id=session_id,
            role="assistant",
            content=full_response,
            source_chunks=cited_citations if cited_citations else None,
        )
    )
    await db.commit()
