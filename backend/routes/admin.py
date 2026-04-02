from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import List, Optional
from datetime import datetime
from ..database.session import get_db
from ..database.models import User, UserRole, AuditLog
from ..auth.deps import check_role
from pydantic import BaseModel, EmailStr
from fastapi.responses import Response
import pandas as pd
import io

router = APIRouter(prefix="/api/admin", tags=["admin"])

# Only admin and moderators can access this router
# More specific checks within each route if needed
router.dependencies = [Depends(check_role([UserRole.ADMIN, UserRole.MODERATOR]))]

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    ban_reason: Optional[str] = None

class UserDetail(BaseModel):
    id: int
    username: str
    email: EmailStr
    role: UserRole
    is_active: bool
    ban_reason: Optional[str]
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        orm_mode = True

class UserListResponse(BaseModel):
    users: List[UserDetail]
    total: int
    page: int
    size: int

@router.get("/users", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    search: Optional[str] = Query(None),
    role: Optional[UserRole] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    query = select(User)
    
    if search:
        query = query.where(or_(
            User.username.ilike(f"%{search}%"),
            User.email.ilike(f"%{search}%")
        ))
    if role:
        query = query.where(User.role == role)
    if is_active is not None:
        query = query.where(User.is_active == is_active)
        
    # Get total count for pagination
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)
    
    # Paginate
    query = query.offset((page - 1) * size).limit(size)
    result = await db.execute(query)
    users = result.scalars().all()
    
    return {
        "users": users,
        "total": total,
        "page": page,
        "size": size
    }

@router.get("/stats")
async def get_admin_stats(db: AsyncSession = Depends(get_db)):
    total_users = await db.scalar(select(func.count(User.id)))
    active_users = await db.scalar(select(func.count(User.id)).where(User.is_active == True))
    banned_users = await db.scalar(select(func.count(User.id)).where(User.is_active == False))
    
    return {
        "total": total_users,
        "active": active_users,
        "banned": banned_users
    }

@router.post("/users/{user_id}/ban")
async def ban_user(
    user_id: int, 
    reason: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MODERATOR]))
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.is_active = False
    user.ban_reason = reason
    db.add(user)
    
    # Audit log
    audit = AuditLog(
        user_id=current_user.id, 
        action="BAN", 
        description=f"Banned user {user.username}. Reason: {reason}"
    )
    db.add(audit)
    
    await db.commit()
    return {"message": f"User {user.username} banned successfully"}

@router.post("/users/{user_id}/unban")
async def unban_user(
    user_id: int, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_role([UserRole.ADMIN, UserRole.MODERATOR]))
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    user.is_active = True
    user.ban_reason = None
    db.add(user)
    
    # Audit log
    audit = AuditLog(
        user_id=current_user.id, 
        action="UNBAN", 
        description=f"Unbanned user {user.username}"
    )
    db.add(audit)
    
    await db.commit()
    return {"message": f"User {user.username} unbanned successfully"}

@router.put("/users/{user_id}", response_model=UserDetail)
async def update_user(
    user_id: int, 
    user_in: UserUpdate, 
    db: AsyncSession = Depends(get_db),
    # Only admin can change role
    current_user: User = Depends(check_role([UserRole.ADMIN]))
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    update_data = user_in.dict(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)
        
    db.add(user)
    
    # Audit log
    audit = AuditLog(
        user_id=current_user.id, 
        action="USER_UPDATE", 
        description=f"Updated user {user.username}. Changed: {update_data}"
    )
    db.add(audit)
    
    await db.commit()
    await db.refresh(user)
    return user

@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: int, 
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(check_role([UserRole.ADMIN]))
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
        
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
        
    await db.delete(user)
    
    # Audit log
    audit = AuditLog(
        user_id=current_user.id, 
        action="USER_DELETE", 
        description=f"Deleted user {user.username}"
    )
    db.add(audit)
    
    await db.commit()
    return None

@router.get("/export/csv")
async def export_users_csv(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User))
    users = result.scalars().all()
    
    df = pd.DataFrame([{
        "id": u.id,
        "username": u.username,
        "email": u.email,
        "role": u.role,
        "is_active": u.is_active,
        "created_at": u.created_at,
        "last_login": u.last_login
    } for u in users])
    
    output = io.StringIO()
    df.to_csv(output, index=False)
    
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=users_export.csv"}
    )

@router.get("/logs", response_model=List[dict])
async def list_audit_logs(
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db)
):
    query = select(AuditLog).order_by(AuditLog.timestamp.desc()).limit(limit)
    result = await db.execute(query)
    logs = result.scalars().all()
    
    return [{
        "id": l.id,
        "user_id": l.user_id,
        "action": l.action,
        "description": l.description,
        "timestamp": l.timestamp,
        "ip": l.ip_address
    } for l in logs]
