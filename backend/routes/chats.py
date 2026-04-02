from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List, Optional
from datetime import datetime

from ..database.session import get_db
from ..database.models import User, ChatSession, ChatMessage
from ..auth.deps import get_current_user
from pydantic import BaseModel

router = APIRouter(prefix="/api/chats", tags=["chats"])

class ChatMessageSchema(BaseModel):
    role: str
    content: str
    reasoning: Optional[str] = None
    created_at: datetime
    class Config:
        orm_mode = True

class ChatSessionSchema(BaseModel):
    id: int
    title: str
    created_at: datetime
    updated_at: datetime
    class Config:
        orm_mode = True

class ChatCreate(BaseModel):
    title: str

class MessageCreate(BaseModel):
    role: str
    content: str
    reasoning: Optional[str] = None

@router.get("/", response_model=List[ChatSessionSchema])
async def list_chats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.user_id == current_user.id)
        .order_by(desc(ChatSession.updated_at))
    )
    return result.scalars().all()

@router.post("/", response_model=ChatSessionSchema)
async def create_chat(
    chat_in: ChatCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    new_chat = ChatSession(
        user_id=current_user.id,
        title=chat_in.title
    )
    db.add(new_chat)
    await db.commit()
    await db.refresh(new_chat)
    return new_chat

@router.post("/{chat_id}/messages")
async def save_message(
    chat_id: int,
    msg_in: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify ownership
    chat = await db.get(ChatSession, chat_id)
    if not chat or chat.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    new_msg = ChatMessage(
        session_id=chat_id,
        role=msg_in.role,
        content=msg_in.content,
        reasoning=msg_in.reasoning
    )
    db.add(new_msg)
    
    # Update session activity
    chat.updated_at = datetime.utcnow()
    db.add(chat)
    
    await db.commit()
    return {"status": "ok"}

@router.get("/{chat_id}/messages", response_model=List[ChatMessageSchema])
async def get_messages(
    chat_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify ownership
    chat = await db.get(ChatSession, chat_id)
    if not chat or chat.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == chat_id)
        .order_by(ChatMessage.created_at)
    )
    return result.scalars().all()

@router.delete("/{chat_id}")
async def delete_chat(
    chat_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    chat = await db.get(ChatSession, chat_id)
    if not chat or chat.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    await db.delete(chat)
    await db.commit()
    return {"message": "Success"}
