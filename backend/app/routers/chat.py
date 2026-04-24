import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.dependencies import get_current_user
from app.models.chat import ChatSession, ChatMessage
from app.models.user import User
from app.schemas.chat import (
    ChatRequest,
    ChatSessionResponse,
    ChatSessionDetailResponse,
    ChatMessageResponse,
)

router = APIRouter()


@router.post("")
async def send_message(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Send a message and receive a streaming AI response (Phase 5)."""
    # Import here to avoid circular imports; full implementation in Phase 5
    from app.services.chat import stream_chat_response
    from fastapi.responses import StreamingResponse

    session = await _get_or_create_session(db, current_user.id, request.session_id)

    db.add(ChatMessage(
        id=uuid.uuid4(),
        session_id=session.id,
        role="user",
        content=request.content,
    ))

    # First real message → use it as the session title so the history sidebar
    # doesn't stay stuck on "New Chat".
    if session.title in (None, "", "New Chat"):
        session.title = _derive_session_title(request.content)

    await db.commit()

    async def event_generator():
        async for chunk in stream_chat_response(db, session.id, request.content):
            yield chunk

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "X-Accel-Buffering": "no",
            "Cache-Control": "no-cache",
            "X-Session-Id": str(session.id),
        },
    )


@router.get("/sessions", response_model=list[ChatSessionResponse])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    sessions = (
        await db.scalars(
            select(ChatSession)
            .where(ChatSession.user_id == current_user.id)
            .order_by(ChatSession.updated_at.desc())
        )
    ).all()
    return sessions


@router.get("/sessions/{session_id}", response_model=ChatSessionDetailResponse)
async def get_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await _get_owned_session(db, session_id, current_user.id)
    messages = (
        await db.scalars(
            select(ChatMessage)
            .where(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.created_at.asc())
        )
    ).all()
    return ChatSessionDetailResponse(session=session, messages=messages)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = await _get_owned_session(db, session_id, current_user.id)
    await db.delete(session)
    await db.commit()


async def _get_or_create_session(
    db: AsyncSession, user_id: uuid.UUID, session_id: uuid.UUID | None
) -> ChatSession:
    if session_id:
        session = await db.scalar(
            select(ChatSession).where(
                ChatSession.id == session_id, ChatSession.user_id == user_id
            )
        )
        if session:
            return session

    session = ChatSession(id=uuid.uuid4(), user_id=user_id)
    db.add(session)
    await db.flush()
    return session


def _derive_session_title(content: str, max_len: int = 60) -> str:
    """Collapse whitespace and clip the first user message into a sidebar label."""
    cleaned = " ".join((content or "").split()).strip()
    if not cleaned:
        return "New Chat"
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1].rstrip() + "…"


async def _get_owned_session(
    db: AsyncSession, session_id: uuid.UUID, user_id: uuid.UUID
) -> ChatSession:
    session = await db.scalar(
        select(ChatSession).where(
            ChatSession.id == session_id, ChatSession.user_id == user_id
        )
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session
