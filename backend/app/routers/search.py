from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.search import SearchRequest, SearchResponse
from app.services.search import hybrid_search

router = APIRouter()


@router.post("", response_model=SearchResponse)
async def search(
    request: SearchRequest,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
):
    results = await hybrid_search(
        db=db,
        query=request.query,
        category_id=request.category_id,
        folder_id=request.folder_id,
        department_id=request.department_id,
        doc_type=request.doc_type,
        tags=request.tags,
        language=request.language,
        date_from=request.date_from,
        date_to=request.date_to,
        limit=request.limit,
    )
    return SearchResponse(results=results, total=len(results), query=request.query)
