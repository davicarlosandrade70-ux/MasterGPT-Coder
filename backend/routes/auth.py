from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func
from datetime import datetime, timedelta
from ..database.session import get_db
from ..database.models import User, UserRole, AuditLog
from ..auth.security import create_access_token, verify_password, get_password_hash
from ..auth.deps import get_current_user
from pydantic import BaseModel, EmailStr

router = APIRouter(prefix="/api/auth", tags=["auth"])

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: EmailStr
    role: UserRole
    is_active: bool
    created_at: datetime

    class Config:
        orm_mode = True

class Token(BaseModel):
    access_token: str
    token_type: str

@router.post("/register", response_model=UserResponse)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    # Check if user already exists (using a more efficient query)
    existing_user = await db.scalar(
        select(User).where(or_(User.username == user_in.username, User.email == user_in.email))
    )
    if existing_user:
        detail = "Username already registered" if existing_user.username == user_in.username else "Email already registered"
        raise HTTPException(status_code=400, detail=detail)

    # Efficiently count users to determine role
    user_count = await db.scalar(select(func.count(User.id)))
    role = UserRole.ADMIN if user_count == 0 else UserRole.USER

    try:
        new_user = User(
            username=user_in.username,
            email=user_in.email,
            hashed_password=get_password_hash(user_in.password),
            role=role
        )
        db.add(new_user)
        await db.flush() # Populate ID without committing
        
        # Audit log in the same transaction
        audit = AuditLog(
            user_id=new_user.id, 
            action="REGISTER", 
            description=f"User {new_user.username} registered with role {role}"
        )
        db.add(audit)
        
        await db.commit()
        await db.refresh(new_user)
        return new_user
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@router.post("/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == form_data.username))
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    user.last_login = datetime.utcnow()
    db.add(user)
    
    # Audit log
    audit = AuditLog(user_id=user.id, action="LOGIN", description=f"User {user.username} logged in")
    db.add(audit)
    await db.commit()
    
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user
