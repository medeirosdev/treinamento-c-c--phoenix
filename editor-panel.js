/**
 * Phoenix C/C++ Training — Editor Panel
 * Painel lateral fixo com Monaco Editor + Godbolt API
 */
(function () {
  'use strict';

  const PANEL_W   = 480;
  const GODBOLT   = 'https://godbolt.org/api/compiler';
  const COMPILERS = {
    c:   { id: 'cg132', args: '-std=c17 -O2 -Wall' },
    cpp: { id: 'g132',  args: '-std=c++17 -O2 -Wall' }
  };
  const TEMPLATES = {
    c:   '#include <stdio.h>\n\nint main(void) {\n    printf("Hello, Phoenix!\\n");\n    return 0;\n}\n',
    cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, Phoenix!" << std::endl;\n    return 0;\n}\n'
  };

  let monacoReady = false;
  let editors     = {};   // tabId → monaco instance
  let tabs        = [];   // [{id, name, lang, code}]
  let activeTab   = null;
  let tabN        = 0;
  let collapsed   = false;

  /* ─── CSS ─────────────────────────────────────────────────────────── */
  const CSS = `
    .ep {
      position:fixed; top:0; right:0; bottom:0; width:${PANEL_W}px;
      background:#08060a; border-left:1px solid rgba(255,106,0,.22);
      display:flex; flex-direction:column; z-index:200;
      font-family:'Segoe UI',system-ui,sans-serif;
      transition:transform .3s ease;
      box-shadow:-4px 0 24px rgba(0,0,0,.5);
    }
    .ep.ep--collapsed { transform:translateX(${PANEL_W - 28}px); }

    .ep-toggle {
      position:absolute; left:-28px; top:50%;
      transform:translateY(-50%);
      width:28px; height:72px;
      background:linear-gradient(180deg,#ff6a00,#ffaa00);
      border:none; border-radius:8px 0 0 8px;
      cursor:pointer; color:#000; font-weight:800;
      font-size:.65rem; letter-spacing:.12em;
      display:flex; align-items:center; justify-content:center;
      writing-mode:vertical-rl; text-orientation:mixed;
      transition:opacity .2s;
    }
    .ep-toggle:hover { opacity:.85; }

    /* ── Tab bar ── */
    .ep-tabbar {
      display:flex; align-items:center; gap:2px;
      background:#050400; border-bottom:1px solid rgba(255,106,0,.15);
      min-height:38px; padding:0 4px; overflow-x:auto; flex-shrink:0;
    }
    .ep-tabbar::-webkit-scrollbar { height:3px; }
    .ep-tabbar::-webkit-scrollbar-thumb { background:#ff6a00; border-radius:2px; }

    .ep-tab {
      display:flex; align-items:center; gap:5px;
      padding:5px 10px; border-radius:6px 6px 0 0;
      cursor:pointer; font-size:.76rem; color:#7a6a50;
      background:transparent; border:1px solid transparent;
      border-bottom:none; white-space:nowrap;
      transition:all .15s; min-width:80px; max-width:150px;
    }
    .ep-tab:hover { background:rgba(255,106,0,.08); color:#f0ece0; }
    .ep-tab.ep-tab--active {
      background:#0f0c00; border-color:rgba(255,106,0,.28); color:#ff6a00;
    }
    .ep-tab-badge {
      font-size:.58rem; font-weight:700; padding:1px 4px;
      border-radius:3px; background:rgba(255,106,0,.15);
      color:#ff6a00; flex-shrink:0;
    }
    .ep-tab-badge.ep-badge-cpp { background:rgba(255,170,0,.15); color:#ffaa00; }
    .ep-tab-name { flex:1; overflow:hidden; text-overflow:ellipsis; }
    .ep-tab-name[contenteditable] { outline:none; }
    .ep-tab-x {
      width:14px; height:14px; border-radius:50%; border:none;
      background:transparent; color:#7a6a50; cursor:pointer;
      font-size:.68rem; display:flex; align-items:center;
      justify-content:center; padding:0; flex-shrink:0;
    }
    .ep-tab-x:hover { background:rgba(244,67,54,.3); color:#f44336; }
    .ep-add {
      padding:4px 9px; border:none; background:transparent;
      color:#7a6a50; cursor:pointer; font-size:1.1rem;
      border-radius:4px; flex-shrink:0; margin-left:2px;
      line-height:1;
    }
    .ep-add:hover { background:rgba(255,106,0,.15); color:#ff6a00; }

    /* ── Toolbar ── */
    .ep-toolbar {
      display:flex; align-items:center; gap:8px;
      padding:7px 12px; background:#0c0900;
      border-bottom:1px solid rgba(255,106,0,.12); flex-shrink:0;
    }
    .ep-lang {
      background:rgba(255,106,0,.1); border:1px solid rgba(255,106,0,.25);
      color:#ff6a00; border-radius:6px; padding:4px 8px;
      font-size:.78rem; font-weight:700; cursor:pointer; outline:none;
    }
    .ep-lang option { background:#110e00; color:#f0ece0; }
    .ep-stdin {
      flex:1; background:rgba(255,255,255,.04);
      border:1px solid rgba(255,106,0,.14); border-radius:5px;
      color:#f0ece0; font-size:.76rem; padding:4px 8px;
      outline:none; font-family:'Consolas',monospace;
    }
    .ep-stdin:focus { border-color:rgba(255,106,0,.4); }
    .ep-run {
      padding:5px 16px;
      background:linear-gradient(135deg,#ff6a00,#ffaa00);
      border:none; border-radius:6px; color:#000;
      font-weight:800; font-size:.8rem; cursor:pointer;
      transition:opacity .2s,transform .1s; white-space:nowrap;
    }
    .ep-run:hover { opacity:.88; transform:scale(1.02); }
    .ep-run:disabled { opacity:.45; cursor:not-allowed; transform:none; }

    /* ── Editor wrap ── */
    .ep-editors { flex:1; overflow:hidden; min-height:0; position:relative; }
    .ep-ed-slot { width:100%; height:100%; display:none; }
    .ep-ed-slot.ep-ed--active { display:block; }

    /* Monaco loading placeholder */
    .ep-loading {
      display:flex; align-items:center; justify-content:center;
      height:100%; color:#7a6a50; font-size:.85rem; gap:8px;
    }
    .ep-spin { animation:ep-spin .8s linear infinite; display:inline-block; }
    @keyframes ep-spin { to{transform:rotate(360deg);} }

    /* ── Output ── */
    .ep-out-bar {
      display:flex; align-items:center; justify-content:space-between;
      padding:4px 14px; background:#070500;
      border-top:1px solid rgba(255,106,0,.15); flex-shrink:0;
    }
    .ep-out-title { font-size:.68rem; font-weight:700; color:#7a6a50; letter-spacing:.1em; }
    .ep-out-clear { background:none; border:none; color:#7a6a50; cursor:pointer; font-size:.68rem; }
    .ep-out-clear:hover { color:#f44336; }
    .ep-out {
      height:180px; background:#040300; overflow-y:auto;
      padding:8px 14px; font-family:'Consolas',monospace;
      font-size:.78rem; line-height:1.65; flex-shrink:0;
    }
    .ep-out::-webkit-scrollbar { width:4px; }
    .ep-out::-webkit-scrollbar-thumb { background:#2a2000; border-radius:2px; }
    .out-info    { color:#7a6a50; font-style:italic; }
    .out-ok      { color:#66bb6a; font-weight:700; }
    .out-err     { color:#ef5350; font-weight:700; }
    .out-stdout  { color:#a5d6a7; }
    .out-stderr  { color:#ef9a9a; }
    .out-sep     { color:#2a2000; }

    /* ── "Usar no editor" button on pre blocks ── */
    .ep-use {
      position:absolute; top:8px; right:8px;
      padding:3px 10px; background:rgba(255,106,0,.12);
      border:1px solid rgba(255,106,0,.28); border-radius:5px;
      color:#ff6a00; font-size:.68rem; cursor:pointer;
      font-family:'Segoe UI',system-ui,sans-serif;
      transition:all .15s; opacity:0; pointer-events:none;
    }
    pre:hover .ep-use { opacity:1; pointer-events:auto; }
    .ep-use:hover { background:rgba(255,106,0,.28); }

    /* ── Responsive ── */
    @media(max-width:1100px){
      .ep { width:100%!important; top:auto; height:360px;
            border-left:none; border-top:1px solid rgba(255,106,0,.22);
            transform:none!important; }
      .ep.ep--collapsed { transform:translateY(calc(100% - 38px))!important; }
      .ep-toggle { left:50%; top:-22px; transform:translateX(-50%);
                   writing-mode:horizontal-tb; width:72px; height:22px;
                   border-radius:8px 8px 0 0; }
    }
  `;

  /* ─── HTML ─────────────────────────────────────────────────────────── */
  const HTML = `
    <div class="ep" id="ep">
      <button class="ep-toggle" id="ep-toggle">EDITOR</button>
      <div class="ep-tabbar" id="ep-tabbar">
        <button class="ep-add" id="ep-add" title="Nova aba (Ctrl+T)">＋</button>
      </div>
      <div class="ep-toolbar">
        <select class="ep-lang" id="ep-lang">
          <option value="c">C</option>
          <option value="cpp">C++</option>
        </select>
        <input class="ep-stdin" id="ep-stdin" placeholder="stdin (opcional)…" />
        <button class="ep-run" id="ep-run">▶ Executar</button>
      </div>
      <div class="ep-editors" id="ep-editors">
        <div class="ep-loading"><span class="ep-spin">⟳</span> Carregando editor…</div>
      </div>
      <div class="ep-out-bar">
        <span class="ep-out-title">▌ OUTPUT</span>
        <button class="ep-out-clear" id="ep-clear">limpar</button>
      </div>
      <div class="ep-out" id="ep-out">
        <span class="out-info">// Escreva código e clique ▶ Executar</span>
      </div>
    </div>`;

  /* ─── Init ─────────────────────────────────────────────────────────── */
  function init() {
    injectCSS();
    document.body.insertAdjacentHTML('beforeend', HTML);
    adjustMainMargin(PANEL_W);
    injectUseButtons();

    document.getElementById('ep-toggle').addEventListener('click', togglePanel);
    document.getElementById('ep-add').addEventListener('click', () => addTab());
    document.getElementById('ep-run').addEventListener('click', runCode);
    document.getElementById('ep-clear').addEventListener('click', clearOutput);
    document.getElementById('ep-lang').addEventListener('change', onLangChange);

    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 't') { e.preventDefault(); addTab(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCode(); }
    });

    loadMonaco();
    addTab('main.c', 'c', TEMPLATES.c);
  }

  function injectCSS() {
    const s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function adjustMainMargin(w) {
    const main = document.querySelector('.main');
    if (main) main.style.marginRight = w + 'px';
  }

  /* ─── Toggle ───────────────────────────────────────────────────────── */
  function togglePanel() {
    collapsed = !collapsed;
    document.getElementById('ep').classList.toggle('ep--collapsed', collapsed);
    document.getElementById('ep-toggle').textContent = collapsed ? '▶ EDITOR' : '◀ EDITOR';
    adjustMainMargin(collapsed ? 28 : PANEL_W);
    setTimeout(() => Object.values(editors).forEach(e => e.layout()), 320);
  }

  /* ─── Tabs ─────────────────────────────────────────────────────────── */
  function addTab(name, lang, code) {
    tabN++;
    const id   = 'tab' + tabN;
    lang       = lang || 'c';
    code       = code !== undefined ? code : TEMPLATES[lang];
    name       = name || 'arquivo' + tabN + (lang === 'cpp' ? '.cpp' : '.c');

    tabs.push({ id, name, lang, code });

    /* tab element */
    const t = document.createElement('div');
    t.className = 'ep-tab';
    t.dataset.id = id;
    const badgeCls = lang === 'cpp' ? 'ep-badge-cpp' : '';
    t.innerHTML = `
      <span class="ep-tab-badge ${badgeCls}">${lang === 'cpp' ? 'C++' : 'C'}</span>
      <span class="ep-tab-name">${escHtml(name)}</span>
      <button class="ep-tab-x" title="Fechar">✕</button>`;

    /* rename on dblclick */
    t.querySelector('.ep-tab-name').addEventListener('dblclick', startRename);
    t.querySelector('.ep-tab-x').addEventListener('click', (e) => { e.stopPropagation(); closeTab(id); });
    t.addEventListener('click', (e) => { if (!e.target.classList.contains('ep-tab-x')) activateTab(id); });

    const addBtn = document.getElementById('ep-add');
    document.getElementById('ep-tabbar').insertBefore(t, addBtn);

    /* editor slot */
    const wrap = document.getElementById('ep-editors');
    const slot = document.createElement('div');
    slot.className = 'ep-ed-slot';
    slot.id = 'slot-' + id;
    wrap.appendChild(slot);

    if (monacoReady) createMonaco(id, lang, code);
    activateTab(id);
    return id;
  }

  function closeTab(id) {
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex(t => t.id === id);
    tabs.splice(idx, 1);
    if (editors[id]) { editors[id].dispose(); delete editors[id]; }
    document.querySelector(`.ep-tab[data-id="${id}"]`)?.remove();
    document.getElementById('slot-' + id)?.remove();
    if (activeTab === id) activateTab(tabs[Math.min(idx, tabs.length - 1)].id);
  }

  function activateTab(id) {
    activeTab = id;
    const tab = tabs.find(t => t.id === id);
    if (!tab) return;
    document.querySelectorAll('.ep-tab').forEach(el => el.classList.toggle('ep-tab--active', el.dataset.id === id));
    document.querySelectorAll('.ep-ed-slot').forEach(el => el.classList.toggle('ep-ed--active', el.id === 'slot-' + id));
    document.getElementById('ep-lang').value = tab.lang;
    if (editors[id]) editors[id].layout();
  }

  function startRename(e) {
    const el = e.target;
    const id = el.closest('.ep-tab').dataset.id;
    el.contentEditable = 'true'; el.focus();
    const r = document.createRange(); r.selectNodeContents(el);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(r);
    const finish = () => {
      el.contentEditable = 'false';
      const tab = tabs.find(t => t.id === id);
      if (tab) tab.name = el.textContent.trim() || tab.name;
    };
    el.addEventListener('blur', finish, { once: true });
    el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); el.blur(); } });
  }

  function onLangChange() {
    const tab = tabs.find(t => t.id === activeTab);
    if (!tab) return;
    tab.lang = document.getElementById('ep-lang').value;
    const badge = document.querySelector(`.ep-tab[data-id="${activeTab}"] .ep-tab-badge`);
    if (badge) {
      badge.textContent = tab.lang === 'cpp' ? 'C++' : 'C';
      badge.className = 'ep-tab-badge' + (tab.lang === 'cpp' ? ' ep-badge-cpp' : '');
    }
    if (editors[activeTab]) {
      const model = editors[activeTab].getModel();
      // eslint-disable-next-line no-undef
      monaco.editor.setModelLanguage(model, tab.lang === 'cpp' ? 'cpp' : 'c');
    }
  }

  /* ─── Monaco ───────────────────────────────────────────────────────── */
  function loadMonaco() {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js';
    s.onload = () => {
      // eslint-disable-next-line no-undef
      require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
      // eslint-disable-next-line no-undef
      require(['vs/editor/editor.main'], () => {
        defineTheme();
        monacoReady = true;
        /* clear loading placeholder */
        const wrap = document.getElementById('ep-editors');
        const ph = wrap.querySelector('.ep-loading');
        if (ph) ph.remove();
        /* create editors for all existing tabs */
        tabs.forEach(tab => createMonaco(tab.id, tab.lang, tab.code));
        activateTab(activeTab);
      });
    };
    document.head.appendChild(s);
  }

  function defineTheme() {
    // eslint-disable-next-line no-undef
    monaco.editor.defineTheme('phoenix', {
      base: 'vs-dark', inherit: true,
      rules: [
        { token: 'comment',  foreground: '5a7a5a', fontStyle: 'italic' },
        { token: 'keyword',  foreground: 'cc88ff' },
        { token: 'string',   foreground: 'a5d6a7' },
        { token: 'number',   foreground: 'ffab40' },
        { token: 'type',     foreground: '4fc3f7' },
        { token: 'variable', foreground: 'f0ece0' },
      ],
      colors: {
        'editor.background':               '#080600',
        'editor.lineHighlightBackground':  '#140f00',
        'editorLineNumber.foreground':     '#3a2810',
        'editorLineNumber.activeForeground':'#ff6a00',
        'editor.selectionBackground':      '#3d2200',
        'editorCursor.foreground':         '#ff6a00',
        'editorIndentGuide.background':    '#1a1200',
        'scrollbarSlider.background':      '#2a1a00aa',
        'scrollbarSlider.hoverBackground': '#ff6a0066',
      }
    });
    // eslint-disable-next-line no-undef
    monaco.editor.setTheme('phoenix');
  }

  function createMonaco(tabId, lang, code) {
    const slot = document.getElementById('slot-' + tabId);
    if (!slot || editors[tabId]) return;
    // eslint-disable-next-line no-undef
    const ed = monaco.editor.create(slot, {
      value: code,
      language: lang === 'cpp' ? 'cpp' : 'c',
      theme: 'phoenix',
      fontSize: 13,
      fontFamily: "'JetBrains Mono','Fira Code','Consolas',monospace",
      fontLigatures: true,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      automaticLayout: true,
      lineNumbers: 'on',
      wordWrap: 'off',
      padding: { top: 12, bottom: 12 },
      scrollbar: { verticalScrollbarSize: 5, horizontalScrollbarSize: 5 },
      overviewRulerLanes: 0,
      renderLineHighlight: 'line',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
    });
    ed.onDidChangeModelContent(() => {
      const tab = tabs.find(t => t.id === tabId);
      if (tab) tab.code = ed.getValue();
    });
    editors[tabId] = ed;
  }

  /* ─── Godbolt API ──────────────────────────────────────────────────── */
  async function runCode() {
    const tab = tabs.find(t => t.id === activeTab);
    if (!tab) return;

    const code    = editors[activeTab] ? editors[activeTab].getValue() : tab.code;
    const lang    = tab.lang;
    const stdin   = document.getElementById('ep-stdin').value;
    const compiler = COMPILERS[lang];

    const btn = document.getElementById('ep-run');
    btn.disabled = true;
    btn.innerHTML = '<span class="ep-spin">⟳</span> Compilando…';
    appendLine('out-sep', '─'.repeat(42));

    try {
      const body = {
        source: code,
        options: {
          userArguments: compiler.args,
          executeParameters: { args: '', stdin },
          compilerOptions: { executorRequest: true },
          filters: { execute: true },
          tools: [], libraries: []
        },
        lang: lang === 'cpp' ? 'c++' : 'c',
        allowStoreCodeDebug: false
      };

      const res = await fetch(`${GODBOLT}/${compiler.id}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      /* stderr do compilador (erros de compilação) */
      const compileErrs = (data.stderr || []).map(l => l.text).filter(Boolean);
      if (compileErrs.length) {
        appendLine('out-err', '✖ Erro de compilação:');
        compileErrs.forEach(l => appendLine('out-stderr', l));
      }

      /* resultado da execução */
      const exec = data.execResult || data;
      if (exec) {
        const stdout   = (exec.stdout || []).map(l => l.text).filter(s => s !== undefined);
        const stderr   = (exec.stderr || []).map(l => l.text).filter(s => s !== undefined);
        const exitCode = exec.code;

        if (stdout.length) stdout.forEach(l => appendLine('out-stdout', l || ' '));
        if (stderr.length) stderr.forEach(l => appendLine('out-stderr', l));

        if (exitCode === 0) {
          appendLine('out-ok', '✔ Saiu com código 0');
        } else if (exitCode !== undefined) {
          appendLine('out-err', `✖ Saiu com código ${exitCode}`);
        }
      }

      if (!compileErrs.length && !exec) {
        appendLine('out-info', '(sem saída)');
      }
    } catch (err) {
      appendLine('out-err', '✖ Falha na requisição: ' + err.message);
      appendLine('out-info', 'Verifique sua conexão ou tente novamente.');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '▶ Executar';
      scrollOutput();
    }
  }

  /* ─── Output helpers ───────────────────────────────────────────────── */
  function appendLine(cls, text) {
    const out = document.getElementById('ep-out');
    const span = document.createElement('div');
    span.className = cls;
    span.textContent = text;
    out.appendChild(span);
  }
  function clearOutput() {
    document.getElementById('ep-out').innerHTML =
      '<span class="out-info">// saída limpa</span>';
  }
  function scrollOutput() {
    const out = document.getElementById('ep-out');
    out.scrollTop = out.scrollHeight;
  }

  /* ─── "Usar no editor" buttons ─────────────────────────────────────── */
  function injectUseButtons() {
    document.querySelectorAll('pre').forEach(pre => {
      const code = pre.innerText.trim();
      if (!code) return;

      /* make sure pre is positioned */
      pre.style.position = 'relative';

      const btn = document.createElement('button');
      btn.className = 'ep-use';
      btn.textContent = '▶ Usar no editor';
      btn.title = 'Copiar código para o editor';
      btn.addEventListener('click', () => {
        /* detect language from parent section */
        const badge = document.querySelector('.topbar .lang-badge');
        const langText = badge ? badge.textContent.trim().toLowerCase() : 'c';
        const lang = langText.includes('c++') || langText.includes('cpp') ? 'cpp' : 'c';

        /* open panel if collapsed */
        if (collapsed) togglePanel();

        if (editors[activeTab]) {
          editors[activeTab].setValue(code);
          document.getElementById('ep-lang').value = lang;
          onLangChange();
          /* Flash the tab */
          const t = document.querySelector(`.ep-tab[data-id="${activeTab}"]`);
          if (t) { t.style.background = 'rgba(255,106,0,.25)'; setTimeout(() => (t.style.background = ''), 400); }
        } else {
          /* Monaco not ready: add a new tab with the code */
          addTab(undefined, lang, code);
        }

        btn.textContent = '✔ Copiado!';
        setTimeout(() => (btn.textContent = '▶ Usar no editor'), 1500);
      });
      pre.appendChild(btn);
    });
  }

  /* ─── Utils ────────────────────────────────────────────────────────── */
  function escHtml(str) {
    return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* ─── Boot ─────────────────────────────────────────────────────────── */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
