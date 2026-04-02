from fastapi import FastAPI, Request, HTTPException, Depends
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import json
import os
from datetime import datetime

import contextlib
import traceback

# Local imports
from .providers import stream_provider
from .routes import auth, admin, chats
from .database.session import engine, get_db
from .database.models import Base, ChatMessage, ChatSession, User
from .auth.deps import get_current_user

@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    # Database Initialization
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

# Rate Limiter
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(
    title="MasterGPT API",
    description="Professional AI Coder API with Secure Auth and Admin Dashboard",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, set specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(chats.router)

@app.post("/api/chat")
@limiter.limit("10/minute")
async def chat_endpoint(
    request: Request, 
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Unified endpoint for AI requests. Pre-auth required.
    Expects: { provider, model, messages, session_id? }
    """
    try:
        data = await request.json()
        provider = data.get("provider")
        model = data.get("model")
        messages = data.get("messages")
        session_id = data.get("session_id")

        if not provider or not model or not messages:
            raise HTTPException(status_code=400, detail="Missing required fields")

        # Se houver session_id, salvar a última pergunta do usuário
        if session_id:
            # Verificar se a sessão pertence ao usuário
            chat_session = await db.get(ChatSession, session_id)
            if chat_session and chat_session.user_id == current_user.id:
                last_msg = messages[-1]["content"] if messages else ""
                if last_msg:
                    db.add(ChatMessage(session_id=session_id, role="user", content=last_msg))
                    await db.commit()

        # Nota: O salvamento da resposta do assistente (async) deve ser feito no frontend 
        # ou via wrapper de gerador. Para manter performance de streaming, 
        # o frontend enviará a resposta final para salvar após o término do stream.

        return StreamingResponse(
            stream_provider(provider, model, messages),
            media_type="text/event-stream"
        )
    except RateLimitExceeded:
        raise
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro no chat: {str(e)}")

# Health Check
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow()}

# Global Error Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={
            "message": "An unexpected error occurred", 
            "detail": str(exc),
            "traceback": traceback.format_exc()
        },
    )

# Mount frontend
frontend_path = os.path.join(os.getcwd(), "frontend")
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
else:
    print(f"Warning: Frontend path {frontend_path} not found.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
