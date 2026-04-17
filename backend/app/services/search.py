"""
Hybrid search: semantic (pgvector cosine) + full-text (tsvector).
Results are merged via Reciprocal Rank Fusion (RRF).
"""

import uuid
from datetime import date
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.search import SearchResultItem
from app.services.embeddings import embed_texts

RRF_K = 60  # RRF constant — controls how steeply top ranks are rewarded


async def hybrid_search(
    db: AsyncSession,
    user_id: uuid.UUID,
    query: str,
    category_id: Optional[uuid.UUID] = None,
    tags: Optional[list[str]] = None,
    language: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = 10,
) -> list[SearchResultItem]:

    # 1. Embed query
    [query_embedding] = await embed_texts([query])
    embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

    # Build optional filter clauses
    filters = ["d.user_id = :user_id", "d.ocr_status = 'completed'"]
    params: dict = {"user_id": str(user_id), "query": query}

    if category_id:
        filters.append("d.category_id = :category_id")
        params["category_id"] = str(category_id)
    if language:
        filters.append("d.language = :language")
        params["language"] = language
    if date_from:
        filters.append("d.created_at >= :date_from")
        params["date_from"] = date_from
    if date_to:
        filters.append("d.created_at <= :date_to")
        params["date_to"] = date_to

    # Tags: document must contain ALL provided tags
    tag_clause = ""
    if tags:
        tag_clause = "AND d.tags @> :tags"
        params["tags"] = tags

    filter_sql = " AND ".join(filters)

    # 2. Semantic search (top-20 chunks)
    semantic_sql = text(f"""
        SELECT
            dc.document_id::text AS document_id,
            d.title              AS document_title,
            dc.chunk_text        AS snippet,
            dc.page_number,
            (1 - (dc.embedding <=> '{embedding_str}'::vector)) AS score,
            d.ocr_status,
            d.category_id::text  AS category_id,
            d.language,
            d.created_at::text   AS upload_date,
            ROW_NUMBER() OVER (ORDER BY dc.embedding <=> '{embedding_str}'::vector) AS sem_rank
        FROM document_chunks dc
        JOIN documents d ON d.id = dc.document_id
        WHERE {filter_sql} {tag_clause}
        ORDER BY dc.embedding <=> '{embedding_str}'::vector
        LIMIT 20
    """)

    # 3. Full-text search (top-20 documents)
    fts_sql = text(f"""
        SELECT
            d.id::text           AS document_id,
            d.title              AS document_title,
            ts_headline(
                'simple',
                coalesce(d.ocr_text, ''),
                plainto_tsquery('simple', :query),
                'MaxWords=30, MinWords=15'
            )                    AS snippet,
            1                    AS page_number,
            ts_rank(d.search_vector, plainto_tsquery('simple', :query)) AS score,
            d.ocr_status,
            d.category_id::text  AS category_id,
            d.language,
            d.created_at::text   AS upload_date,
            ROW_NUMBER() OVER (
                ORDER BY ts_rank(d.search_vector, plainto_tsquery('simple', :query)) DESC
            ) AS fts_rank
        FROM documents d
        WHERE {filter_sql}
          AND d.search_vector @@ plainto_tsquery('simple', :query)
          {tag_clause}
        LIMIT 20
    """)

    sem_rows = (await db.execute(semantic_sql, params)).mappings().all()
    fts_rows = (await db.execute(fts_sql, params)).mappings().all()

    # 4. Reciprocal Rank Fusion
    rrf_scores: dict[str, float] = {}
    best_row: dict[str, dict] = {}

    for row in sem_rows:
        doc_id = row["document_id"]
        rrf_scores[doc_id] = rrf_scores.get(doc_id, 0) + 1 / (RRF_K + row["sem_rank"])
        best_row[doc_id] = dict(row)

    for row in fts_rows:
        doc_id = row["document_id"]
        rrf_scores[doc_id] = rrf_scores.get(doc_id, 0) + 1 / (RRF_K + row["fts_rank"])
        if doc_id not in best_row:
            best_row[doc_id] = dict(row)

    # 5. Sort by RRF score and return top-limit
    ranked = sorted(rrf_scores.items(), key=lambda x: x[1], reverse=True)[:limit]

    results = []
    for doc_id, rrf_score in ranked:
        row = best_row[doc_id]
        results.append(
            SearchResultItem(
                document_id=uuid.UUID(row["document_id"]),
                document_title=row["document_title"],
                snippet=row["snippet"] or "",
                page_number=row["page_number"],
                relevance_score=round(rrf_score, 4),
                ocr_status=row["ocr_status"],
                category_id=uuid.UUID(row["category_id"]) if row["category_id"] else None,
                language=row["language"],
                upload_date=row["upload_date"],
            )
        )

    return results
