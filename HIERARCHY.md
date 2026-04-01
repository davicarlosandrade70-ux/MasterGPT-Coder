# 🏗️ Hierarquia e Arquitetura do Projeto MasterGPT-Coder

Este documento detalha a estrutura de diretórios e a organização lógica do projeto **MasterGPT-Coder**, servindo como guia para desenvolvedores e manutenção.

## 📂 Árvore de Diretórios

```text
MasterGPT-Coder/
├── 📁 .github/              # Configurações do GitHub
│   └── 📁 workflows/        # CI/CD (GitHub Actions)
│       └── ci-cd.yml        # Pipeline de Testes e Deploy Vercel
├── 📁 backend/              # Lógica de Servidor (FastAPI)
│   ├── 📁 auth/             # Segurança e Autenticação
│   │   ├── security.py      # JWT, Bcrypt, Hashing
│   │   └── deps.py          # Dependências (get_current_user, check_role)
│   ├── 📁 database/         # Camada de Dados
│   │   ├── models.py        # Modelos SQLAlchemy (User, AuditLog, etc.)
│   │   └── session.py       # Configuração Async do SQLite/SQLAlchemy
│   ├── 📁 routes/           # Endpoints da API
│   │   ├── admin.py         # Dashboard Admin e CRUD de Usuários
│   │   └── auth.py          # Registro e Login
│   ├── 📁 services/         # (Futuro) Regras de negócio complexas
│   ├── 📁 utils/            # Utilitários auxiliares
│   │   └── email.py         # Envio de emails (SMTP/FastAPI-Mail)
│   ├── main.py              # Ponto de entrada da aplicação FastAPI
│   └── providers.py         # Integração com LLMs (Groq, OpenRouter)
├── 📁 frontend/             # Interface do Usuário (Vanilla JS)
│   ├── auth.js              # Lógica de cliente para autenticação
│   ├── core.js              # Gerenciamento de streaming e chat
│   ├── index.html           # Estrutura principal da Single Page App
│   ├── MarkdownRenderer.js  # Renderizador em blocos de alta performance
│   ├── skills.js            # Sistema de plugins/ferramentas da IA
│   ├── style.css            # Estilização (Dark Pro Theme + Admin)
│   ├── ui.js                # Manipulação de DOM e componentes visuais
│   └── test-renderer.js     # Testes unitários do renderizador Markdown
├── 📁 tests/                # Testes de Integração e Unitários
│   └── test_auth.py         # Testes de fluxo de autenticação
├── .env                     # Variáveis de ambiente (Chaves API, Secrets)
├── .gitignore               # Arquivos ignorados pelo Git
├── Dockerfile               # Configuração de containerização Docker
├── HIERARCHY.md             # Este documento
├── README.md                # Guia de instalação e visão geral
├── requirements.txt         # Dependências Python
├── run.py                   # Script de inicialização (com fix Unicode)
└── vercel.json              # Configuração de deploy para Vercel
```

---

## 🏛️ Descrição dos Módulos Principais

### 1. Backend (FastAPI)
O backend segue uma arquitetura em camadas para separação de responsabilidades:
- **`database/`**: Define como os dados são estruturados e como o banco se conecta.
- **`auth/`**: Centraliza toda a lógica de segurança, garantindo que senhas nunca sejam armazenadas em texto puro e gerindo tokens JWT.
- **`routes/`**: Expõe as funcionalidades para o frontend. Cada arquivo representa um domínio (Autenticação, Administração, Chat).
- **`main.py`**: Orquestra a aplicação, configura o Rate Limiting e monta os arquivos estáticos do frontend.

### 2. Frontend (Modern Vanilla JS)
Focado em performance e UX "IA-first":
- **`MarkdownRenderer.js`**: Um dos componentes mais críticos; utiliza cache por hash e `IntersectionObserver` para garantir que chats longos não travem o navegador.
- **`core.js`**: Gerencia o ciclo de vida das mensagens, desde o envio até o streaming da resposta e execução de "skills".
- **`auth.js`**: Mantém o estado da sessão do usuário e interage com os endpoints protegidos.

### 3. DevOps & Infra
- **CI/CD**: Garante que o código só vá para produção se passar nos testes e atingir 80% de cobertura.
- **Docker**: Facilita o ambiente de desenvolvimento idêntico à produção.
- **Vercel**: Configuração otimizada para rodar o backend Python como *Serverless Functions* e o frontend como *Static Assets*.

---

## 🔄 Fluxo de Dados (Exemplo: Login)

1. O usuário preenche o formulário no `frontend/ui.js`.
2. O `frontend/auth.js` envia uma requisição POST para `/api/auth/login`.
3. O `backend/routes/auth.py` recebe a requisição, valida as credenciais usando `backend/auth/security.py`.
4. Se válido, o backend registra o login em `backend/database/models.py` (AuditLog) e retorna um token JWT.
5. O frontend armazena o token no `localStorage` e atualiza a UI.
