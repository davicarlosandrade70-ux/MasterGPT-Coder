# MasterGPT-Coder v2.0 🚀

Sistema profissional de IA Coder com autenticação segura, dashboard administrativo e renderização de alta performance.

## 🌟 Funcionalidades Principais

- **Autenticação Segura**: JWT, Bcrypt para senhas, controle de sessão e recuperação por email.
- **Dashboard Admin**: CRUD completo de usuários, níveis de permissão (Admin, Moderador, Usuário), logs de auditoria.
- **Performance**: Renderização Markdown em blocos com cache, lazy loading e Intersection Observer.
- **Segurança**: Rate limiting, proteção contra SQL Injection e XSS, conformidade LGPD/GDPR.
- **DevOps**: Docker, CI/CD Pipeline (GitHub Actions), configuração para Vercel.

## 🛠️ Tecnologias

- **Backend**: FastAPI, SQLAlchemy, Pydantic, Jose (JWT), SlowAPI, Pandas.
- **Frontend**: Vanilla JS (ES6+), CSS3 (Modern UI), Marked.js, Highlight.js.
- **DevOps**: Docker, Vercel, GitHub Actions.

## 🚀 Instalação e Configuração

### Local (Desenvolvimento)

1. Clone o repositório.
2. Crie um ambiente virtual e instale as dependências:
   ```bash
   python -m venv venv
   source venv/bin/activate  # ou venv\Scripts\activate no Windows
   pip install -r requirements.txt
   ```
3. Configure o arquivo `.env`:
   ```env
   SECRET_KEY=sua_chave_secreta_aqui
   DATABASE_URL=sqlite+aiosqlite:///./sql_app.db
   GROQ_API_KEY=sua_chave_groq
   # Configurações de Email (Opcional para reset de senha)
   MAIL_USERNAME=seu_email@gmail.com
   MAIL_PASSWORD=sua_senha_app
   ```
4. Inicie o servidor:
   ```bash
   python run.py
   ```
5. Acesse: `http://localhost:8000`

### Produção (Vercel)

1. Conecte seu repositório GitHub ao Vercel.
2. Adicione as variáveis de ambiente no painel do Vercel (`SECRET_KEY`, `GROQ_API_KEY`, etc.).
3. O Vercel detectará o arquivo `vercel.json` e configurará automaticamente as Serverless Functions do Python e os arquivos estáticos.

## 🐳 Docker

Para rodar em container:
```bash
docker build -t mastergpt .
docker run -p 8000:8000 mastergpt
```

## 🧪 Testes

Execute os testes com coverage:
```bash
pytest --cov=backend tests/
```

## 📜 Conformidade LGPD/GDPR

- **Anonimização**: Logs de auditoria não armazenam dados sensíveis sem necessidade.
- **Direito ao Esquecimento**: Administradores podem excluir usuários e todos os seus dados permanentemente.
- **Segurança**: Criptografia de ponta a ponta e sanitização de entradas.

---
Desenvolvido com ❤️ por MasterGPT-Coder Team.
