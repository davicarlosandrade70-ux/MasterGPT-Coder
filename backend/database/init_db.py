import asyncio
from backend.database.session import engine
from backend.database.models import Base

async def init_db():
    print("Iniciando criação das tabelas no Supabase...")
    async with engine.begin() as conn:
        # No local zera, mas no Supabase vamos garantir que as tabelas existam
        await conn.run_sync(Base.metadata.create_all)
    print("Tabelas criadas com sucesso!")

if __name__ == "__main__":
    asyncio.run(init_db())
