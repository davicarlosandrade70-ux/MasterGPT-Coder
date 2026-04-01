/**
 * ═══════════════════════════════════════════════════════════════════
 *  MASTERGPT-CODER — MarkdownRenderer.js v1.0
 *  Renderização por blocos, cache, memoização e lazy loading
 * ═══════════════════════════════════════════════════════════════════
 * 
 * 📄 ARQUITETURA TÉCNICA
 * ---------------------
 * 1. PARSING LÓGICO:
 *    Usa o marked.lexer para quebrar o markdown em tokens (blocos).
 *    Cada bloco recebe um ID único baseado em seu hash de conteúdo e índice.
 * 
 * 2. SISTEMA DE CACHE (MEMOIZAÇÃO):
 *    Mantém um Map (hash -> HTML) para armazenar blocos já renderizados.
 *    Se o conteúdo do bloco não mudar, o HTML é recuperado instantaneamente.
 * 
 * 3. DETECÇÃO DE ALTERAÇÕES:
 *    Durante o re-render, comparamos o hash do novo bloco com o hash do 
 *    elemento DOM correspondente. Apenas blocos com hashes diferentes
 *    são re-renderizados.
 * 
 * 4. LAZY LOADING (INTERSECTION OBSERVER):
 *    Blocos longos ou não visíveis são renderizados inicialmente como
 *    placeholders (shimmer effect). O IntersectionObserver detecta
 *    a visibilidade e dispara o render real apenas quando necessário.
 * 
 * 5. MÉTRICAS DE PERFORMANCE:
 *    Monitoramento em tempo real de Cache Hits, Misses e tempo médio
 *    de renderização por bloco e total.
 * 
 * 6. OTIMIZAÇÃO DE DOM:
 *    Usa DocumentFragment para minimizar reflows e mantém a estrutura
 *    DOM existente quando possível para evitar re-renderizações totais.
 */

class MarkdownRenderer {
  constructor() {
    this.cache = new Map(); // hash -> HTML
    this.metrics = {
      hits: 0,
      misses: 0,
      renderTimes: [],
      lastRenderTime: 0
    };
    this.observer = new IntersectionObserver(this.onVisible.bind(this), {
      rootMargin: '100px 0px',
      threshold: 0.1
    });
    
    // Configurações do marked
    marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: (code, lang) => {
        const language = (lang || 'plaintext').trim();
        try { return hljs.highlight(code, { language }).value; }
        catch (e) { return hljs.highlightAuto(code).value; }
      }
    });
  }

  /**
   * Gera um hash simples para identificar o conteúdo do bloco
   */
  generateHash(text, type) {
    let hash = 0;
    const str = `${type}:${text}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Processa o markdown em blocos lógicos
   */
  parseBlocks(markdown) {
    const tokens = marked.lexer(markdown);
    return tokens.map((token, index) => {
      const content = token.raw;
      const type = token.type;
      const hash = this.generateHash(content, type);
      return { id: `block-${hash}-${index}`, hash, type, token, content };
    });
  }

  /**
   * Renderiza um bloco individual (memoizado)
   */
  renderBlock(block) {
    if (this.cache.has(block.hash)) {
      this.metrics.hits++;
      return this.cache.get(block.hash);
    }

    this.metrics.misses++;
    const startTime = performance.now();
    
    // Usar o marked para renderizar o token específico
    // Criamos uma lista temporária com apenas esse token
    const html = marked.parser([block.token]);
    
    this.cache.set(block.hash, html);
    this.metrics.renderTimes.push(performance.now() - startTime);
    
    return html;
  }

  /**
   * Renderiza o conteúdo completo usando a estratégia de blocos
   * @param {string} markdown - Texto em markdown
   * @param {HTMLElement} container - Elemento onde será renderizado
   * @param {boolean} useLazy - Se deve usar lazy loading
   */
  render(markdown, container, useLazy = true) {
    const startOverall = performance.now();
    const blocks = this.parseBlocks(markdown);
    
    // Limpar container e preparar estrutura
    // Se o container já tem blocos, vamos tentar atualizar apenas os necessários
    const existingBlockElements = Array.from(container.querySelectorAll('.md-block'));
    
    // Mapear blocos existentes por ID para reutilização
    const existingMap = new Map();
    existingBlockElements.forEach(el => existingMap.set(el.dataset.id, el));

    // Novo fragmento para evitar reflows constantes
    const fragment = document.createDocumentFragment();
    
    blocks.forEach((block, idx) => {
      let blockEl = existingMap.get(block.id);
      
      if (!blockEl) {
        // Criar novo elemento de bloco
        blockEl = document.createElement('div');
        blockEl.className = `md-block block-type-${block.type}`;
        blockEl.dataset.id = block.id;
        blockEl.dataset.hash = block.hash;
        
        if (useLazy) {
          blockEl.classList.add('is-lazy');
          blockEl.innerHTML = '<div class="md-block-placeholder"></div>';
          blockEl.dataset.pendingContent = JSON.stringify(block);
          this.observer.observe(blockEl);
        } else {
          blockEl.innerHTML = this.renderBlock(block);
        }
      } else if (blockEl.dataset.hash !== block.hash) {
        // Atualizar se o conteúdo mudou
        blockEl.dataset.hash = block.hash;
        if (useLazy) {
          blockEl.classList.add('is-lazy');
          blockEl.innerHTML = '<div class="md-block-placeholder"></div>';
          blockEl.dataset.pendingContent = JSON.stringify(block);
          this.observer.observe(blockEl);
        } else {
          blockEl.innerHTML = this.renderBlock(block);
        }
      }
      
      fragment.appendChild(blockEl);
      existingMap.delete(block.id);
    });

    // Remover blocos que não existem mais
    existingMap.forEach(el => {
      this.observer.unobserve(el);
      el.remove();
    });

    container.appendChild(fragment);
    
    this.metrics.lastRenderTime = performance.now() - startOverall;
    this.logMetrics();
  }

  /**
   * Callback do IntersectionObserver para carregar blocos visíveis
   */
  onVisible(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        if (el.classList.contains('is-lazy')) {
          const blockData = JSON.parse(el.dataset.pendingContent);
          el.innerHTML = this.renderBlock(blockData);
          el.classList.remove('is-lazy');
          delete el.dataset.pendingContent;
          this.observer.unobserve(el);
          
          // Se for um bloco de código, precisamos rodar o highlight e adicionar o botão de cópia
          if (blockData.type === 'code') {
             this.postProcessCodeBlock(el, blockData);
          }
        }
      }
    });
  }

  /**
   * Pós-processamento de blocos de código (Highlight e Cópia)
   */
  postProcessCodeBlock(el, block) {
    // A implementação atual do renderBlock usa o marked.parser que já faz o highlight
    // mas precisamos garantir a estrutura do MasterGPT (header + botão de cópia)
    const pre = el.querySelector('pre');
    if (!pre) return;

    const lang = block.token.lang || 'plaintext';
    const code = block.token.text;
    const id = 'c' + Math.random().toString(36).slice(2, 10);
    
    // Armazenar no codeStore global se existir
    if (typeof codeStore !== 'undefined') {
      codeStore[id] = code;
    }

    const header = document.createElement('div');
    header.className = 'code-header';
    header.innerHTML = `
      <span class="code-lang">${lang}</span>
      <button class="copy-btn" onclick="copyCode('${id}',this)" aria-label="Copiar código">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
        </svg>
        Copiar
      </button>
    `;
    
    const container = document.createElement('div');
    container.className = 'code-block';
    container.appendChild(header);
    container.appendChild(pre.cloneNode(true));
    
    el.innerHTML = '';
    el.appendChild(container);
  }

  logMetrics() {
    const avg = this.metrics.renderTimes.reduce((a, b) => a + b, 0) / (this.metrics.renderTimes.length || 1);
    console.debug(`[MD Renderer] Hit Rate: ${((this.metrics.hits / (this.metrics.hits + this.metrics.misses || 1)) * 100).toFixed(1)}% | Avg Block Render: ${avg.toFixed(2)}ms | Total: ${this.metrics.lastRenderTime.toFixed(2)}ms`);
  }

  getStats() {
    return {
      ...this.metrics,
      hitRate: (this.metrics.hits / (this.metrics.hits + this.metrics.misses || 1)) * 100
    };
  }
}

// Instância global
window.mdRenderer = new MarkdownRenderer();
