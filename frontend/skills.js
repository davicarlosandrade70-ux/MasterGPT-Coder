// ═══════════════════════════════════════════════════════════════════
//  MASTERGPT-CODER — skills.js v4.1
//  Skills de frontend, backend, dados + IA vê o output (feedback loop)
// ═══════════════════════════════════════════════════════════════════

// ── SKILL MANAGER ─────────────────────────────────────────────────
const SkillManager = (() => {
  const registry = new Map();

  function register(skillDef) {
    if (!skillDef.name || !skillDef.execute) {
      console.warn('[Skills] Skill inválida:', skillDef);
      return;
    }
    registry.set(skillDef.name, skillDef);
  }

  async function execute(skillName, params, context = {}) {
    const skill = registry.get(skillName);
    if (!skill) return { __error: `Skill desconhecida: ${skillName}`, __skillName: skillName };
    if (skill.parameters) {
      for (const [key, spec] of Object.entries(skill.parameters)) {
        if (spec.required && (params[key] == null || params[key] === '')) {
          return { __error: `Parâmetro obrigatório ausente: '${key}'`, __skillName: skillName };
        }
      }
    }
    try {
      const result = await skill.execute(params, context);
      return { ...result, __skillName: skillName };
    } catch (err) {
      console.error(`[Skills] Erro em '${skillName}':`, err);
      return { __error: err.message, __skillName: skillName };
    }
  }

  function list() { return [...registry.values()]; }

  function getSystemPromptAddition() {
    if (registry.size === 0) return '';
    let p = '\n\n# FERRAMENTAS DE EXECUÇÃO (SKILLS)\n';
    p += `Você pode executar código e ferramentas reais. Os resultados serão mostrados para você, permitindo análise e correção automática.

**Formato:**
\`\`\`
[SKILL:nome_da_skill]
param1: valor
param2: valor
[/SKILL]
\`\`\`

**Regras:**
- Use skills para demonstrar código funcional em vez de só mostrar texto
- Você VERÁ o output — analise e comente naturalmente na resposta
- Se houver erro, corrija e reexecute
- Para HTML/CSS/JS interativo: use render_frontend
- Para lógica JS: use run_js
- Para APIs: use api_request
- Para dados: use parse_json ou validate_schema
- Para performance: use perf_benchmark
- Para dados de teste: use generate_fake_data
- Para paleta de cores: use color_palette
- Para codificação: use encode_decode

**Skills disponíveis:**\n`;
    for (const skill of registry.values()) {
      p += `\n### ${skill.name}\n${skill.description}\n`;
      if (skill.example) p += `\`\`\`\n${skill.example}\n\`\`\`\n`;
    }
    return p;
  }

  return { register, execute, list, getSystemPromptAddition };
})();

// ══════════════════════════════════════════════════════════════════
//  SKILLS DE FRONTEND
// ══════════════════════════════════════════════════════════════════

SkillManager.register({
  name: 'render_frontend',
  description: 'Renderiza HTML, CSS e JS em um iframe interativo com captura de erros de runtime.',
  parameters: {
    html: { required: true, description: 'Conteúdo do <body>' },
    css: { required: false, description: 'Estilos CSS' },
    js: { required: false, description: 'JavaScript' },
    title: { required: false, description: 'Título do preview' }
  },
  example: `[SKILL:render_frontend]
title: Contador interativo
html: <div class="counter"><span id="n">0</span><button onclick="update(1)">+</button><button onclick="update(-1)">-</button></div>
css: .counter{display:flex;gap:12px;align-items:center;font:2rem monospace;padding:20px} button{padding:8px 18px;border:none;border-radius:6px;background:#6366f1;color:white;cursor:pointer;font-size:1.2rem}
js: function update(d){const el=document.getElementById('n');el.textContent=+el.textContent+d}
[/SKILL]`,
  execute({ html = '', css = '', js = '', title = 'Preview' }) {
    const errorCapture = `
window.__errors=[];
window.onerror=(msg,src,line,col)=>{
  window.__errors.push({msg,line,col});
  document.body.insertAdjacentHTML('beforeend',
    '<div style="position:fixed;bottom:0;left:0;right:0;background:#ef4444;color:#fff;padding:8px 12px;font-size:12px;font-family:monospace;z-index:9999">⚠ JS Error: '+msg+' (L'+line+')</div>'
  );
};`;
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif}${css}</style></head><body>${html}<script>${errorCapture}${js}<\/script></body></html>`;
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(fullHtml);
    return {
      __type: 'frontend_preview',
      title,
      dataUrl,
      stats: { htmlLines: html.split('\n').length, cssChars: css.length, jsChars: js.length }
    };
  }
});

SkillManager.register({
  name: 'run_js',
  description: 'Executa JavaScript no navegador. Captura console.log/error/warn, valor de retorno e tempo de execução.',
  parameters: { code: { required: true, description: 'Código JS a executar' } },
  example: `[SKILL:run_js]
code: const primes = n => Array.from({length:n},(_, i)=>i+2).filter(x=>[...Array(x).keys()].slice(2).every(i=>x%i));
console.log('Primes:', primes(20));
[/SKILL]`,
  async execute({ code }) {
    const logs = [];
    const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
    const fmt = x => typeof x === 'object' ? JSON.stringify(x, null, 2) : String(x);
    console.log = (...a) => logs.push({ type: 'log', text: a.map(fmt).join(' ') });
    console.error = (...a) => logs.push({ type: 'error', text: a.map(fmt).join(' ') });
    console.warn = (...a) => logs.push({ type: 'warn', text: a.map(fmt).join(' ') });
    console.info = (...a) => logs.push({ type: 'info', text: a.map(fmt).join(' ') });

    let returnVal, execError = null;
    const t0 = performance.now();
    try {
      returnVal = await new Function(`"use strict";return(async()=>{${code}})()`)();
      if (returnVal !== undefined) logs.push({ type: 'return', text: fmt(returnVal) });
    } catch (e) {
      execError = e.message;
      logs.push({ type: 'error', text: e.message });
    } finally {
      Object.assign(console, orig);
    }

    const elapsed = (performance.now() - t0).toFixed(1);
    const output = logs.map(l => {
      const p = { log: '→', error: '❌', warn: '⚠️', info: 'ℹ️', return: '⇒' }[l.type] || '→';
      return `${p} ${l.text}`;
    }).join('\n') || '(sem output)';

    return { __type: 'js_output', output, hasError: !!execError, error: execError, elapsed: `${elapsed}ms`, logCount: logs.length };
  }
});

SkillManager.register({
  name: 'css_inspector',
  description: 'Analisa CSS: detecta !important, falta de media queries, seletores profundos, problemas de acessibilidade.',
  parameters: { css: { required: true, description: 'CSS para analisar' } },
  execute({ css }) {
    const issues = [], warnings = [], info = [];
    if (css.includes('!important')) issues.push(`${(css.match(/!important/g) || []).length}x !important — melhore especificidade`);
    if (!css.includes('@media')) warnings.push('Sem @media queries — considere responsividade');
    if (css.includes('float:') || css.includes('float :')) warnings.push('Uso de float — prefira Flexbox/Grid');
    if (!css.includes('transition') && !css.includes('animation')) info.push('Sem transições/animações');
    const selectors = (css.match(/[^{}]+(?=\s*\{)/g) || []);
    const deep = selectors.filter(s => (s.match(/\s/g) || []).length >= 3);
    if (deep.length) warnings.push(`${deep.length} seletor(es) muito profundo(s)`);
    const vars = (css.match(/var\(--[^)]+\)/g) || []).length;
    if (vars) info.push(`${vars} variáveis CSS ✅`);
    const rules = (css.match(/[^{}]+\{[^{}]*\}/g) || []).length;
    return { __type: 'css_analysis', rules, issues, warnings, info, summary: `${rules} regras | ${issues.length} erro(s) | ${warnings.length} aviso(s)` };
  }
});

SkillManager.register({
  name: 'dom_query',
  description: 'Executa querySelector(All) no documento e retorna informações dos elementos encontrados.',
  parameters: {
    selector: { required: true, description: 'Seletor CSS' },
    all: { required: false, description: '"true" para querySelectorAll' }
  },
  execute({ selector, all = 'false' }) {
    try {
      const useAll = all === 'true' || all === true;
      const els = useAll ? [...document.querySelectorAll(selector)] : [document.querySelector(selector)].filter(Boolean);
      return {
        __type: 'dom_result', selector, count: els.length,
        elements: els.map(el => ({
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          classes: [...el.classList].join(' ') || null,
          text: el.textContent?.trim().slice(0, 80) || null
        }))
      };
    } catch (e) { return { __error: `Seletor inválido: ${e.message}` }; }
  }
});

// ══════════════════════════════════════════════════════════════════
//  SKILLS DE BACKEND / DADOS
// ══════════════════════════════════════════════════════════════════

SkillManager.register({
  name: 'api_request',
  description: 'Faz requisições HTTP reais (GET, POST, PUT, DELETE) com headers e body customizados.',
  parameters: {
    url: { required: true, description: 'URL completa' },
    method: { required: false, description: 'GET | POST | PUT | DELETE | PATCH (padrão: GET)' },
    headers: { required: false, description: 'JSON com headers ex: {"Authorization":"Bearer x"}' },
    body: { required: false, description: 'JSON body para POST/PUT' }
  },
  example: `[SKILL:api_request]
url: https://jsonplaceholder.typicode.com/users/1
method: GET
[/SKILL]`,
  async execute({ url, method = 'GET', headers = '{}', body = '' }) {
    const t0 = performance.now();
    let parsedHeaders = {};
    try { parsedHeaders = JSON.parse(headers); } catch { }
    const opts = { method: method.toUpperCase(), headers: { 'Content-Type': 'application/json', ...parsedHeaders } };
    if (body && ['POST', 'PUT', 'PATCH'].includes(opts.method)) opts.body = body;
    let res, data, text;
    try {
      res = await fetch(url, opts);
      text = await res.text();
      try { data = JSON.parse(text); } catch { data = text; }
    } catch (e) { return { __error: `Falha na requisição: ${e.message}` }; }
    const elapsed = (performance.now() - t0).toFixed(0);
    return {
      __type: 'api_response', status: res.status, statusText: res.statusText,
      elapsed: `${elapsed}ms`, ok: res.ok,
      body: typeof data === 'object' ? data : text.slice(0, 3000),
      isJson: typeof data === 'object', size: `${text.length} chars`
    };
  }
});

SkillManager.register({
  name: 'parse_json',
  description: 'Parseia, valida e descreve a estrutura de um JSON. Útil para inspecionar respostas de API.',
  parameters: { json: { required: true, description: 'String JSON para analisar' } },
  execute({ json }) {
    let parsed;
    try { parsed = JSON.parse(json); } catch (e) { return { __error: `JSON inválido: ${e.message}` }; }
    const desc = (v, d = 0) => {
      if (d > 2) return '...';
      if (v === null) return 'null';
      if (Array.isArray(v)) return `Array[${v.length}]${v.length ? ` de ${desc(v[0], d + 1)}` : ''}`;
      if (typeof v === 'object') { const ks = Object.keys(v); return `{${ks.slice(0, 5).join(', ')}${ks.length > 5 ? '...' : ''}}`; }
      if (typeof v === 'string') return `"${v.slice(0, 30)}${v.length > 30 ? '...' : ''}"`;
      return String(v);
    };
    const isArr = Array.isArray(parsed);
    const sample = isArr ? parsed[0] : parsed;
    const structure = typeof sample === 'object' && sample !== null
      ? Object.entries(sample).reduce((a, [k, v]) => ({ ...a, [k]: desc(v) }), {})
      : desc(sample);
    return { __type: 'json_analysis', valid: true, rootType: isArr ? `Array[${parsed.length}]` : typeof parsed, structure, size: `${json.length} chars`, preview: JSON.stringify(parsed, null, 2).slice(0, 600) };
  }
});

SkillManager.register({
  name: 'validate_schema',
  description: 'Valida um objeto JSON contra um schema com tipos e campos obrigatórios.',
  parameters: {
    data: { required: true, description: 'JSON do objeto' },
    schema: { required: true, description: 'Schema: {"campo":{"type":"string","required":true}}' }
  },
  execute({ data, schema }) {
    let obj, sch;
    try { obj = JSON.parse(data); } catch (e) { return { __error: `data inválido: ${e.message}` }; }
    try { sch = JSON.parse(schema); } catch (e) { return { __error: `schema inválido: ${e.message}` }; }
    const errors = [], warnings = [];
    for (const [f, r] of Object.entries(sch)) {
      const v = obj[f];
      if (r.required && (v == null)) { errors.push(`Campo obrigatório ausente: \`${f}\``); continue; }
      if (v != null && r.type) { const t = Array.isArray(v) ? 'array' : typeof v; if (t !== r.type) errors.push(`\`${f}\`: esperado \`${r.type}\`, recebido \`${t}\``); }
      if (r.minLength && typeof v === 'string' && v.length < r.minLength) warnings.push(`\`${f}\` muito curto (${v.length}<${r.minLength})`);
    }
    const extra = Object.keys(obj).filter(k => !sch[k]);
    if (extra.length) warnings.push(`Campos extras: ${extra.map(k => `\`${k}\``).join(', ')}`);
    return { __type: 'schema_validation', valid: errors.length === 0, errors, warnings, summary: errors.length === 0 ? '✅ Objeto válido!' : `❌ ${errors.length} erro(s)` };
  }
});

SkillManager.register({
  name: 'test_regex',
  description: 'Testa uma regex contra múltiplas strings. Retorna matches e status de cada linha.',
  parameters: {
    pattern: { required: true, description: 'Regex sem delimitadores (ex: ^\\d{4}-\\d{2}-\\d{2}$)' },
    flags: { required: false, description: 'Flags: g, i, m (padrão: gi)' },
    strings: { required: true, description: 'Strings para testar, uma por linha' }
  },
  example: `[SKILL:test_regex]
pattern: ^[\\w.-]+@[\\w-]+\\.[a-z]{2,}$
flags: i
strings: user@example.com
invalid-email
test@domain.org
not@valid
[/SKILL]`,
  execute({ pattern, flags = 'gi', strings }) {
    let regex;
    try { regex = new RegExp(pattern, flags); } catch (e) { return { __error: `Regex inválida: ${e.message}` }; }
    const testRe = new RegExp(pattern, flags.replace('g', ''));
    const lines = strings.split('\n').map(s => s.trim()).filter(Boolean);
    const results = lines.map(str => {
      const allMatches = [...(str.matchAll(new RegExp(pattern, flags.includes('g') ? flags : flags + 'g')))]
        .map(m => ({ match: m[0], index: m.index, groups: m.slice(1).filter(Boolean) }));
      return { string: str, matched: testRe.test(str), matches: allMatches.length, details: allMatches.slice(0, 3) };
    });
    const passed = results.filter(r => r.matched).length;
    return { __type: 'regex_test', pattern, flags, tested: lines.length, passed, failed: lines.length - passed, results };
  }
});

SkillManager.register({
  name: 'diff_code',
  description: 'Compara duas versões de código e lista diferenças linha a linha.',
  parameters: {
    original: { required: true, description: 'Código original' },
    modified: { required: true, description: 'Código modificado' },
    label: { required: false, description: 'Descrição da comparação' }
  },
  execute({ original, modified, label = 'comparação' }) {
    const ol = original.split('\n'), ml = modified.split('\n');
    const added = [], removed = [], changed = [];
    const max = Math.max(ol.length, ml.length);
    for (let i = 0; i < max; i++) {
      if (ol[i] === undefined) added.push(`+[${i + 1}] ${ml[i]}`);
      else if (ml[i] === undefined) removed.push(`-[${i + 1}] ${ol[i]}`);
      else if (ol[i] !== ml[i]) changed.push(`~[${i + 1}] "${ol[i]}" → "${ml[i]}"`);
    }
    return { __type: 'diff_result', label, originalLines: ol.length, modifiedLines: ml.length, added: added.length, removed: removed.length, changed: changed.length, delta: added.length + removed.length + changed.length, details: [...removed.slice(0, 8), ...added.slice(0, 8), ...changed.slice(0, 8)] };
  }
});

SkillManager.register({
  name: 'storage_write',
  description: 'Salva um valor no localStorage para uso em sessões futuras.',
  parameters: { key: { required: true }, value: { required: true } },
  execute({ key, value }) {
    try { localStorage.setItem('skill_' + key, value); return { __type: 'storage_ok', saved: true, key }; }
    catch (e) { return { __error: e.message }; }
  }
});

SkillManager.register({
  name: 'storage_read',
  description: 'Lê um valor salvo anteriormente.',
  parameters: { key: { required: true } },
  execute({ key }) {
    try { const v = localStorage.getItem('skill_' + key); return { __type: 'storage_read', key, value: v, found: v !== null }; }
    catch (e) { return { __error: e.message }; }
  }
});

// ══════════════════════════════════════════════════════════════════
//  SKILLS NOVAS — v4.1
// ══════════════════════════════════════════════════════════════════

SkillManager.register({
  name: 'format_code',
  description: 'Formata e valida código JS, JSON ou HTML. Detecta erros de sintaxe e retorna código indentado.',
  parameters: {
    code: { required: true, description: 'Código para formatar' },
    lang: { required: false, description: '"json" | "js" | "html" (padrão: auto-detect)' }
  },
  example: `[SKILL:format_code]
lang: json
code: {"name":"João","age":30,"skills":["js","css"]}
[/SKILL]`,
  execute({ code, lang = 'auto' }) {
    const detected = lang === 'auto'
      ? (code.trim().startsWith('{') || code.trim().startsWith('[') ? 'json'
        : code.includes('<') ? 'html' : 'js')
      : lang;

    if (detected === 'json') {
      try {
        const parsed = JSON.parse(code);
        const formatted = JSON.stringify(parsed, null, 2);
        return { __type: 'format_result', lang: 'json', valid: true, formatted, lines: formatted.split('\n').length, summary: `JSON válido — ${formatted.split('\n').length} linhas` };
      } catch (e) {
        return { __type: 'format_result', lang: 'json', valid: false, error: e.message, formatted: code };
      }
    }

    if (detected === 'js') {
      try {
        new Function(code);
        return { __type: 'format_result', lang: 'js', valid: true, formatted: code, lines: code.split('\n').length, summary: `JS sem erros de sintaxe — ${code.split('\n').length} linhas` };
      } catch (e) {
        return { __type: 'format_result', lang: 'js', valid: false, error: e.message, formatted: code };
      }
    }

    // html
    const openTags = (code.match(/<[^/][^>]*>/g) || []).length;
    const closeTags = (code.match(/<\/[^>]+>/g) || []).length;
    const selfClose = (code.match(/<[^>]+\/>/g) || []).length;
    const balanced = Math.abs(openTags - closeTags - selfClose) <= 2;
    return { __type: 'format_result', lang: 'html', valid: balanced, formatted: code, lines: code.split('\n').length, openTags, closeTags, summary: `HTML — ${openTags} abertas, ${closeTags} fechadas${balanced ? ' ✅' : ' ⚠ possível desequilíbrio'}` };
  }
});

SkillManager.register({
  name: 'generate_fake_data',
  description: 'Gera arrays de dados fictícios para testes: users, products, orders, transactions.',
  parameters: {
    type: { required: true, description: '"users" | "products" | "orders" | "transactions"' },
    count: { required: false, description: 'Quantidade de registros (padrão: 5, máx: 50)' }
  },
  example: `[SKILL:generate_fake_data]
type: users
count: 3
[/SKILL]`,
  execute({ type, count = '5' }) {
    const n = Math.min(parseInt(count) || 5, 50);
    const rnd = arr => arr[Math.floor(Math.random() * arr.length)];
    const rndInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const id = () => Math.random().toString(36).slice(2, 10).toUpperCase();

    const firstNames = ['Ana','Carlos','Beatriz','Diego','Fernanda','Lucas','Mariana','Rafael','Juliana','Pedro'];
    const lastNames = ['Silva','Santos','Oliveira','Souza','Lima','Costa','Pereira','Ferreira','Alves','Rodrigues'];
    const domains = ['gmail.com','outlook.com','yahoo.com','hotmail.com'];
    const productNames = ['Notebook','Mouse','Teclado','Monitor','Headset','Webcam','SSD','Pen Drive','Hub USB','Suporte'];
    const categories = ['Eletrônicos','Periféricos','Armazenamento','Acessórios'];
    const statuses = ['pending','processing','shipped','delivered','cancelled'];

    let data;
    if (type === 'users') {
      data = Array.from({ length: n }, () => {
        const first = rnd(firstNames), last = rnd(lastNames);
        return {
          id: id(), name: `${first} ${last}`,
          email: `${first.toLowerCase()}.${last.toLowerCase()}@${rnd(domains)}`,
          age: rndInt(18, 65), role: rnd(['admin','user','editor','viewer']),
          createdAt: new Date(Date.now() - rndInt(0, 365) * 86400000).toISOString().split('T')[0]
        };
      });
    } else if (type === 'products') {
      data = Array.from({ length: n }, () => ({
        id: id(), name: `${rnd(productNames)} ${rnd(['Pro','Lite','Max','Plus','HD'])}`,
        category: rnd(categories), price: +(rndInt(50, 2000) + Math.random()).toFixed(2),
        stock: rndInt(0, 500), rating: +(Math.random() * 2 + 3).toFixed(1), active: Math.random() > 0.2
      }));
    } else if (type === 'orders') {
      data = Array.from({ length: n }, () => ({
        id: id(), userId: id(), items: rndInt(1, 8),
        total: +(rndInt(100, 5000) + Math.random()).toFixed(2),
        status: rnd(statuses),
        createdAt: new Date(Date.now() - rndInt(0, 180) * 86400000).toISOString().split('T')[0]
      }));
    } else {
      data = Array.from({ length: n }, () => ({
        id: id(), amount: +(rndInt(10, 3000) + Math.random()).toFixed(2),
        type: rnd(['credit','debit']), method: rnd(['pix','cartão','boleto','transferência']),
        status: rnd(['aprovado','pendente','recusado']),
        date: new Date(Date.now() - rndInt(0, 90) * 86400000).toISOString().split('T')[0]
      }));
    }

    return { __type: 'fake_data', dataType: type, count: n, data, preview: JSON.stringify(data, null, 2), summary: `${n} ${type} gerados` };
  }
});

SkillManager.register({
  name: 'perf_benchmark',
  description: 'Executa um trecho de código JS N vezes e mede desempenho: média, mín, máx, p95, desvio padrão e ops/s.',
  parameters: {
    code: { required: true, description: 'Função ou expressão JS a ser medida' },
    iterations: { required: false, description: 'Número de iterações (padrão: 1000, máx: 100000)' }
  },
  example: `[SKILL:perf_benchmark]
iterations: 5000
code: JSON.parse(JSON.stringify({name:"test",values:[1,2,3,4,5]}))
[/SKILL]`,
  async execute({ code, iterations = '1000' }) {
    const n = Math.min(parseInt(iterations) || 1000, 100000);
    let error = null;
    const times = [];
    try {
      const fn = new Function(`"use strict"; return (function(){ ${code} })`)();
      for (let i = 0; i < n; i++) {
        const t = performance.now();
        fn();
        times.push(performance.now() - t);
      }
    } catch (e) { error = e.message; }

    if (error) return { __error: `Erro ao executar: ${error}` };

    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / n;
    const variance = times.reduce((s, t) => s + (t - avg) ** 2, 0) / n;
    const p95 = times[Math.floor(n * 0.95)];

    return {
      __type: 'benchmark_result', iterations: n,
      avg: avg.toFixed(4) + 'ms', min: times[0].toFixed(4) + 'ms',
      max: times[times.length - 1].toFixed(4) + 'ms',
      p95: p95.toFixed(4) + 'ms', stdDev: Math.sqrt(variance).toFixed(4) + 'ms',
      opsPerSec: Math.round(1000 / avg).toLocaleString(),
      summary: `${Math.round(1000 / avg).toLocaleString()} ops/s — avg ${avg.toFixed(3)}ms`
    };
  }
});

SkillManager.register({
  name: 'color_palette',
  description: 'Gera paletas de cores a partir de uma cor base em hex. Retorna hex e HSL de cada tom.',
  parameters: {
    color: { required: true, description: 'Cor base em hex (ex: #6366f1)' },
    mode: { required: false, description: '"complementary" | "analogous" | "triadic" | "shades" (padrão: shades)' }
  },
  example: `[SKILL:color_palette]
color: #6366f1
mode: triadic
[/SKILL]`,
  execute({ color, mode = 'shades' }) {
    const hexToHsl = hex => {
      let r = parseInt(hex.slice(1, 3), 16) / 255;
      let g = parseInt(hex.slice(3, 5), 16) / 255;
      let b = parseInt(hex.slice(5, 7), 16) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h, s, l = (max + min) / 2;
      if (max === min) { h = s = 0; } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          default: h = ((r - g) / d + 4) / 6;
        }
      }
      return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
    };

    const hslToHex = (h, s, l) => {
      s /= 100; l /= 100;
      const a = s * Math.min(l, 1 - l);
      const f = n => { const k = (n + h / 30) % 12; const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); return Math.round(255 * c).toString(16).padStart(2, '0'); };
      return `#${f(0)}${f(8)}${f(4)}`;
    };

    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return { __error: 'Cor inválida. Use formato #RRGGBB' };

    const [h, s, l] = hexToHsl(color);
    let palette = [];

    if (mode === 'shades') {
      [10, 20, 30, 40, 50, 60, 70, 80, 90].forEach(lightness => {
        const hex = hslToHex(h, s, lightness);
        palette.push({ name: `${lightness}%`, hex, hsl: `hsl(${h}, ${s}%, ${lightness}%)` });
      });
    } else if (mode === 'complementary') {
      palette = [
        { name: 'base', hex: color, hsl: `hsl(${h}, ${s}%, ${l}%)` },
        { name: 'complement', hex: hslToHex((h + 180) % 360, s, l), hsl: `hsl(${(h + 180) % 360}, ${s}%, ${l}%)` },
        { name: 'base light', hex: hslToHex(h, s, Math.min(l + 20, 90)), hsl: `hsl(${h}, ${s}%, ${Math.min(l + 20, 90)}%)` },
        { name: 'complement light', hex: hslToHex((h + 180) % 360, s, Math.min(l + 20, 90)), hsl: `hsl(${(h + 180) % 360}, ${s}%, ${Math.min(l + 20, 90)}%)` },
      ];
    } else if (mode === 'analogous') {
      [-60, -30, 0, 30, 60].forEach(offset => {
        const nh = (h + offset + 360) % 360;
        palette.push({ name: `${offset >= 0 ? '+' : ''}${offset}°`, hex: hslToHex(nh, s, l), hsl: `hsl(${nh}, ${s}%, ${l}%)` });
      });
    } else if (mode === 'triadic') {
      [0, 120, 240].forEach(offset => {
        const nh = (h + offset) % 360;
        palette.push({ name: `${offset}°`, hex: hslToHex(nh, s, l), hsl: `hsl(${nh}, ${s}%, ${l}%)` });
        palette.push({ name: `${offset}° light`, hex: hslToHex(nh, s, Math.min(l + 25, 90)), hsl: `hsl(${nh}, ${s}%, ${Math.min(l + 25, 90)}%)` });
      });
    }

    return { __type: 'color_palette', mode, base: color, baseHsl: `hsl(${h}, ${s}%, ${l}%)`, colors: palette, count: palette.length };
  }
});

SkillManager.register({
  name: 'markdown_preview',
  description: 'Renderiza Markdown como HTML formatado em iframe. Suporta headings, listas, código, blockquotes e links.',
  parameters: {
    markdown: { required: true, description: 'Texto em Markdown' },
    theme: { required: false, description: '"light" | "dark" (padrão: light)' }
  },
  example: `[SKILL:markdown_preview]
markdown: # Hello World
Este é um **preview** de Markdown.

- Item 1
- Item 2

\`\`\`js
console.log('hello')
\`\`\`
[/SKILL]`,
  execute({ markdown, theme = 'light' }) {
    let html = markdown
      .replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) =>
        `<pre><code class="lang-${lang}">${code.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>`)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/^#{4} (.+)$/gm, '<h4>$1</h4>')
      .replace(/^#{3} (.+)$/gm, '<h3>$1</h3>')
      .replace(/^#{2} (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, s => `<ul>${s}</ul>`)
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      .replace(/^(?!<[hbuplo]).+$/gm, s => s.trim() ? `<p>${s}</p>` : '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
      .replace(/---/g, '<hr>');

    const bg = theme === 'dark' ? '#0d1117' : '#ffffff';
    const fg = theme === 'dark' ? '#c9d1d9' : '#1a1a1a';
    const codeBg = theme === 'dark' ? '#161b22' : '#f6f8fa';
    const borderColor = theme === 'dark' ? '#21262d' : '#e1e4e8';

    const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
      body{margin:0;padding:20px 24px;font-family:-apple-system,system-ui,sans-serif;font-size:15px;line-height:1.7;background:${bg};color:${fg}}
      h1,h2,h3,h4{margin:1.2em 0 .5em;font-weight:600}
      h1{font-size:1.8em;border-bottom:1px solid ${borderColor};padding-bottom:.3em}
      h2{font-size:1.4em;border-bottom:1px solid ${borderColor};padding-bottom:.3em}
      pre{background:${codeBg};border-radius:6px;padding:14px;overflow:auto;font-size:13px;line-height:1.5}
      code{background:${codeBg};padding:2px 6px;border-radius:4px;font-size:13px;font-family:monospace}
      pre code{background:none;padding:0}
      blockquote{border-left:4px solid #6366f1;margin:0;padding:0 12px;color:${theme==='dark'?'#8b949e':'#555'}}
      ul{padding-left:1.5em}li{margin:.3em 0}
      a{color:#6366f1}hr{border:none;border-top:1px solid ${borderColor};margin:1.5em 0}
      p{margin:.6em 0}
    </style></head><body>${html}</body></html>`;

    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(fullHtml);
    return {
      __type: 'frontend_preview',
      title: `Markdown Preview (${theme})`,
      dataUrl,
      stats: { htmlLines: markdown.split('\n').length, cssChars: 0, jsChars: 0 }
    };
  }
});

SkillManager.register({
  name: 'encode_decode',
  description: 'Codifica/decodifica Base64, URL, HTML entities, inspeciona JWT payload e gera hash SHA-256.',
  parameters: {
    input: { required: true, description: 'Texto ou token para processar' },
    operation: { required: true, description: '"base64_encode" | "base64_decode" | "url_encode" | "url_decode" | "html_encode" | "html_decode" | "jwt_inspect" | "sha256"' }
  },
  example: `[SKILL:encode_decode]
operation: base64_encode
input: Olá Mundo!
[/SKILL]`,
  async execute({ input, operation }) {
    let result, error = null;
    try {
      if (operation === 'base64_encode') {
        result = btoa(unescape(encodeURIComponent(input)));
      } else if (operation === 'base64_decode') {
        result = decodeURIComponent(escape(atob(input)));
      } else if (operation === 'url_encode') {
        result = encodeURIComponent(input);
      } else if (operation === 'url_decode') {
        result = decodeURIComponent(input);
      } else if (operation === 'html_encode') {
        result = input.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
      } else if (operation === 'html_decode') {
        const t = document.createElement('textarea');
        t.innerHTML = input;
        result = t.value;
      } else if (operation === 'jwt_inspect') {
        const parts = input.split('.');
        if (parts.length !== 3) throw new Error('JWT inválido — esperado 3 partes separadas por ponto');
        const header = JSON.parse(atob(parts[0]));
        const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
        const exp = payload.exp ? new Date(payload.exp * 1000).toLocaleString() : null;
        result = `Header:\n${JSON.stringify(header, null, 2)}\n\nPayload:\n${JSON.stringify(payload, null, 2)}${exp ? `\n\nExpira: ${exp}` : ''}`;
      } else if (operation === 'sha256') {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
        result = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
      } else {
        throw new Error(`Operação desconhecida: ${operation}`);
      }
    } catch (e) { error = e.message; }

    if (error) return { __error: error };
    return { __type: 'encode_result', operation, inputLength: input.length, outputLength: result.length, result, summary: `${operation} — ${result.length} chars` };
  }
});

SkillManager.register({
  name: 'local_storage_manager',
  description: 'Gerencia localStorage: lista chaves, lê múltiplas, escreve batch, limpa por prefixo ou tudo.',
  parameters: {
    action: { required: true, description: '"list" | "get_many" | "set_many" | "clear_prefix" | "clear_all"' },
    keys: { required: false, description: 'Chaves separadas por vírgula (para get_many/clear_prefix)' },
    data: { required: false, description: 'JSON object {"chave":"valor"} para set_many' }
  },
  example: `[SKILL:local_storage_manager]
action: list
[/SKILL]`,
  execute({ action, keys = '', data = '{}' }) {
    try {
      if (action === 'list') {
        const all = Object.keys(localStorage).map(k => ({ key: k, size: `${localStorage.getItem(k).length} chars` }));
        return { __type: 'storage_list', count: all.length, items: all, summary: `${all.length} chave(s) no localStorage` };
      }
      if (action === 'get_many') {
        const ks = keys.split(',').map(k => k.trim()).filter(Boolean);
        const result = ks.reduce((acc, k) => ({ ...acc, [k]: localStorage.getItem(k) }), {});
        return { __type: 'storage_get', keys: ks, values: result };
      }
      if (action === 'set_many') {
        const obj = JSON.parse(data);
        Object.entries(obj).forEach(([k, v]) => localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)));
        return { __type: 'storage_set', saved: Object.keys(obj).length, keys: Object.keys(obj) };
      }
      if (action === 'clear_prefix') {
        const prefix = keys.trim();
        const removed = Object.keys(localStorage).filter(k => k.startsWith(prefix));
        removed.forEach(k => localStorage.removeItem(k));
        return { __type: 'storage_clear', removed: removed.length, keys: removed };
      }
      if (action === 'clear_all') {
        const count = localStorage.length;
        localStorage.clear();
        return { __type: 'storage_clear', removed: count, message: 'localStorage limpo completamente' };
      }
      return { __error: `Ação inválida: ${action}` };
    } catch (e) { return { __error: e.message }; }
  }
});

// ══════════════════════════════════════════════════════════════════
//  RENDERIZAÇÃO VISUAL DAS SKILLS
// ══════════════════════════════════════════════════════════════════

function renderSkillResult(result) {
  const skillName = result.__skillName || 'skill';
  const type = result.__type;

  if (result.__error) {
    return `<div class="skill-result skill-error">
      <div class="skill-result-header"><span class="skill-badge error">⚠ ${escHtml(skillName)}</span></div>
      <div class="skill-result-body"><pre class="skill-output" style="color:#f87171">${escHtml(result.__error)}</pre></div>
    </div>`;
  }

  if (type === 'frontend_preview') {
    return `<div class="skill-result skill-preview">
      <div class="skill-result-header">
        <span class="skill-badge frontend">▶ Frontend</span>
        <span class="skill-meta">${escHtml(result.title)}</span>
        <button class="skill-fullscreen-btn" onclick="openPreviewFullscreen(this)" data-url="${escHtml(result.dataUrl)}">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3"/></svg>
          Tela cheia
        </button>
      </div>
      <div class="skill-preview-frame">
        <iframe src="${escHtml(result.dataUrl)}" sandbox="allow-scripts allow-same-origin" loading="lazy"></iframe>
      </div>
      <div class="skill-result-footer">HTML: ${result.stats.htmlLines}L &nbsp;·&nbsp; CSS: ${result.stats.cssChars}ch &nbsp;·&nbsp; JS: ${result.stats.jsChars}ch</div>
    </div>`;
  }

  if (type === 'js_output') {
    return `<div class="skill-result ${result.hasError ? 'skill-error' : 'skill-success'}">
      <div class="skill-result-header">
        <span class="skill-badge js">JS ▶ run_js</span>
        <span class="skill-meta">${escHtml(result.elapsed)} · ${result.logCount} linha(s)</span>
      </div>
      <div class="skill-result-body"><pre class="skill-output">${escHtml(result.output)}</pre></div>
    </div>`;
  }

  if (type === 'api_response') {
    const bodyStr = typeof result.body === 'object' ? JSON.stringify(result.body, null, 2) : String(result.body);
    return `<div class="skill-result ${result.ok ? 'skill-success' : 'skill-error'}">
      <div class="skill-result-header">
        <span class="skill-badge api">API</span>
        <span class="skill-meta ${result.ok ? 'ok' : 'err'}">${result.status} ${escHtml(result.statusText)}</span>
        <span class="skill-meta">${escHtml(result.elapsed)} · ${escHtml(result.size)}</span>
      </div>
      <div class="skill-result-body"><pre class="skill-output">${escHtml(bodyStr.slice(0, 2000))}${bodyStr.length > 2000 ? '\n...(truncado)' : ''}</pre></div>
    </div>`;
  }

  if (type === 'json_analysis') {
    return `<div class="skill-result skill-info">
      <div class="skill-result-header"><span class="skill-badge data">JSON</span><span class="skill-meta">${escHtml(result.rootType)} · ${escHtml(result.size)}</span></div>
      <div class="skill-result-body"><pre class="skill-output">${escHtml(JSON.stringify(result.structure, null, 2))}\n\nPreview:\n${escHtml(result.preview)}</pre></div>
    </div>`;
  }

  if (type === 'regex_test') {
    return `<div class="skill-result skill-info">
      <div class="skill-result-header"><span class="skill-badge regex">REGEX</span><span class="skill-meta">${result.passed}/${result.tested} passaram</span></div>
      <div class="skill-result-body"><pre class="skill-output">${escHtml(result.results.map(r => `${r.matched ? '✅' : '❌'} "${r.string}"${r.matches ? ' — ' + r.matches + ' match(es)' : ''}`).join('\n'))}</pre></div>
    </div>`;
  }

  if (type === 'schema_validation') {
    return `<div class="skill-result ${result.valid ? 'skill-success' : 'skill-error'}">
      <div class="skill-result-header"><span class="skill-badge data">SCHEMA</span><span class="skill-meta">${escHtml(result.summary)}</span></div>
      <div class="skill-result-body"><pre class="skill-output">${escHtml([result.summary, ...result.errors, ...result.warnings].join('\n'))}</pre></div>
    </div>`;
  }

  if (type === 'css_analysis') {
    return `<div class="skill-result ${result.issues.length ? 'skill-error' : result.warnings.length ? 'skill-warn' : 'skill-success'}">
      <div class="skill-result-header"><span class="skill-badge css">CSS</span><span class="skill-meta">${escHtml(result.summary)}</span></div>
      <div class="skill-result-body"><pre class="skill-output">${escHtml([...result.issues, ...result.warnings, ...result.info].join('\n') || 'Sem problemas detectados.')}</pre></div>
    </div>`;
  }

  if (type === 'diff_result') {
    return `<div class="skill-result skill-info">
      <div class="skill-result-header"><span class="skill-badge diff">DIFF</span><span class="skill-meta">+${result.added} -${result.removed} ~${result.changed}</span></div>
      <div class="skill-result-body"><pre class="skill-output">${escHtml(result.details.join('\n') || 'Sem diferenças.')}</pre></div>
    </div>`;
  }

  if (type === 'dom_result') {
    return `<div class="skill-result skill-info">
      <div class="skill-result-header"><span class="skill-badge dom">DOM</span><span class="skill-meta">${result.count} elemento(s) — "${escHtml(result.selector)}"</span></div>
      <div class="skill-result-body"><pre class="skill-output">${escHtml(JSON.stringify(result.elements, null, 2).slice(0, 1000))}</pre></div>
    </div>`;
  }

  if (type === 'format_result') {
    return `<div class="skill-result ${result.valid ? 'skill-success' : 'skill-error'}">
      <div class="skill-result-header"><span class="skill-badge data">FORMAT</span><span class="skill-meta">${escHtml(result.summary || '')}</span></div>
      <div class="skill-result-body"><pre class="skill-output">${result.error ? escHtml('❌ ' + result.error) : escHtml((result.formatted || '').slice(0, 2000))}</pre></div>
    </div>`;
  }

  if (type === 'fake_data') {
    return `<div class="skill-result skill-info">
      <div class="skill-result-header"><span class="skill-badge data">FAKE</span><span class="skill-meta">${escHtml(result.summary)}</span></div>
      <div class="skill-result-body"><pre class="skill-output">${escHtml(result.preview.slice(0, 2000))}</pre></div>
    </div>`;
  }

  if (type === 'benchmark_result') {
    return `<div class="skill-result skill-success">
      <div class="skill-result-header"><span class="skill-badge js">BENCH</span><span class="skill-meta">${escHtml(result.summary)}</span></div>
      <div class="skill-result-body"><pre class="skill-output">${escHtml([
        `ops/s:  ${result.opsPerSec}`,
        `avg:    ${result.avg}`,
        `min:    ${result.min}`,
        `max:    ${result.max}`,
        `p95:    ${result.p95}`,
        `stdDev: ${result.stdDev}`,
        `iters:  ${result.iterations}`
      ].join('\n'))}</pre></div>
    </div>`;
  }

  if (type === 'color_palette') {
    const swatches = result.colors.map(c =>
      `<div style="display:flex;align-items:center;gap:10px;padding:5px 16px;">
        <div style="width:32px;height:32px;border-radius:6px;background:${c.hex};border:1px solid rgba(0,0,0,.12);flex-shrink:0"></div>
        <code style="font-size:12px;color:var(--text)">${c.hex}</code>
        <span style="font-size:12px;color:var(--text-dim)">${escHtml(c.name)} — ${escHtml(c.hsl)}</span>
      </div>`
    ).join('');
    return `<div class="skill-result skill-info">
      <div class="skill-result-header"><span class="skill-badge css">PALETTE</span><span class="skill-meta">${escHtml(result.mode)} · ${result.count} cores</span></div>
      <div class="skill-result-body" style="padding:8px 0">${swatches}</div>
    </div>`;
  }

  if (type === 'encode_result') {
    return `<div class="skill-result skill-success">
      <div class="skill-result-header"><span class="skill-badge data">ENCODE</span><span class="skill-meta">${escHtml(result.summary)}</span></div>
      <div class="skill-result-body"><pre class="skill-output">${escHtml(result.result.slice(0, 2000))}</pre></div>
    </div>`;
  }

  if (type === 'storage_list' || type === 'storage_get' || type === 'storage_set' || type === 'storage_clear' || type === 'storage_ok' || type === 'storage_read') {
    const clean = Object.entries(result).filter(([k]) => !k.startsWith('__')).reduce((a, [k, v]) => ({ ...a, [k]: v }), {});
    return `<div class="skill-result skill-info">
      <div class="skill-result-header"><span class="skill-badge dom">STORAGE</span><span class="skill-meta">${escHtml(type)}</span></div>
      <div class="skill-result-body"><pre class="skill-output">${escHtml(JSON.stringify(clean, null, 2).slice(0, 1000))}</pre></div>
    </div>`;
  }

  // Fallback genérico
  const clean = Object.entries(result).filter(([k]) => !k.startsWith('__')).reduce((a, [k, v]) => ({ ...a, [k]: v }), {});
  return `<div class="skill-result skill-info">
    <div class="skill-result-header"><span class="skill-badge">${escHtml(skillName)}</span></div>
    <div class="skill-result-body"><pre class="skill-output">${escHtml(JSON.stringify(clean, null, 2))}</pre></div>
  </div>`;
}

// Converte resultado para texto que a IA vai ler no feedback loop
function skillResultToAIText(result) {
  if (result.__error) return `ERRO: ${result.__error}`;
  const type = result.__type;
  if (type === 'js_output') return `OUTPUT do código JavaScript:\n${result.output}\nTempo: ${result.elapsed}${result.hasError ? `\nERRO: ${result.error}` : ''}`;
  if (type === 'frontend_preview') return `Preview frontend criado com sucesso: "${result.title}". Stats: HTML ${result.stats.htmlLines} linhas, CSS ${result.stats.cssChars} chars, JS ${result.stats.jsChars} chars.`;
  if (type === 'api_response') return `Resposta da API:\nStatus: ${result.status} ${result.statusText} (${result.elapsed})\nBody:\n${JSON.stringify(result.body, null, 2).slice(0, 1500)}`;
  if (type === 'json_analysis') return `Análise JSON:\nTipo: ${result.rootType}\nEstrutura: ${JSON.stringify(result.structure)}\nPreview: ${result.preview}`;
  if (type === 'regex_test') return `Teste de Regex:\n${result.passed}/${result.tested} passaram\n${result.results.map(r => `${r.matched ? '✅' : '❌'} "${r.string}"`).join('\n')}`;
  if (type === 'schema_validation') return `Validação de schema:\n${result.summary}\n${[...result.errors, ...result.warnings].join('\n')}`;
  if (type === 'css_analysis') return `Análise CSS:\n${result.summary}\n${[...result.issues, ...result.warnings, ...result.info].join('\n')}`;
  if (type === 'diff_result') return `Diff (${result.label}):\n+${result.added} adicionadas, -${result.removed} removidas, ~${result.changed} modificadas\n${result.details.join('\n')}`;
  if (type === 'dom_result') return `DOM Query "${result.selector}":\n${result.count} elemento(s) encontrado(s)\n${JSON.stringify(result.elements, null, 2).slice(0, 500)}`;
  if (type === 'format_result') return `Formatação (${result.lang}):\n${result.valid ? `Válido — ${result.lines} linhas` : `Erro: ${result.error}`}`;
  if (type === 'fake_data') return `Dados gerados (${result.dataType}):\n${result.summary}\n${result.preview.slice(0, 800)}`;
  if (type === 'benchmark_result') return `Benchmark:\n${result.summary}\nops/s: ${result.opsPerSec} | avg: ${result.avg} | min: ${result.min} | max: ${result.max} | p95: ${result.p95} | stdDev: ${result.stdDev}`;
  if (type === 'color_palette') return `Paleta (${result.mode}) a partir de ${result.base}:\n${result.colors.map(c => `${c.name}: ${c.hex} — ${c.hsl}`).join('\n')}`;
  if (type === 'encode_result') return `${result.operation}:\nInput: ${result.inputLength} chars → Output: ${result.outputLength} chars\n${result.result.slice(0, 500)}`;
  if (type === 'storage_list') return `localStorage: ${result.count} chave(s)\n${result.items.map(i => `${i.key} (${i.size})`).join('\n')}`;
  return JSON.stringify(Object.entries(result).filter(([k]) => !k.startsWith('__')).reduce((a, [k, v]) => ({ ...a, [k]: v }), {}), null, 2).slice(0, 1500);
}

// ── PROCESSADOR PRINCIPAL ─────────────────────────────────────────
async function processSkillBlocks(content, context = {}) {
  const skillRegex = /\[SKILL:(\w+)\]([\s\S]*?)\[\/SKILL\]/g;
  const matches = [];
  let m;
  while ((m = skillRegex.exec(content)) !== null) {
    const [fullMatch, skillName, paramBlock] = m;
    const params = {};
    const lines = paramBlock.split('\n');
    let ck = null, cv = [];
    for (const line of lines) {
      if (/^\s*[\w_]+\s*:/.test(line)) {
        if (ck) params[ck] = cv.join('\n').trim();
        const ci = line.indexOf(':');
        ck = line.slice(0, ci).trim();
        cv = [line.slice(ci + 1).trim()];
      } else if (ck) { cv.push(line); }
    }
    if (ck) params[ck] = cv.join('\n').trim();
    matches.push({ fullMatch, skillName, params });
  }

  if (matches.length === 0) return { renderedContent: content, skillOutputsForAI: null, skillHtmlMap: {} };

  let renderedContent = content;
  const aiParts = [];
  const skillHtmlMap = {};

  for (const item of matches) {
    const result = await SkillManager.execute(item.skillName, item.params, context);
    const uid = `skill_${item.skillName}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    skillHtmlMap[uid] = renderSkillResult(result);
    aiParts.push(skillResultToAIText(result));
    renderedContent = renderedContent.replace(item.fullMatch, `\n\n[[[SKILL_OUTPUT:${uid}]]]\n\n`);
  }

  return { renderedContent, skillOutputsForAI: aiParts.length ? aiParts.join('\n\n---\n\n') : null, skillHtmlMap };
}

function injectSkillOutputsIntoDOM(containerEl, skillHtmlMap) {
  if (!containerEl || !skillHtmlMap) return;
  const walker = document.createTreeWalker(containerEl, NodeFilter.SHOW_TEXT);
  const toReplace = [];
  let node;
  while ((node = walker.nextNode())) {
    const match = node.textContent.match(/\[\[\[SKILL_OUTPUT:([^\]]+)\]\]\]/);
    if (match) toReplace.push({ node, uid: match[1] });
  }
  for (const { node, uid } of toReplace) {
    const html = skillHtmlMap[uid];
    if (!html) continue;
    const div = document.createElement('div');
    div.innerHTML = html;
    node.parentNode?.replaceChild(div, node);
  }
}

// ── FULLSCREEN PREVIEW ─────────────────────────────────────────────
window.openPreviewFullscreen = function (btn) {
  const url = btn.dataset.url;
  if (!url) return;
  const ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0a0a0a;display:flex;flex-direction:column;';
  ov.innerHTML = `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 14px;background:#111;border-bottom:1px solid #222;flex-shrink:0">
    <span style="color:#aaa;font-size:13px;font-family:monospace">MasterGPT — Frontend Preview</span>
    <button onclick="this.closest('div').remove()" style="background:none;border:none;color:#aaa;cursor:pointer;font-size:20px;line-height:1;padding:2px 8px">✕</button>
  </div>
  <iframe src="${url}" sandbox="allow-scripts allow-same-origin" style="flex:1;border:none;background:white"></iframe>`;
  document.body.appendChild(ov);
};

// ── INIT ───────────────────────────────────────────────────────────
function initSkills() {
  const addition = SkillManager.getSystemPromptAddition();
  if (addition && window.__SYSTEM) window.__SYSTEM += addition;
  injectSkillStyles();
  console.log('[Skills] v4.1 — ' + SkillManager.list().length + ' skills carregadas com feedback loop.');
}

function injectSkillStyles() {
  const s = document.createElement('style');
  s.textContent = `
    .skill-result {
      border-radius: 12px;
      overflow: hidden;
      margin: 12px 0;
      border: 1px solid var(--border);
      font-size: 13px;
      background: var(--bg-input);
      box-shadow: var(--shadow);
    }
    .skill-result.skill-success { border-color: var(--accent); }
    .skill-result.skill-error { border-color: var(--danger); }
    .skill-result.skill-warn { border-color: var(--warning); }
    .skill-result.skill-info { border-color: var(--blue); }

    .skill-result-header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      background: var(--bg-hover);
      border-bottom: 1px solid var(--border);
      flex-wrap: wrap;
    }

    .skill-badge {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: .05em;
      padding: 3px 10px;
      border-radius: 6px;
      font-family: var(--mono);
      background: var(--bg-active);
      color: var(--text-secondary);
      text-transform: uppercase;
    }
    .skill-badge.frontend { background: rgba(88, 166, 255, 0.15); color: var(--blue); }
    .skill-badge.js       { background: rgba(210, 153, 34, 0.15);  color: var(--warning); }
    .skill-badge.api      { background: rgba(35, 134, 54, 0.15);   color: var(--accent); }
    .skill-badge.data     { background: rgba(188, 140, 255, 0.15); color: var(--purple); }
    .skill-badge.css      { background: rgba(88, 166, 255, 0.12);  color: var(--blue); }
    .skill-badge.diff     { background: rgba(210, 153, 34, 0.12);  color: var(--warning); }
    .skill-badge.dom      { background: rgba(35, 134, 54, 0.12);   color: var(--accent); }
    .skill-badge.regex    { background: rgba(248, 81, 73, 0.12);   color: var(--danger); }
    .skill-badge.error    { background: rgba(248, 81, 73, 0.15);   color: var(--danger); }

    .skill-meta { font-size: 12px; color: var(--text-dim); font-family: var(--mono); }
    .skill-meta.ok  { color: var(--accent); }
    .skill-meta.err { color: var(--danger); }

    .skill-result-body { padding: 0; background: var(--bg); }

    .skill-output {
      margin: 0;
      padding: 12px 16px;
      font-size: 13px;
      line-height: 1.6;
      font-family: var(--mono);
      white-space: pre-wrap;
      word-break: break-word;
      color: var(--text);
      max-height: 350px;
      overflow-y: auto;
      background: #010409;
    }

    .skill-result-footer {
      padding: 6px 14px;
      font-size: 11px;
      color: var(--text-dim);
      border-top: 1px solid var(--border);
      background: var(--bg-hover);
    }

    .skill-preview-frame { background: white; border-radius: 0 0 12px 12px; overflow: hidden; }
    .skill-preview-frame iframe { width: 100%; height: 320px; border: none; display: block; }

    .skill-fullscreen-btn {
      margin-left: auto;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      background: var(--bg-active);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      font-size: 12px;
      cursor: pointer;
      transition: all var(--transition);
      font-weight: 500;
    }
    .skill-fullscreen-btn:hover {
      background: var(--bg-hover);
      border-color: var(--border-light);
    }

    .ai-feedback-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--text-secondary);
      padding: 4px 12px;
      background: var(--bg-input);
      border-radius: 99px;
      border: 1px solid var(--border);
      margin-bottom: 10px;
    }
    .ai-feedback-badge svg { color: var(--accent); }
  `;
  document.head.appendChild(s);
}