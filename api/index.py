from backend.main import app

# Vercel espera isso para rodar o FastAPI como Serverless Function
handler = app
