// ═══════════════════════════════════════════════════════════════════
//  MASTERGPT-CODER — core.js v4.0
//  Estado global, modelos, keys, sistema, utilitários
// ═══════════════════════════════════════════════════════════════════

// ── MODELOS ────────────────────────────────────────────────────────
const MODELS = {
  groq: [
    { label: "Llama 3.3 70B", value: "llama-3.3-70b-versatile", tag: "Rápido" },
    { label: "Llama 3.1 8B Instant", value: "llama-3.1-8b-instant", tag: "Ultra-rápido" },
    { label: "Allam 2 7B", value: "allam-2-7b", tag: "" }
  ],
  openrouter: [
    { label: "Qwen3.6 Plus Preview", value: "qwen/qwen3.6-plus-preview:free", tag: "Grátis" },
    { label: "GLM-4.5 Air", value: "z-ai/glm-4.5-air:free", tag: "Grátis" },
    { label: "Step 3.5 Flash", value: "stepfun/step-3.5-flash:free", tag: "Grátis" },
    { label: "Trinity Large Preview", value: "arcee-ai/trinity-large-preview:free", tag: "Grátis" },
    { label: "Trinity Mini", value: "arcee-ai/trinity-mini:free", tag: "Grátis" },
    { label: "Auto Free", value: "openrouter/free", tag: "Grátis" }
  ],
  mistral: [
    { label: "Mistral Small", value: "mistral-small-latest", tag: "Eficiente" },
    { label: "Mistral Large", value: "mistral-large-latest", tag: "Potente" },
    { label: "Mistral Tiny", value: "mistral-tiny-latest", tag: "Ultra-rápido" },
    { label: "Mistral Medium", value: "mistral-medium-latest", tag: "Balanceado" },
    { label: "Codestral Latest", value: "codestral-latest", tag: "Código" },
    { label: "Open Mistral 7B", value: "open-mistral-7b", tag: "Leve" },
    { label: "Open Mixtral 8x7B", value: "open-mixtral-8x7b", tag: "MoE" },
    { label: "Open Mixtral 8x22B", value: "open-mixtral-8x22b", tag: "Forte" },
  ]
};

// API keys are now managed by the backend for security.

// Key rotation is now handled by the backend.

// ── STATE ──────────────────────────────────────────────────────────
let orchMode = 'simple';
let selectedModel = { provider: 'groq', value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' };
let orchSlots = [
  { provider: 'groq', value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
  { provider: 'groq', value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant' },
  { provider: 'groq', value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B' }
];
let showReasoning = false;
let conversations = [];
let activeConvId = null;
let isLoading = false;
let abortController = null;
let pendingConfirmFn = null;
let userScrolledUp = false;

// ── SYSTEM PROMPT ──────────────────────────────────────────────────
const SYSTEM_BASE = `Você é MasterGPT, um assistente inteligente e versátil. Suas respostas devem ser naturais, contextuais e coesas.

# REGRAS FUNDAMENTAIS

## Idioma
Responda SEMPRE no mesmo idioma do usuário. Detecte automaticamente (pt-BR, en, es, etc.).

## Natureza das Respostas
- Você NÃO é exclusivamente um assistente de código. Responda de forma natural e completa ao que o usuário pede.
- Para perguntas gerais, filosóficas, criativas ou conceituais: responda em prosa clara e envolvente.
- Para pedidos de código: forneça código limpo, funcional e bem explicado.
- Para análises, resumos ou debates: seja estruturado mas fluente, como um especialista conversando.
- Adapte o tom: casual para bate-papo, técnico para programação, reflexivo para filosofia.

## Código (quando solicitado)
- Sempre em blocos com linguagem especificada (\`\`\`javascript, \`\`\`python, etc.)
- Production-ready, com tratamento de erros e boas práticas
- Variáveis em inglês (convenção universal)
- Comentários apenas quando explicam lógica não óbvia
- Sempre inclua exemplo de uso ou teste

## Qualidade Geral
- Respostas completas, mas sem enrolação
- Exemplos concretos quando ajudam a entender
- Se há múltiplas perspectivas válidas, apresente-as com equilíbrio
- Seja honesto sobre incertezas

## Orquestração (modo complexo)
- O processo de refinamento é invisível para o usuário
- A resposta final deve ser unificada, polida e direta
- NUNCA mencione "fases", "rascunho", "revisão" ou o processo interno

# PROIBIÇÕES
- NUNCA diga "Como assistente de IA..."
- NUNCA invente APIs, bibliotecas ou fatos que não existem
- NUNCA seja pedante ou repetitivo
- NUNCA trate toda conversa como se fosse sobre programação`;

// window.__SYSTEM é o prompt ativo (pode ser enriquecido por skills)
window.__SYSTEM = SYSTEM_BASE;

// ── PERSISTÊNCIA ───────────────────────────────────────────────────
function loadPersistedState() {
  try {
    conversations = JSON.parse(localStorage.getItem('mgpt2_convs') || '[]');
  } catch (e) { conversations = []; }

  try {
    const s = localStorage.getItem('mgpt2_settings');
    if (s) {
      const p = JSON.parse(s);
      if (p.orchMode) orchMode = p.orchMode;
      if (p.selectedModel) selectedModel = p.selectedModel;
      if (p.orchSlots) orchSlots = p.orchSlots;
      if (typeof p.showReasoning === 'boolean') showReasoning = p.showReasoning;
    }
  } catch (e) { }
}

function saveSettings() {
  try {
    localStorage.setItem('mgpt2_settings',
      JSON.stringify({ orchMode, selectedModel, orchSlots, showReasoning }));
  } catch (e) { }
}

// ── MARKED / HIGHLIGHT ─────────────────────────────────────────────
marked.setOptions({ 
  breaks: true, 
  gfm: true,
  highlight: (code, lang) => {
    const language = (lang || 'plaintext').trim();
    try { return hljs.highlight(code, { language }).value; }
    catch (e) { return hljs.highlightAuto(code).value; }
  }
});
const codeStore = {};

/**
 * Renderiza markdown básico (sem lazy loading/blocos complexos)
 * Usado para casos simples onde não há um container dedicado.
 */
function renderMarkdown(text) {
  return marked.parse(text);
}

/**
 * Renderiza markdown usando o sistema avançado de blocos e cache
 */
function renderMarkdownToContainer(text, container, useLazy = true) {
  if (window.mdRenderer) {
    window.mdRenderer.render(text, container, useLazy);
  } else {
    container.innerHTML = renderMarkdown(text);
  }
}

window.copyCode = function (id, btn) {
  const code = codeStore[id];
  if (!code) return;
  navigator.clipboard.writeText(code).then(() => {
    if (btn) {
      btn.innerHTML = '✓ Copiado';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg> Copiar`;
        btn.classList.remove('copied');
      }, 2000);
    }
    showToast('Código copiado!', 'ok');
  }).catch(() => showToast('Falha ao copiar', 'err'));
};

// ── UTILITÁRIOS ────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showToast(msg, type = 'err') {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.style.borderLeft = type === 'ok' ? '2px solid var(--accent)' : '2px solid var(--danger)';
  t.classList.add('show');
  clearTimeout(t._to);
  t._to = setTimeout(() => t.classList.remove('show'), 2800);
}

function allModelsFlat() {
  const all = [];
  MODELS.groq.forEach(m => all.push({ ...m, provider: 'groq' }));
  MODELS.openrouter.forEach(m => all.push({ ...m, provider: 'openrouter' }));
  MODELS.mistral.forEach(m => all.push({ ...m, provider: 'mistral' }));
  return all;
}

// ── API: BACKEND PROXY ────────────────────────────────────────────
async function streamModel(provider, modelValue, messages, targetEl = null, signal = null) {
  const apiMessages = [
    { role: 'system', content: window.__SYSTEM },
    ...messages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content
    }))
  ];

  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // Determinar URL do backend
  // Se estiver usando VS Code Live Server (porta 5500), redirecionamos para o FastAPI na porta 8000.
  const isDev = location.port === '5500' || location.hostname === '127.0.0.1';
  const apiUrl = isDev ? 'http://localhost:8000/api/chat' : '/api/chat';

  let res;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, model: modelValue, messages: apiMessages }),
      signal
    });
  } catch(e) {
    if (e.name === 'AbortError') throw e;
    throw new Error(`Sem conexão com o servidor backend (${e.message})`);
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({ detail: 'Erro desconhecido no servidor' }));
    throw new Error(`Backend Error: ${errorData.detail}`);
  }

  // readStream is already defined below
  return readStream(res, targetEl, signal);
}

// ── STREAM READER ──────────────────────────────────────────────────
function appendStreamingRow() {
  const welcome = document.getElementById('welcome');
  if (welcome) welcome.remove();
  const area = document.getElementById('chat-area');
  const wrapper = document.createElement('div');
  wrapper.className = 'msg-wrapper';
  wrapper.id = 'streaming-wrapper';
  wrapper.innerHTML = `<div class="msg-row assistant">
    <div class="msg-content">
      <div class="msg-text" id="streaming-text">
        <span class="thinking-dots" aria-label="Processando...">
          <span></span><span></span><span></span>
        </span>
      </div>
    </div>
  </div>`;
  area.appendChild(wrapper);
  smartScroll();
  return document.getElementById('streaming-text');
}

function removeStreamingRow() {
  document.getElementById('streaming-wrapper')?.remove();
}

async function readStream(response, externalEl, signal) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  let content = '';
  let reasoning = '';
  let inReasoning = false;
  let reasonBuf = '';
  let buffer = '';

  const streamEl = externalEl || appendStreamingRow();
  streamEl.innerHTML = '';

  let lastRenderedLength = 0;
  let renderScheduled = false;

  const scheduleRender = () => {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      if (content.length - lastRenderedLength < 20 && !content.endsWith('\n')) return;
      renderMarkdownToContainer(content, streamEl, false); // No streaming, lazy loading is usually off
      lastRenderedLength = content.length;
      smartScroll();
    });
  };

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (signal?.aborted) break;
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        let parsed;
        try { parsed = JSON.parse(data); } catch { continue; }

        const delta = parsed?.choices?.[0]?.delta?.content;
        if (!delta) continue;

        // Detectar blocos de raciocínio
        if (!inReasoning && (delta.includes('<thinking>') || delta.includes('<reasoning>'))) {
          inReasoning = true;
          continue;
        }
        if (inReasoning && (delta.includes('</thinking>') || delta.includes('</reasoning>'))) {
          inReasoning = false;
          if (showReasoning) reasoning = reasonBuf.trim();
          reasonBuf = '';
          continue;
        }
        if (inReasoning) {
          reasonBuf += delta;
          continue;
        }

        content += delta;
        scheduleRender();
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Render final
  if (streamEl && content) {
    renderMarkdownToContainer(content, streamEl, true); // Final render with lazy loading
    smartScroll();
  }

  if (!externalEl) removeStreamingRow();

  if (signal?.aborted && !content) {
    throw new DOMException('Aborted', 'AbortError');
  }

  return {
    content: content || '(sem resposta)',
    reasoning: showReasoning ? (reasoning || null) : null
  };
}

// ── ORQUESTRAÇÃO (MODO COMPLEXO) ───────────────────────────────────
async function runOrchestration(messages, signal) {
  // Fase 1: Exploração criativa
  const result1 = await streamModel(
    orchSlots[0].provider, orchSlots[0].value,
    messages, null, signal
  );
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // Fase 2: Análise crítica silenciosa
  const critiquePrompt = `Revise criticamente a resposta anterior. Seja objetivo e conciso. Identifique:
- Imprecisões técnicas ou factuais
- Pontos incompletos ou mal explicados
- Melhorias de clareza e estrutura
Apenas liste as observações, sem reescrever a resposta.`;

  const step2Messages = [
    ...messages,
    { role: 'assistant', content: result1.content },
    { role: 'user', content: critiquePrompt }
  ];
  const result2 = await streamModel(
    orchSlots[1].provider, orchSlots[1].value,
    step2Messages, null, signal
  );
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

  // Fase 3: Síntese final
  const finalPrompt = `Com base na análise crítica, reescreva a resposta em sua versão final e aprimorada.
A resposta deve ser completa, coesa e pronta. Não mencione o processo de revisão.`;

  const step3Messages = [
    ...messages,
    { role: 'assistant', content: result1.content },
    { role: 'user', content: finalPrompt }
  ];
  const finalResult = await streamModel(
    orchSlots[2].provider, orchSlots[2].value,
    step3Messages, null, signal
  );

  return {
    content: finalResult.content,
    reasoning: showReasoning
      ? `📝 **Rascunho inicial:**\n${result1.content}\n\n🔍 **Críticas identificadas:**\n${result2.content}`
      : null
  };
}
