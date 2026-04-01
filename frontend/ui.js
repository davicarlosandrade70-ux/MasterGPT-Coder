// ═══════════════════════════════════════════════════════════════════
//  MASTERGPT-CODER — ui.js v4.0
//  Interface, renderização, histórico, modais, reasoning visual
// ═══════════════════════════════════════════════════════════════════

// ── SCROLL ────────────────────────────────────────────────────────
const chatArea = document.getElementById('chat-area');
const scrollFab = document.getElementById('scroll-fab');

chatArea.addEventListener('scroll', () => {
  const atBottom = chatArea.scrollHeight - chatArea.scrollTop - chatArea.clientHeight < 80;
  userScrolledUp = !atBottom;
  if (scrollFab) scrollFab.style.display = userScrolledUp ? 'flex' : 'none';
});

function scrollToBottom(smooth = true) {
  chatArea.scrollTo({ top: chatArea.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
  userScrolledUp = false;
  if (scrollFab) scrollFab.style.display = 'none';
}

function smartScroll() {
  if (!userScrolledUp) chatArea.scrollTop = chatArea.scrollHeight;
}

// ── INPUT ─────────────────────────────────────────────────────────
function setLoading(v) {
  isLoading = v;
  const btn = document.getElementById('send-btn');
  const dot = document.getElementById('status-dot');
  const stopBtn = document.getElementById('stop-btn');
  btn.disabled = v || !document.getElementById('user-input').value.trim();
  dot.className = 'status-dot' + (v ? ' loading' : '');
  if (stopBtn) stopBtn.style.display = v ? 'flex' : 'none';
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 220) + 'px';
}

function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

document.getElementById('user-input').addEventListener('input', function () {
  document.getElementById('send-btn').disabled = !this.value.trim() || isLoading;
});

function stopGeneration() {
  if (abortController) {
    abortController.abort();
    abortController = null;
    showToast('Geração interrompida', 'ok');
  }
}

// ── REASONING TOGGLE ──────────────────────────────────────────────
function toggleReasoning() {
  showReasoning = !showReasoning;
  const btn = document.getElementById('reasoning-btn');
  if (btn) {
    btn.classList.toggle('active', showReasoning);
    btn.setAttribute('aria-pressed', showReasoning);
  }
  saveSettings();
  showToast(showReasoning ? 'Modo pensar ativado' : 'Modo pensar desativado', 'ok');
}

// Aplicar estado inicial do reasoning
const _reasonBtn = document.getElementById('reasoning-btn');
if (_reasonBtn && showReasoning) {
  _reasonBtn.classList.add('active');
  _reasonBtn.setAttribute('aria-pressed', 'true');
}

// ── SIDEBAR MOBILE ────────────────────────────────────────────────
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('visible');
  document.getElementById('menu-toggle')?.setAttribute('aria-expanded', 'true');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
  document.getElementById('menu-toggle')?.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}

function historyClickHandler(id) {
  loadConv(id);
  if (window.innerWidth <= 768) closeSidebar();
}

// ── CONFIRM MODAL ─────────────────────────────────────────────────
function showConfirm(fn) {
  pendingConfirmFn = fn;
  document.getElementById('confirm-overlay').classList.add('open');
}
function closeConfirm() {
  pendingConfirmFn = null;
  document.getElementById('confirm-overlay').classList.remove('open');
}
function doConfirm() {
  if (typeof pendingConfirmFn === 'function') pendingConfirmFn();
  closeConfirm();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeConfirm(); }
});

// ── HISTÓRICO ─────────────────────────────────────────────────────
function renderHistory() {
  const list = document.getElementById('history-list');
  if (!conversations.length) {
    list.innerHTML = '<div class="history-empty">Nenhuma conversa salva</div>';
    return;
  }
  list.innerHTML = conversations.slice(0, 50).map(c =>
    `<div class="history-item-container${c.id === activeConvId ? ' active' : ''}">
      <button class="history-item"
        onclick="historyClickHandler('${c.id}')"
        role="listitem"
        title="${escHtml(c.title)}"
      >${escHtml(c.title)}</button>
      <button class="history-delete-btn" onclick="deleteConversation('${c.id}', event)" title="Apagar conversa">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>
    </div>`
  ).join('');
}

function deleteConversation(id, event) {
  if (event) event.stopPropagation();
  
  // Encontrar a conversa para mostrar o título no confirm (opcional, mas bom UX)
  const conv = conversations.find(c => c.id === id);
  if (!conv) return;

  showConfirm(() => {
    conversations = conversations.filter(c => c.id !== id);
    localStorage.setItem('mgpt2_convs', JSON.stringify(conversations.slice(0, 60)));
    
    if (activeConvId === id) {
      newChat();
    } else {
      renderHistory();
    }
    showToast('Conversa apagada', 'ok');
  });
}

function getConvMessages() {
  if (!activeConvId) return [];
  return conversations.find(c => c.id === activeConvId)?.messages || [];
}

function saveConv(id, messages) {
  const firstUser = messages.find(m => m.role === 'user')?.content || 'Conversa';
  const title = firstUser.slice(0, 50) + (firstUser.length > 50 ? '…' : '');
  const idx = conversations.findIndex(c => c.id === id);
  if (idx >= 0) {
    conversations[idx].messages = messages;
    conversations[idx].title = title;
  } else {
    conversations.unshift({ id, title, messages });
  }
  localStorage.setItem('mgpt2_convs', JSON.stringify(conversations.slice(0, 60)));
  renderHistory();
}

function loadConv(id) {
  const conv = conversations.find(c => c.id === id);
  if (!conv) return;
  activeConvId = id;
  chatArea.innerHTML = '';
  conv.messages.forEach(m => renderMessage(m.role, m.content, m.reasoning, false));
  scrollToBottom(false);
  renderHistory();
}

function newChat() {
  activeConvId = null;
  chatArea.innerHTML = '';
  userScrolledUp = false;
  if (scrollFab) scrollFab.style.display = 'none';
  renderWelcome();
  renderHistory();
  document.getElementById('user-input').focus();
}

function clearHistory() {
  showConfirm(() => {
    conversations = [];
    localStorage.removeItem('mgpt2_convs');
    activeConvId = null;
    renderHistory();
    newChat();
    showToast('Histórico limpo', 'ok');
  });
}

function exportChat() {
  const messages = getConvMessages();
  if (!messages.length) {
    showToast('Nenhuma mensagem para exportar', 'err');
    return;
  }

  const title = conversations.find(c => c.id === activeConvId)?.title || 'conversa';
  let md = `# ${title}\n\n`;

  messages.forEach(m => {
    const role = m.role === 'user' ? 'USUÁRIO' : 'ASSISTENTE';
    md += `## ${role}\n\n${m.content}\n\n`;
    if (m.reasoning) {
      md += `> **Raciocínio:**\n> ${m.reasoning.replace(/\n/g, '\n> ')}\n\n`;
    }
    md += `---\n\n`;
  });

  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.toLowerCase().replace(/\s+/g, '-')}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Conversa exportada!', 'ok');
}

// ── WELCOME ───────────────────────────────────────────────────────
function renderWelcome() {
  chatArea.innerHTML = `<div id="welcome">
    <div class="welcome-logo">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
      </svg>
    </div>
    <div class="welcome-title">Como posso ajudar?</div>
    <div class="suggestions">
      <div class="suggestion" onclick="useSuggestion('Analise e corrija os bugs no meu código')">
        <strong>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/><path d="M8 11h6"/></svg>
          Debug
        </strong>Encontre e corrija erros no código
      </div>
      <div class="suggestion" onclick="useSuggestion('Refatore e melhore a performance do meu código')">
        <strong>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M13 3L4 14h7l-2 7 9-11h-7l2-7z"/></svg>
          Otimizar
        </strong>Melhore performance e legibilidade
      </div>
      <div class="suggestion" onclick="useSuggestion('Me explique um conceito com exemplos práticos')">
        <strong>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M4 4h16v12H4zM8 20h8M12 16v4"/></svg>
          Explicar
        </strong>Entenda qualquer conceito em detalhes
      </div>
      <div class="suggestion" onclick="useSuggestion('Projete a arquitetura para minha aplicação')">
        <strong>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg>
          Arquitetura
        </strong>Planeje estrutura e design do projeto
      </div>
    </div>
  </div>`;
}

function useSuggestion(t) {
  const inp = document.getElementById('user-input');
  inp.value = t;
  autoResize(inp);
  document.getElementById('send-btn').disabled = false;
  sendMessage();
}

// ── RENDERIZAR MENSAGEM ────────────────────────────────────────────
function renderMessage(role, content, reasoning, animate = true) {
  const welcome = document.getElementById('welcome');
  if (welcome) welcome.remove();

  const wrapper = document.createElement('div');
  wrapper.className = 'msg-wrapper';
  if (!animate) wrapper.style.animation = 'none';

  const row = document.createElement('div');
  row.className = `msg-row ${role}`;

  // ── Bloco de raciocínio visual melhorado ──────────────────────
  let reasoningHtml = '';
  if (role === 'assistant' && showReasoning && reasoning?.trim()) {
    // Detectar se é modo complexo (tem "Rascunho inicial")
    const isComplex = reasoning.includes('Rascunho inicial') || reasoning.includes('Críticas identificadas');
    const title = isComplex ? 'Processo de orquestração' : 'Raciocínio interno';

    // Processar markdown no raciocínio
    const reasoningRendered = renderMarkdown(reasoning);

    reasoningHtml = `<div class="reasoning-block">
      <button class="reasoning-toggle-header" onclick="toggleReasoningBlock(this)" aria-expanded="false">
        <div class="reasoning-header-left">
          <div class="reasoning-icon ${isComplex ? 'complex' : 'simple'}">
            ${isComplex
        ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>`
        : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9.5 3A2.5 2.5 0 0 1 12 5.5 2.5 2.5 0 0 1 9.5 8 2.5 2.5 0 0 1 7 5.5 2.5 2.5 0 0 1 9.5 3z"/><path d="M14.5 8A2.5 2.5 0 0 1 17 10.5 2.5 2.5 0 0 1 14.5 13 2.5 2.5 0 0 1 12 10.5 2.5 2.5 0 0 1 14.5 8z"/><path d="M9.5 16A2.5 2.5 0 0 1 12 18.5 2.5 2.5 0 0 1 9.5 21 2.5 2.5 0 0 1 7 18.5 2.5 2.5 0 0 1 9.5 16z"/><path d="M9.5 8v8M14.5 13l-5 3"/></svg>`
      }
          </div>
          <span class="reasoning-title">${title}</span>
          ${isComplex
        ? `<span class="reasoning-badge complex">3 fases</span>`
        : `<span class="reasoning-badge simple">interno</span>`
      }
        </div>
        <svg class="ra-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="reasoning-body">
        <div class="reasoning-content">${reasoningRendered}</div>
      </div>
    </div>`;
  }

  if (role === 'user') {
    row.innerHTML = `<div class="msg-content">
      <div class="msg-bubble">${escHtml(content)}</div>
    </div>`;
  } else {
    const msgId = 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    row.innerHTML = `<div class="msg-content">
      ${reasoningHtml}
      <div class="msg-text"></div>
      <div class="msg-actions">
        <button class="msg-action-btn" data-content="${escHtml(content)}"
          onclick="copyMessage(this)" aria-label="Copiar resposta">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          Copiar
        </button>
      </div>
    </div>`;
    
    // Renderizar o markdown no elemento criado
    const textEl = row.querySelector('.msg-text');
    if (textEl) {
      renderMarkdownToContainer(content, textEl, true);
    }
  }

  wrapper.appendChild(row);
  chatArea.appendChild(wrapper);
  smartScroll();
  return wrapper;
}

// Expor globalmente para uso em onclick inline
window.toggleReasoningBlock = function (header) {
  const body = header.nextElementSibling;
  const isOpen = body.classList.toggle('open');
  header.classList.toggle('open', isOpen);
  header.setAttribute('aria-expanded', String(isOpen));
};

window.copyMessage = function (btn) {
  const content = btn.dataset.content;
  if (!content) return;
  navigator.clipboard.writeText(content)
    .then(() => {
      const orig = btn.innerHTML;
      btn.innerHTML = '✓ Copiado';
      btn.classList.add('copied');
      setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
      showToast('Mensagem copiada!', 'ok');
    })
    .catch(() => showToast('Falha ao copiar', 'err'));
};

// ── ERRO ──────────────────────────────────────────────────────────
function renderError(message, retryFn) {
  removeStreamingRow();
  const wrapper = document.createElement('div');
  wrapper.className = 'msg-wrapper';
  wrapper.id = 'error-wrapper';
  const retryId = 'retry_' + Date.now();
  wrapper.innerHTML = `<div class="msg-row assistant">
    <div class="msg-content">
      <div class="msg-error">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
        </svg>
        <div>
          <div style="font-weight:600;margin-bottom:4px;">Erro na requisição</div>
          <div>${escHtml(message)}</div>
          ${retryFn ? `<button class="retry-btn" id="${retryId}">Tentar novamente</button>` : ''}
        </div>
      </div>
    </div>
  </div>`;
  chatArea.appendChild(wrapper);
  smartScroll();
  if (retryFn) {
    document.getElementById(retryId)?.addEventListener('click', () => {
      wrapper.remove();
      retryFn();
    });
  }
}

// ── ENVIO DE MENSAGEM + FEEDBACK LOOP ────────────────────────────
async function sendMessage() {
  if (isLoading) return;
  const input = document.getElementById('user-input');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;
  userScrolledUp = false;
  setLoading(true);

  if (!activeConvId)
    activeConvId = 'c' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

  const messages = getConvMessages();
  messages.push({ role: 'user', content: text });
  renderMessage('user', text);
  saveConv(activeConvId, messages);

  const doSend = async () => {
    try {
      abortController = new AbortController();
      let result;

      if (orchMode === 'complex') {
        result = await runOrchestration(messages, abortController.signal);
      } else {
        result = await streamModel(
          selectedModel.provider, selectedModel.value,
          messages, null, abortController.signal
        );
      }

      removeStreamingRow();
      let { content, reasoning } = result;

      // ── Processar skills + obter output para IA ──────────────
      const skillContext = { convId: activeConvId, messages };
      const skillResult = await processSkillBlocks(content, skillContext);
      const { renderedContent, skillOutputsForAI, skillHtmlMap } = skillResult;

      const hasSkills = !!skillOutputsForAI;

      // Salvar a resposta original (sem os outputs visuais inline, mas com marcadores)
      const contentToSave = hasSkills ? renderedContent : content;
      messages.push({ role: 'assistant', content: contentToSave, reasoning: reasoning || null });

      // Renderizar mensagem — passa o conteúdo e injeta os previews visuais depois
      const msgWrapper = renderMessage('assistant', hasSkills ? renderedContent : content, reasoning || null);

      // Injetar os HTML visuais das skills no DOM
      if (hasSkills && msgWrapper && Object.keys(skillHtmlMap).length > 0) {
        injectSkillOutputsIntoDOM(msgWrapper, skillHtmlMap);
      }

      saveConv(activeConvId, messages);

      // ── FEEDBACK LOOP: IA vê o output e comenta ───────────────
      if (hasSkills && !abortController?.signal?.aborted) {
        await runSkillFeedbackLoop(messages, skillOutputsForAI, reasoning);
      }

    } catch (err) {
      removeStreamingRow();
      if (err.name === 'AbortError') {
        setLoading(false);
        return;
      }
      const errMsg = err.message || 'Falha na API. Verifique sua conexão.';
      console.error('MasterGPT Error:', err);
      renderError(errMsg, doSend);
    }
    abortController = null;
    setLoading(false);
  };

  await doSend();
}

// ── FEEDBACK LOOP: IA analisa o output das skills ─────────────────
async function runSkillFeedbackLoop(messages, skillOutputsForAI, previousReasoning) {
  // Breve delay visual para a IA "processar" o output
  await new Promise(r => setTimeout(r, 400));

  if (abortController?.signal?.aborted) return;

  // Mensagem interna: diz para a IA o que aconteceu quando as skills rodaram
  const feedbackPrompt = `Os resultados das ferramentas executadas foram:

${skillOutputsForAI}

Analise o output acima e responda naturalmente:
- Se o código funcionou: confirme e explique o que foi demonstrado
- Se houve erro: identifique a causa e proponha a correção
- Se é uma resposta de API: interprete os dados retornados
- Seja direto e coeso, como se você tivesse visto o resultado em tempo real`;

  const feedbackMessages = [
    ...messages,
    { role: 'user', content: feedbackPrompt }
  ];

  // Mostrar um indicador de que a IA está analisando o output
  const statusWrapper = appendFeedbackIndicator();

  try {
    const feedbackResult = await streamModel(
      selectedModel.provider, selectedModel.value,
      feedbackMessages, null,
      abortController?.signal
    );

    removeFeedbackIndicator();

    if (feedbackResult.content && feedbackResult.content !== '(sem resposta)') {
      // Adicionar badge "IA viu o output" + renderizar análise
      const analysisContent = feedbackResult.content;
      messages.push({ role: 'assistant', content: analysisContent, reasoning: null, isFeedback: true });
      renderFeedbackMessage(analysisContent);
      saveConv(activeConvId, messages);
    }
  } catch (err) {
    removeFeedbackIndicator();
    if (err.name !== 'AbortError') {
      console.warn('[FeedbackLoop] Erro ao analisar output:', err.message);
    }
  }
}

// Indicador visual do feedback loop
function appendFeedbackIndicator() {
  const area = document.getElementById('chat-area');
  const el = document.createElement('div');
  el.id = 'feedback-indicator';
  el.className = 'msg-wrapper';
  el.innerHTML = `<div class="msg-row assistant">
    <div class="msg-content">
      <div class="ai-feedback-badge">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        IA analisando o output...
      </div>
      <div class="msg-text">
        <span class="thinking-dots"><span></span><span></span><span></span></span>
      </div>
    </div>
  </div>`;
  area.appendChild(el);
  smartScroll();
  return el;
}

function removeFeedbackIndicator() {
  document.getElementById('feedback-indicator')?.remove();
}

// Renderiza a mensagem de análise com badge especial
function renderFeedbackMessage(content) {
  const welcome = document.getElementById('welcome');
  if (welcome) welcome.remove();

  const wrapper = document.createElement('div');
  wrapper.className = 'msg-wrapper';
  const row = document.createElement('div');
  row.className = 'msg-row assistant';

  row.innerHTML = `<div class="msg-content">
    <div class="ai-feedback-badge">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      Análise do output
    </div>
    <div class="msg-text"></div>
    <div class="msg-actions">
      <button class="msg-action-btn" data-content="${escHtml(content)}" onclick="copyMessage(this)" aria-label="Copiar">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Copiar
      </button>
    </div>
  </div>`;

  const textEl = row.querySelector('.msg-text');
  if (textEl) {
    renderMarkdownToContainer(content, textEl, true);
  }

  wrapper.appendChild(row);
  document.getElementById('chat-area').appendChild(wrapper);
  smartScroll();
  return wrapper;
}

// ── SETTINGS MODAL ────────────────────────────────────────────────
function updateModelDisplay() {
  const name = orchMode === 'complex' ? 'Orquestração' : selectedModel.label;
  const sub = orchMode === 'complex' ? 'Modo complexo' : 'Trocar modelo';
  document.getElementById('topbar-model-name')?.textContent !== undefined &&
    (document.getElementById('topbar-model-name').textContent = name);
  document.getElementById('sidebar-model-name')?.textContent !== undefined &&
    (document.getElementById('sidebar-model-name').textContent = name);
  document.getElementById('sidebar-model-sub')?.textContent !== undefined &&
    (document.getElementById('sidebar-model-sub').textContent = sub);

  const tag = document.getElementById('orch-tag');
  if (tag) {
    tag.textContent = orchMode === 'complex' ? 'COMPLEXO' : 'SIMPLES';
    tag.className = `orchestration-tag ${orchMode}`;
  }
}

function openModal() {
  populateModalModels();
  populateOrchSelects();
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
}
function handleOverlayClick(e) {
  if (e.target === e.currentTarget) closeModal();
}

function setOrchMode(mode) {
  orchMode = mode;
  ['simple', 'complex'].forEach(m => {
    const tab = document.getElementById(`tab-${m}`);
    if (!tab) return;
    tab.className = `orch-tab ${m}${mode === m ? ' active' : ''}`;
    tab.setAttribute('aria-selected', mode === m);
  });
  document.getElementById('simple-panel').style.display = mode === 'simple' ? 'block' : 'none';
  document.getElementById('complex-panel').style.display = mode === 'complex' ? 'block' : 'none';
}

function populateModalModels(filter = '') {
  const list = document.getElementById('model-list');
  const q = filter.toLowerCase();

  const providerConfig = [
    { key: 'groq', icon: '⚡', label: 'Groq — Velocidade máxima', badgeClass: 'groq' },
    { key: 'openrouter', icon: '🌐', label: 'OpenRouter — Modelos gratuitos', badgeClass: 'or' },
    { key: 'mistral', icon: '🧠', label: 'Mistral — Modelos eficientes', badgeClass: 'mistral' }
  ];

  let html = '';
  for (const { key, label, badgeClass } of providerConfig) {
    const filtered = MODELS[key].filter(m =>
      !q || m.label.toLowerCase().includes(q) || m.value.toLowerCase().includes(q)
    );
    if (!filtered.length) continue;

    html += `<div class="provider-group">
      <div class="provider-label">${label}</div>`;
    for (const m of filtered) {
      const active = selectedModel.provider === key && selectedModel.value === m.value;
      html += `<button class="model-option${active ? ' selected' : ''}"
        onclick="selectModel('${key}','${escHtml(m.value)}','${escHtml(m.label)}')"
        role="option" aria-selected="${active}">
        <div class="model-option-left">
          <div class="model-option-badge ${badgeClass}"></div>
          <div class="model-option-name">${escHtml(m.label)}</div>
        </div>
        <div class="model-option-right">
          ${m.tag ? `<span class="model-option-tag">${escHtml(m.tag)}</span>` : ''}
          ${active ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="model-option-check"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
        </div>
      </button>`;
    }
    html += '</div>';
  }

  if (!html) {
    html = `<div style="text-align:center;padding:24px 0;color:var(--text-dim);font-size:13px;">
      Nenhum modelo encontrado para "<strong>${escHtml(filter)}</strong>"
    </div>`;
  }
  list.innerHTML = html;
}

function filterModels() {
  populateModalModels(document.getElementById('model-search').value);
}

function selectModel(provider, value, label) {
  selectedModel = { provider, value, label };
  populateModalModels(document.getElementById('model-search')?.value || '');
}

function populateOrchSelects() {
  const allOpts = () => {
    let html = '<optgroup label="⚡ Groq">';
    MODELS.groq.forEach(m => html += `<option value="groq|${m.value}">${escHtml(m.label)}</option>`);
    html += '</optgroup><optgroup label="🌐 OpenRouter">';
    MODELS.openrouter.forEach(m => html += `<option value="openrouter|${m.value}">${escHtml(m.label)}</option>`);
    html += '</optgroup><optgroup label="🧠 Mistral">';
    MODELS.mistral.forEach(m => html += `<option value="mistral|${m.value}">${escHtml(m.label)}</option>`);
    html += '</optgroup>';
    return html;
  };
  for (let i = 0; i < 3; i++) {
    const sel = document.getElementById(`orch-slot-${i + 1}`);
    if (!sel) continue;
    sel.innerHTML = allOpts();
    const slot = orchSlots[i];
    sel.value = `${slot.provider}|${slot.value}`;
  }
}

function applyModel() {
  if (orchMode === 'complex') {
    for (let i = 0; i < 3; i++) {
      const sel = document.getElementById(`orch-slot-${i + 1}`);
      if (!sel) continue;
      const [provider, ...valueParts] = sel.value.split('|');
      const value = valueParts.join('|');
      const found = allModelsFlat().find(m => m.provider === provider && m.value === value);
      orchSlots[i] = { provider, value, label: found?.label || value };
    }
  }
  saveSettings();
  updateModelDisplay();
  closeModal();
  const msg = orchMode === 'complex' ? 'Orquestração configurada!' : `Modelo: ${selectedModel.label}`;
  showToast(msg, 'ok');
}

// ── CSS EXTRA: REASONING VISUAL MELHORADO ─────────────────────────
// (Injeta estilos adicionais para o painel de raciocínio)
(function injectReasoningStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* ── Reasoning block ── */
    .reasoning-block {
      border: 1px solid var(--border);
      border-radius: 10px;
      margin-bottom: 10px;
      overflow: hidden;
      background: color-mix(in srgb, var(--bg-secondary) 60%, transparent);
      backdrop-filter: blur(4px);
    }

    .reasoning-toggle-header {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 12px;
      background: none;
      border: none;
      cursor: pointer;
      gap: 8px;
      transition: background 0.15s;
      text-align: left;
    }
    .reasoning-toggle-header:hover {
      background: color-mix(in srgb, var(--accent) 6%, transparent);
    }
    .reasoning-toggle-header.open {
      border-bottom: 1px solid var(--border);
    }

    .reasoning-header-left {
      display: flex;
      align-items: center;
      gap: 8px;
      flex: 1;
      min-width: 0;
    }

    .reasoning-icon {
      width: 26px;
      height: 26px;
      border-radius: 7px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .reasoning-icon.simple {
      background: color-mix(in srgb, var(--accent) 15%, transparent);
      color: var(--accent);
    }
    .reasoning-icon.complex {
      background: color-mix(in srgb, #f59e0b 15%, transparent);
      color: #f59e0b;
    }

    .reasoning-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--text-secondary);
      white-space: nowrap;
    }

    .reasoning-badge {
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 99px;
      font-weight: 600;
      letter-spacing: 0.02em;
    }
    .reasoning-badge.simple {
      background: color-mix(in srgb, var(--accent) 12%, transparent);
      color: var(--accent);
    }
    .reasoning-badge.complex {
      background: color-mix(in srgb, #f59e0b 12%, transparent);
      color: #f59e0b;
    }

    .ra-chevron {
      flex-shrink: 0;
      color: var(--text-dim);
      transition: transform 0.2s ease;
    }
    .reasoning-toggle-header.open .ra-chevron {
      transform: rotate(180deg);
    }

    .reasoning-body {
      display: none;
      padding: 0;
      max-height: 0;
      overflow: hidden;
      transition: max-height 0.3s ease, padding 0.2s ease;
    }
    .reasoning-body.open {
      display: block;
      padding: 12px 14px;
      max-height: 600px;
      overflow-y: auto;
    }

    .reasoning-content {
      font-size: 12.5px;
      line-height: 1.65;
      color: var(--text-secondary);
    }
    .reasoning-content p { margin: 0 0 8px; }
    .reasoning-content strong { color: var(--text-primary); }
    .reasoning-content code {
      font-size: 11px;
      background: var(--bg-tertiary);
      padding: 1px 5px;
      border-radius: 4px;
    }
    .reasoning-content pre {
      font-size: 11px;
      background: var(--bg-tertiary);
      padding: 8px 10px;
      border-radius: 6px;
      overflow-x: auto;
    }
  `;
  document.head.appendChild(style);
})();

// ── AUTH & ADMIN ──────────────────────────────────────────────────
let authMode = 'login'; // 'login' or 'register'

function showAuth() {
  const container = document.getElementById('auth-overlay-container');
  if (!container) return;

  container.innerHTML = `
    <div class="auth-overlay">
      <div class="auth-box">
        <div class="auth-header">
          <div class="auth-logo">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div class="auth-title">${authMode === 'login' ? 'Bem-vindo' : 'Criar conta'}</div>
          <div class="auth-subtitle">${authMode === 'login' ? 'Identifique-se para acessar o MasterGPT' : 'Comece a construir com IA profissional'}</div>
        </div>
        
        <form class="auth-form" onsubmit="handleAuthAction(event)">
          ${authMode === 'register' ? `
            <div class="form-group">
              <label class="form-label">Email</label>
              <input type="email" id="auth-email" class="form-input" placeholder="exemplo@email.com" required autocomplete="email">
            </div>
          ` : ''}
          <div class="form-group">
            <label class="form-label">Usuário</label>
            <input type="text" id="auth-username" class="form-input" placeholder="seu_usuario" required autocomplete="username">
          </div>
          <div class="form-group">
            <label class="form-label">Senha</label>
            <input type="password" id="auth-password" class="form-input" placeholder="••••••••" required autocomplete="${authMode === 'login' ? 'current-password' : 'new-password'}">
          </div>
          <button type="submit" class="auth-btn" id="auth-submit-btn">
            ${authMode === 'login' ? 'Entrar no Sistema' : 'Finalizar Cadastro'}
          </button>
        </form>

        <div class="auth-switch">
          ${authMode === 'login' 
            ? `Não possui acesso? <span class="auth-link" onclick="toggleAuthMode('register')">Solicitar registro</span>` 
            : `Já possui conta? <span class="auth-link" onclick="toggleAuthMode('login')">Acessar agora</span>`}
        </div>
      </div>
    </div>
  `;
}

function toggleAuthMode(mode) {
  authMode = mode;
  showAuth();
}

async function handleAuthAction(e) {
  e.preventDefault();
  const btn = document.getElementById('auth-submit-btn');
  const userInp = document.getElementById('auth-username');
  const passInp = document.getElementById('auth-password');
  const mailInp = document.getElementById('auth-email');

  const username = userInp.value;
  const password = passInp.value;
  const email = mailInp?.value;

  btn.disabled = true;
  const originalText = btn.textContent;
  btn.innerHTML = `<span class="thinking-dots" style="padding:0;transform:scale(0.7)"><span></span><span></span><span></span></span>`;

  try {
    if (authMode === 'login') {
      await auth.login(username, password);
      showToast('Acesso autorizado!', 'ok');
    } else {
      await auth.register(username, email, password);
      showToast('Conta criada com sucesso! Faça login.', 'ok');
      authMode = 'login';
      showAuth();
      return;
    }
    
    // Sucesso no login
    const overlay = document.querySelector('.auth-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      const box = overlay.querySelector('.auth-box');
      if (box) box.style.transform = 'translateY(-20px) scale(0.95)';
      setTimeout(() => {
        document.getElementById('auth-overlay-container').innerHTML = '';
        updateUserProfile();
        newChat();
      }, 300);
    } else {
      document.getElementById('auth-overlay-container').innerHTML = '';
      updateUserProfile();
      newChat();
    }
  } catch (err) {
    showToast(err.message, 'err');
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function updateUserProfile() {
  const container = document.getElementById('user-profile-container');
  if (!container || !auth.user) return;

  const initials = auth.user.username.slice(0, 2).toUpperCase();
  
  container.innerHTML = `
    <div class="user-profile">
      <div class="user-avatar">${initials}</div>
      <div class="user-info">
        <div class="user-name">${escHtml(auth.user.username)}</div>
        <div class="user-role">${auth.user.role}</div>
      </div>
      ${auth.isAdmin() ? `
        <button class="icon-btn" onclick="showAdmin()" title="Painel Admin">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="3" y1="9" x2="21" y2="9"/>
          </svg>
        </button>
      ` : ''}
      <button class="logout-btn" onclick="auth.logout()" title="Sair">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>
        </svg>
      </button>
    </div>
  `;
}

async function showAdmin() {
  const container = document.getElementById('admin-overlay-container');
  if (!container) return;

  container.innerHTML = `
    <div class="admin-overlay">
      <div class="admin-header">
        <div class="logo">Painel Administrativo</div>
        <button class="icon-btn" onclick="closeAdmin()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="12"/>
          </svg>
        </button>
      </div>
      <div class="admin-content">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
          <h2 style="margin:0">Gerenciamento de Usuários</h2>
          <div style="display:flex; gap:12px;">
            <button class="action-btn" onclick="exportUsers()">Exportar CSV</button>
          </div>
        </div>
        
        <div class="admin-table-container">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Criado em</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody id="admin-user-list">
              <tr><td colspan="6" style="text-align:center; padding:32px;">Carregando usuários...</td></tr>
            </tbody>
          </table>
        </div>
        <div id="admin-pagination" class="pagination"></div>
      </div>
    </div>
  `;
  
  await fetchAdminUsers();
}

function closeAdmin() {
  document.getElementById('admin-overlay-container').innerHTML = '';
}

async function fetchAdminUsers(page = 1) {
  try {
    const response = await fetch(`/api/admin/users?page=${page}&size=10`, {
      headers: { 'Authorization': `Bearer ${auth.token}` }
    });
    const data = await response.json();
    renderAdminUsers(data.users);
    renderAdminPagination(data.total, data.page, data.size);
  } catch (err) {
    showToast('Erro ao carregar usuários', 'err');
  }
}

function renderAdminUsers(users) {
  const list = document.getElementById('admin-user-list');
  if (!list) return;

  list.innerHTML = users.map(u => `
    <tr>
      <td><strong>${escHtml(u.username)}</strong></td>
      <td>${escHtml(u.email)}</td>
      <td><span class="badge badge-${u.role}">${u.role}</span></td>
      <td><span class="badge ${u.is_active ? 'badge-user' : 'badge-admin'}">${u.is_active ? 'Ativo' : 'Inativo'}</span></td>
      <td>${new Date(u.created_at).toLocaleDateString()}</td>
      <td>
        <div style="display:flex; gap:8px;">
          <button class="icon-btn" onclick="toggleUserStatus(${u.id}, ${u.is_active})" title="${u.is_active ? 'Desativar' : 'Ativar'}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10"/>
            </svg>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function renderAdminPagination(total, page, size) {
  const container = document.getElementById('admin-pagination');
  if (!container) return;

  const totalPages = Math.ceil(total / size);
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="action-btn ${i === page ? 'active' : ''}" onclick="fetchAdminUsers(${i})">${i}</button>`;
  }
  container.innerHTML = html;
}

async function toggleUserStatus(userId, currentStatus) {
  try {
    const response = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 
        'Authorization': `Bearer ${auth.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ is_active: !currentStatus })
    });
    if (response.ok) {
      showToast('Status do usuário atualizado', 'ok');
      fetchAdminUsers();
    }
  } catch (err) {
    showToast('Erro ao atualizar usuário', 'err');
  }
}

async function exportUsers() {
  try {
    const response = await fetch('/api/admin/export/csv', {
      headers: { 'Authorization': `Bearer ${auth.token}` }
    });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'users.csv';
    a.click();
    showToast('Exportação concluída', 'ok');
  } catch (err) {
    showToast('Erro ao exportar', 'err');
  }
}

// ── INIT ──────────────────────────────────────────────────────────
function initUI() {
  loadPersistedState();
  initSkills();

  // Check Auth
  if (!auth.isAuthenticated()) {
    showAuth();
  } else {
    auth.fetchMe().then(() => {
      updateUserProfile();
    });
  }

  setOrchMode(orchMode);
  updateModelDisplay();
  renderHistory();
  renderWelcome();

  // Reasoning button inicial
  const rb = document.getElementById('reasoning-btn');
  if (rb && showReasoning) {
    rb.classList.add('active');
    rb.setAttribute('aria-pressed', 'true');
  }

  setTimeout(() => document.getElementById('user-input')?.focus(), 100);
}

// Iniciar tudo quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUI);
} else {
  initUI();
}
