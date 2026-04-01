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

# Local imports
from .providers import stream_provider
from .routes import auth, admin
from .database.session import engine
from .database.models import Base

# Rate Limiter
limiter = Limiter(key_func=get_remote_address)
app = FastAPI(
    title="MasterGPT API",
    description="Professional AI Coder API with Secure Auth and Admin Dashboard",
    version="2.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Database Initialization
@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

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

@app.post("/api/chat")
@limiter.limit("5/minute")
async def chat_endpoint(request: Request):
    """
    Unified endpoint for AI requests.
    Expects JSON: { "provider": str, "model": str, "messages": list }
    """
    try:
        data = await request.json()
        provider = data.get("provider")
        model = data.get("model")
        messages = data.get("messages")

        if not provider or not model or not messages:
            raise HTTPException(status_code=400, detail="Missing required fields")

        return StreamingResponse(
            stream_provider(provider, model, messages),
            media_type="text/event-stream"
        )
    except RateLimitExceeded:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Health Check
@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.utcnow()}

# Global Error Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"message": "An unexpected error occurred", "detail": str(exc)},
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
