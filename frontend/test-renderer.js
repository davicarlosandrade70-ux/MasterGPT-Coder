/**
 * ═══════════════════════════════════════════════════════════════════
 *  MASTERGPT-CODER — test-renderer.js
 *  Testes unitários para o MarkdownRenderer
 * ═══════════════════════════════════════════════════════════════════
 */

async function runTests() {
  console.log('🧪 Iniciando testes do MarkdownRenderer...');
  const renderer = window.mdRenderer;
  const container = document.createElement('div');
  document.body.appendChild(container);
  container.style.display = 'none';

  const results = {
    total: 0,
    passed: 0,
    failed: 0
  };

  function assert(condition, message) {
    results.total++;
    if (condition) {
      results.passed++;
      console.log(`✅ PASSED: ${message}`);
    } else {
      results.failed++;
      console.error(`❌ FAILED: ${message}`);
    }
  }

  // Teste 1: Parsing de blocos
  const md = "# Título\n\nParágrafo 1\n\n```js\nconst x = 1;\n```";
  const blocks = renderer.parseBlocks(md);
  assert(blocks.length === 3, 'Deve identificar 3 blocos lógicos');
  assert(blocks[0].type === 'heading', 'Primeiro bloco deve ser heading');
  assert(blocks[1].type === 'paragraph', 'Segundo bloco deve ser paragraph');
  assert(blocks[2].type === 'code', 'Terceiro bloco deve ser code');

  // Teste 2: Cache Hit
  renderer.cache.clear();
  renderer.metrics.hits = 0;
  renderer.metrics.misses = 0;
  
  const block = blocks[1];
  renderer.renderBlock(block); // First render (miss)
  assert(renderer.metrics.misses === 1, 'Primeiro render deve ser miss');
  
  renderer.renderBlock(block); // Second render (hit)
  assert(renderer.metrics.hits === 1, 'Segundo render do mesmo bloco deve ser hit');

  // Teste 3: Detecção de alterações
  container.innerHTML = '';
  renderer.render(md, container, false); // Render sem lazy para facilitar teste
  const firstHash = container.querySelector('.md-block').dataset.hash;
  
  const mdChanged = "# Título Alterado\n\nParágrafo 1\n\n```js\nconst x = 1;\n```";
  renderer.render(mdChanged, container, false);
  const secondHash = container.querySelector('.md-block').dataset.hash;
  
  assert(firstHash !== secondHash, 'Hash deve mudar quando conteúdo do bloco muda');
  assert(container.querySelectorAll('.md-block')[1].dataset.hash === blocks[1].hash, 'Hash do bloco inalterado deve permanecer igual');

  // Teste 4: Lazy Loading (simulado)
  container.innerHTML = '';
  renderer.render(md, container, true);
  const lazyBlock = container.querySelector('.md-block.is-lazy');
  assert(lazyBlock !== null, 'Blocos devem iniciar como lazy quando useLazy=true');
  assert(lazyBlock.querySelector('.md-block-placeholder') !== null, 'Bloco lazy deve conter placeholder');

  console.log(`\n📊 Resumo dos testes: ${results.passed}/${results.total} passaram.`);
  if (results.failed > 0) {
    console.error(`🚨 ${results.failed} testes falharam!`);
  } else {
    console.log('🎉 Todos os testes passaram com sucesso!');
  }

  // Limpeza
  document.body.removeChild(container);
}

// Expor para rodar via console
window.runRendererTests = runTests;
