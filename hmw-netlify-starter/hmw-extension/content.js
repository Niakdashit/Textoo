// content.js — HMW Gmail helper + Lint
(() => {
  const log = (...a) => console.debug('[HMW]', ...a);

  // ---------- Config ----------
  const BOX_WIDTH = 540; // largeur fixe de la mini-box
  const STORAGE_KEY = 'endpoint';

  // ---------- Endpoint depuis options ----------
  let ENDPOINT = '';
  chrome.storage.sync.get([STORAGE_KEY], (res) => {
    ENDPOINT = (res && res[STORAGE_KEY]) || '';
    log('endpoint:', ENDPOINT || '(non défini)');
  });

  // ---------- Utils DOM ----------
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  function findComposerBox() {
    // Gmail “Corps du message” (FR) ou “Message body” (EN)
    return $('div[aria-label="Corps du message"], div[aria-label="Message body"]');
  }

  function getLastMessageText() {
    const blocks = $$('div.a3s, div[role="listitem"] .a3s');
    for (let i = blocks.length - 1; i >= 0; i--) {
      const txt = blocks[i].innerText || '';
      if (txt && txt.trim().length > 40) return txt.trim();
    }
    return '';
  }

  function insertInComposer(text) {
    const box = findComposerBox();
    if (!box) { log('Composer introuvable'); return; }
    box.focus();
    try {
      document.execCommand('insertText', false, text);
    } catch {
      const rng = document.createRange();
      rng.selectNodeContents(box);
      rng.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(rng);
      document.execCommand('insertText', false, text);
    }
  }

  // ---------- Styles (UI + soulignage Lint) ----------
  const CSS = `
  :root{
    --hmw-bg:#faf9fc;--hmw-fg:#3f23c2;--hmw-border:#A94BF7;--hmw-muted:#b8aaf2;--hmw-danger:#ff6b6b;
  }
  #hmw-fab{
    position:fixed;right:18px;bottom:18px;z-index:2147483000;
    width:44px;height:44px;border-radius:50%;
    border:none;background:#6c3ef0;color:#fff;box-shadow:0 6px 18px rgba(108,62,240,.35);
    font-size:22px;cursor:pointer;display:flex;align-items:center;justify-content:center;
  }
  #hmw-menu{
    position:fixed;right:18px;bottom:72px;z-index:2147483000;display:none;
    background:#fff;border:1px solid #ede9ff;border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.12);
    padding:6px;min-width:140px;
  }
  #hmw-menu button{
    display:block;width:100%;padding:8px 10px;border:none;background:transparent;
    color:#3f23c2;font-size:14px;cursor:pointer;border-radius:8px;text-align:left;
  }
  #hmw-menu button:hover{background:#f6f3ff}

  /* === Mini box === */
  #hmw-box{
    position:absolute;z-index:2147483000;background:var(--hmw-bg);
    border:1px solid var(--hmw-border);border-radius:4px;box-shadow:0 2px 17px rgba(63,35,194,.12);
    overflow:hidden;backdrop-filter:saturate(1.1);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;
    width:${BOX_WIDTH}px;
  }
  #hmw-box .hmw-title{display:block;font-style:italic;color:var(--hmw-muted);padding:10px 14px 0 14px;font-size:14px;}

  #hmw-box .hmw-area{position:relative;margin:8px 12px 6px 12px;border-radius:8px;background:#FAF9FC;}
  #hmw-box textarea{
    width:100%;height:54px;min-height:42px;max-height:180px;padding:12px 44px 12px 18px;
    border:0;outline:0;resize:vertical;background:transparent;color:#301994;font-size:14px;line-height:1.35;
  }
  #hmw-copy{
    position:absolute;right:10px;top:10px;font-size:16px;color:var(--hmw-fg);opacity:.85;cursor:pointer;user-select:none;
  }
  #hmw-box .hmw-chip{
    display:none;padding:8px 44px 6px 14px;color:#7c74c9;background:#f6f3ff;border-bottom:1px solid var(--hmw-border);
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:13px;
  }
  #hmw-result{display:none;padding:12px 14px;color:#261a86;font-size:14px;line-height:1.35;max-height:220px;overflow:auto;}

  #hmw-actions{
    display:flex;align-items:center;gap:18px;justify-content:center;border-top:1px solid #F3F0FF;padding:10px 12px;background:#FFFFFF;
  }
  #hmw-actions .hmw-link{appearance:none;border:0;background:transparent;color:var(--hmw-fg);font-weight:400;font-size:14px;line-height:1;padding:6px 0;cursor:pointer;}
  #hmw-actions .hmw-sep{width:1px;height:16px;background:#cbbefc;}
  #hmw-close{
    position:absolute;right:8px;bottom:8px;width:22px;height:22px;border-radius:50%;background:var(--hmw-danger);
    color:#fff;font-weight:700;border:0;line-height:22px;text-align:center;font-size:14px;cursor:pointer;
  }
  #hmw-box.has-result .hmw-chip{display:block;}
  #hmw-box.has-result textarea{display:none;}
  #hmw-box.has-result #hmw-result{display:block;}

  /* Lint marks */
  mark.hmw-err,mark.hmw-warn{background:transparent;color:inherit;padding:0;-webkit-text-fill-color:currentColor;}
  mark.hmw-err{text-decoration:underline wavy #ff6b6b 2px;}
  mark.hmw-warn{text-decoration:underline wavy #3f23c2 2px;}
  `;
  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.documentElement.appendChild(styleEl);

  // ---------- FAB + menu ----------
  let fab, menu;
  function ensureFab() {
    if (fab) return;
    fab = document.createElement('button');
    fab.id = 'hmw-fab';
    fab.title = 'Help me write';
    fab.textContent = '✨';
    document.body.appendChild(fab);

    menu = document.createElement('div');
    menu.id = 'hmw-menu';
    menu.innerHTML = `
      <button data-act="reply">Répondre</button>
      <button data-act="analyze">Analyser</button>
    `;
    document.body.appendChild(menu);

    on(fab, 'click', () => {
      menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
    });
    on(document, 'click', (e) => {
      if (!menu.contains(e.target) && e.target !== fab) menu.style.display = 'none';
    });

    on(menu, 'click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      openPanel(b.dataset.act === 'analyze' ? 'analyze' : 'reply');
      menu.style.display = 'none';
    });
  }

  // ---------- Panel ----------
  let panel, titleEl, ctxArea, ctxInput, ctxCopy, chip, resultEl, actions, btnProposal, btnQuick, btnInsert, btnClose, btnLint;
  let currentMode = 'reply'; // 'reply' | 'analyze'

  function buildPanel() {
    if (panel) return;

    panel = document.createElement('div');
    panel.id = 'hmw-box';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="hmw-title"></div>
      <div class="hmw-area">
        <div class="hmw-chip" id="hmw-chip"></div>
        <textarea id="hmw-ctx" placeholder="Contexte… (laisse vide ou écris “répond” pour une réponse automatique)"></textarea>
        <span id="hmw-copy" title="Copier">📋</span>
        <div id="hmw-result"></div>
      </div>
      <div id="hmw-actions">
        <button class="hmw-link" id="hmw-lint">🔎 Lint</button>
        <span class="hmw-sep"></span>
        <button class="hmw-link" id="hmw-propose">Proposition</button>
        <span class="hmw-sep"></span>
        <button class="hmw-link" id="hmw-quick">Réponse rapide</button>
        <span class="hmw-sep"></span>
        <button class="hmw-link" id="hmw-insert">Insérer</button>
      </div>
      <button id="hmw-close" title="Fermer">✖</button>
    `;
    document.body.appendChild(panel);

    titleEl   = $('.hmw-title', panel);
    ctxArea   = $('.hmw-area', panel);
    ctxInput  = $('#hmw-ctx', panel);
    ctxCopy   = $('#hmw-copy', panel);
    chip      = $('#hmw-chip', panel);
    resultEl  = $('#hmw-result', panel);
    actions   = $('#hmw-actions', panel);
    btnProposal = $('#hmw-propose', panel);
    btnQuick    = $('#hmw-quick', panel);
    btnInsert   = $('#hmw-insert', panel);
    btnClose    = $('#hmw-close', panel);
    btnLint     = $('#hmw-lint', panel);

    on(ctxCopy, 'click', () => {
      const t = panel.classList.contains('has-result') ? resultEl.innerText : ctxInput.value;
      navigator.clipboard.writeText(t || '');
    });
    on(btnClose, 'click', () => panel.style.display = 'none');

    on(btnProposal, 'click', () => handleSubmit('draft'));
    on(btnQuick, 'click', () => handleSubmit('quick'));
    on(btnInsert, 'click', () => {
      const txt = panel.classList.contains('has-result') ? resultEl.innerText.trim() : ctxInput.value.trim();
      if (txt) insertInComposer(txt + '\n');
    });
    on(btnLint, 'click', async () => {
      const composer = findComposerBox();
      if (composer) await runLint(composer);
    });
  }

  function openPanel(mode) {
    currentMode = mode; // 'reply' | 'analyze'
    buildPanel();
    titleEl.textContent = (mode === 'analyze') ? 'Analyse rapide' : 'Rédaction';
    ctxInput.placeholder = (mode === 'analyze')
      ? "Contexte… (facultatif, l'email actuel sera analysé)"
      : "Contexte… (laisse vide ou écris “répond” pour une réponse automatique)";

    // reset view
    panel.classList.remove('has-result');
    ctxInput.value = '';
    chip.textContent = '';
    resultEl.textContent = '';

    // placer au-dessus du composer
    positionPanel();
    panel.style.display = 'block';
    ctxInput.focus();
  }

  function positionPanel() {
    const comp = findComposerBox();
    if (!comp) { // fallback centré si pas de composer
      panel.style.position = 'fixed';
      panel.style.left = `calc(50% - ${BOX_WIDTH/2}px)`;
      panel.style.top  = '20%';
      return;
    }
    const r = comp.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const top = r.top + scrollY - 140; // 140px au-dessus environ
    panel.style.left = `${Math.max(18, r.left + window.scrollX)}px`;
    panel.style.top  = `${Math.max(18, top)}px`;
  }

  // ---------- Backend call ----------
  async function handleSubmit(kind) {
    if (!ENDPOINT) {
      showResult("⚠️ Configure l’endpoint dans les options.");
      return;
    }
    let payload = {};
    if (currentMode === 'analyze') {
      payload = {
        mode: 'explain',
        context: getLastMessageText() || ctxInput.value.trim()
      };
    } else {
      // reply / draft
      const ctx = ctxInput.value.trim();
      if (kind === 'quick' && (!ctx || /^répond/i.test(ctx))) {
        payload = {
          mode: 'reply',
          autoTone: true,
          context: getLastMessageText(),
          tone: 'direct',
          signature: 'Cordialement,\nNOM Prénom'
        };
      } else {
        payload = {
          mode: 'draft',
          context: ctx,
          tone: 'direct',
          signature: 'Cordialement,\nNOM Prénom'
        };
      }
    }

    // UI waiting
    btnProposal.disabled = btnQuick.disabled = true;
    const prevProp = btnProposal.textContent, prevQuick = btnQuick.textContent;
    btnProposal.textContent = '…';
    btnQuick.textContent = '…';

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(()=> ({}));
      const raw = (data && (data.text || data.explanation || '')) || '';
      const formatted = formatMail(raw);
      showResult(formatted, ctxInput.value.trim());
    } catch (e) {
      console.error(e);
      showResult('❌ Erreur réseau ou serveur.');
    } finally {
      btnProposal.disabled = btnQuick.disabled = false;
      btnProposal.textContent = prevProp;
      btnQuick.textContent = prevQuick;
    }
  }

  function showResult(text, ctx) {
    if (ctx && ctx.length) {
      chip.textContent = ctx;
    } else {
      chip.textContent = currentMode === 'analyze' ? 'Analyse du message affiché' : 'Réponse automatique';
    }
    resultEl.textContent = text || '—';
    panel.classList.add('has-result');
    resultEl.scrollTop = 0;
  }

  // Mise en forme “mail” : pas d’Objet, sauts de ligne propres
  function formatMail(s) {
    if (!s) return s;
    // supprime lignes Objet:
    s = s.replace(/^\s*objet\s*:.*$/gmi, '').trim();

    // normalise fins de lignes
    s = s.replace(/\r\n/g, '\n');

    // force un format Bonjour\n\ncorps\n\nCordialement,\nNOM Prénom
    // Si ça commence par "Bonjour" ou "Bonsoir", on garantit un saut après.
    s = s.replace(/^(Bonjour|Bonsoir)[^\n]*\n?*/i, (m) => m.trim() + '\n\n');

    // signature : s’il y a “Cordialement” sans saut avant, on insère 2 \n
    s = s.replace(/([^\n])\n?(Cordialement[^\n]*)$/i, (m, a, b) => a + '\n\n' + b);

    // S’assure que la signature est bien “Cordialement,\nNOM Prénom”
    s = s.replace(/Cordialement[,]?\s*\n.*$/i, 'Cordialement,\nNOM Prénom');

    return s.trim();
  }

  // ---------- Lint (surlignage) ----------
  function extractTextAndMap(rootEl) {
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
    const nodes = [];
    let text = '', pos = 0, n;
    while ((n = walker.nextNode())) {
      const t = n.nodeValue || '';
      if (!t) continue;
      nodes.push({ node:n, start:pos, end:pos + t.length });
      text += t;
      pos += t.length;
    }
    return { text, nodes };
  }
  function clearHighlights(rootEl) {
    rootEl.querySelectorAll('mark.hmw-err, mark.hmw-warn').forEach(m => {
      const parent = m.parentNode;
      while (m.firstChild) parent.insertBefore(m.firstChild, m);
      parent.removeChild(m);
      parent.normalize();
    });
  }
  function applyHighlights(rootEl, issues, nodes) {
    const sorted = [...issues].sort((a,b)=>b.start - a.start);
    for (const it of sorted) {
      const cls = it.severity === 'warning' ? 'hmw-warn' : 'hmw-err';
      wrapRange(nodes, it.start, it.end, cls, it.message || '');
    }
  }
  function wrapRange(nodes, start, end, cls, title) {
    if (end <= start) return;
    let i = nodes.findIndex(n => start >= n.start && start < n.end);
    if (i === -1) return;
    let remaining = end - start;
    let offset = start - nodes[i].start;
    while (i < nodes.length && remaining > 0) {
      const nfo = nodes[i];
      const take = Math.min(remaining, nfo.end - (nfo.start + offset));
      const textNode = nfo.node;
      const range = document.createRange();
      range.setStart(textNode, offset);
      range.setEnd(textNode, offset + take);
      const mark = document.createElement('mark');
      mark.className = cls;
      if (title) mark.title = title;
      range.surroundContents(mark);
      remaining -= take;
      i += 1;
      offset = 0;
    }
  }
  async function runLint(composerEl) {
    try {
      clearHighlights(composerEl);
      const { text, nodes } = extractTextAndMap(composerEl);
      if (!text.trim()) return;
      if (!ENDPOINT) { console.warn('[HMW] Endpoint manquant pour lint'); return; }

      const res = await fetch(ENDPOINT, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ mode:'lint', text })
      });
      if (!res.ok) return;
      const data = await res.json().catch(()=> ({}));
      const issues = Array.isArray(data.issues) ? data.issues : [];
      applyHighlights(composerEl, issues, nodes);
    } catch (e) {
      console.error('[HMW] runLint failed', e);
    }
  }

  // ---------- Boot ----------
  function init() {
    ensureFab();
    buildPanel();
    const obs = new MutationObserver(() => {
      ensureFab();
      if (panel && panel.style.display === 'block') positionPanel();
    });
    obs.observe(document.body, { childList:true, subtree:true });
    log('ready');
  }

  try { init(); } catch(e){ console.error('[HMW] init error', e); }
})();
