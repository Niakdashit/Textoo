// content.js — compact UI, robust endpoint read (sync/local/localStorage), no overlay.

(() => {
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const log = (...a) => console.debug('[HMW]', ...a);

  // ---------- Endpoint handling ----------
  let ENDPOINT = '';

  async function readFromSync() {
    return new Promise(res => {
      try { chrome.storage.sync.get(['endpoint'], v => res((v && (v.endpoint||'')).trim())); }
      catch { res(''); }
    });
  }
  async function readFromLocal() {
    return new Promise(res => {
      try { chrome.storage.local.get(['endpoint'], v => res((v && (v.endpoint||'')).trim())); }
      catch { res(''); }
    });
  }
  function readFromLocalStorage() {
    try { return (localStorage.getItem('HMW_WORKER_URL') || '').trim(); }
    catch { return ''; }
  }

  function looksValid(u) {
    return /^https?:\/\//i.test(u);
  }

  async function getEndpoint() {
    if (looksValid(ENDPOINT)) return ENDPOINT;

    const c1 = await readFromSync();
    if (looksValid(c1)) return (ENDPOINT = c1);

    const c2 = await readFromLocal();
    if (looksValid(c2)) return (ENDPOINT = c2);

    const c3 = readFromLocalStorage();
    if (looksValid(c3)) return (ENDPOINT = c3);

    return '';
  }

  // Live update if options change
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if ((area === 'sync' || area === 'local') && changes.endpoint) {
        const v = (changes.endpoint.newValue || '').trim();
        if (looksValid(v)) ENDPOINT = v;
      }
    });
  } catch {} // not fatal in non-Chrome contexts

  // ---------- Gmail helpers ----------
  function findComposerBox() {
    return $('div[aria-label="Corps du message"], div[aria-label="Message body"]');
  }
  function getLastMessageText() {
    const blocks = $$('div.a3s, div[role="listitem"] .a3s');
    for (let i = blocks.length - 1; i >= 0; i--) {
      const t = (blocks[i].innerText || '').trim();
      if (t.length > 40) return t;
    }
    return '';
  }
  function insertInComposer(text) {
    const box = findComposerBox();
    if (!box || !text) return;
    box.focus();
    try { document.execCommand('insertText', false, text); }
    catch {
      const r = document.createRange();
      r.selectNodeContents(box); r.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.execCommand('insertText', false, text);
    }
  }
  function placeCardAboveComposer(el) {
    const box = findComposerBox();
    if (!box) { el.style.position='fixed'; el.style.top='84px'; el.style.left='50%'; el.style.transform='translateX(-50%)'; return; }
    const r = box.getBoundingClientRect();
    el.style.position='fixed';
    el.style.left = `${Math.max(20, r.left)}px`;
    el.style.top  = `${Math.max(60, r.top - 150)}px`;
    el.style.transform='none';
  }

  // ---------- FAB + chooser ----------
  let fab, chooser, card, mode = null; // 'reply' | 'explain'

  function ensureFab() {
    if (fab) return;
    fab = document.createElement('button');
    fab.id = 'hmw-fab';
    fab.title = 'Help me write';
    fab.textContent = '✨';
    document.body.appendChild(fab);

    chooser = document.createElement('div');
    chooser.id = 'hmw-chooser';
    chooser.innerHTML = `
      <button data-mode="reply">Répondre</button>
      <button data-mode="explain">Analyser</button>
    `;
    document.body.appendChild(chooser);

    on(fab,'click',()=> chooser.classList.toggle('open'));
    on(chooser,'click',e=>{
      const b = e.target.closest('button'); if (!b) return;
      mode = b.dataset.mode; chooser.classList.remove('open');
      openCard(mode);
    });
  }

  // ---------- Card ----------
  function openCard(which) {
    if (card) card.remove();
    card = document.createElement('div');
    card.className = 'hmw-card';
    card.innerHTML = `
      <div class="hmw-head">
        <div class="hmw-title">${which === 'reply' ? 'Rédaction' : 'Analyse'}</div>
      </div>

      <div class="hmw-row">
        <textarea id="hmw-input" class="hmw-input"
          placeholder="${which==='reply'
            ? 'Contexte… (laisse vide ou écris “répond” pour une réponse automatique)'
            : 'Contexte… (facultatif, l’email affiché sera analysé)'}"></textarea>

        <div class="hmw-actions-top">
          ${which==='reply'
            ? `<button id="hmw-quick"   class="hmw-btn ghost">Réponse rapide</button>
               <button id="hmw-propose" class="hmw-btn" disabled>Proposition</button>`
            : `<button id="hmw-quick"   class="hmw-btn ghost">Analyse rapide</button>
               <button id="hmw-propose" class="hmw-btn" disabled>Étudier</button>`}
        </div>
      </div>

      <div id="hmw-out" class="hmw-output" aria-live="polite"></div>
      <div id="hmw-warn" class="hmw-warning" style="display:none;">⚠️ Configure l’endpoint dans les options.</div>

      <div class="hmw-bottom">
        <button id="hmw-close" class="hmw-secondary">Fermer</button>
        <button id="hmw-insert" class="hmw-primary">Insérer</button>
      </div>
    `;
    document.body.appendChild(card);
    placeCardAboveComposer(card);

    const input   = $('#hmw-input', card);
    const out     = $('#hmw-out', card);
    const quick   = $('#hmw-quick', card);
    const propose = $('#hmw-propose', card);
    const btnIns  = $('#hmw-insert', card);
    const btnCls  = $('#hmw-close', card);
    const warn    = $('#hmw-warn', card);

    // auto-resize (compact)
    const autoresize = () => {
      input.style.height = 'auto';
      input.style.height = Math.min(200, input.scrollHeight) + 'px';
    };
    on(input,'input',()=>{ autoresize(); propose.disabled = !input.value.trim(); });
    setTimeout(autoresize, 0);

    on(btnCls,'click',()=> card.remove());
    on(btnIns,'click',()=> insertInComposer(out.textContent.trim()));

    // actions
    on(quick,'click',()=> handleAction({kind:'quick'}));
    on(propose,'click',()=> handleAction({kind:'propose', ctx: input.value.trim()}));

    // reposition when Gmail reflows
    const obs = new MutationObserver(()=> placeCardAboveComposer(card));
    obs.observe(document.body,{childList:true,subtree:true});

    async function handleAction({kind, ctx=''}) {
      const ep = await getEndpoint();
      if (!looksValid(ep)) { warn.style.display = 'block'; return; }
      warn.style.display = 'none';

      const base = { tone: 'direct', signature: 'NOM Prénom' };
      let payload;

      if (which === 'reply') {
        if (kind === 'quick' || ctx.toLowerCase() === 'répond' || ctx === '') {
          payload = {
            ...base,
            mode: 'reply',
            autoTone: true,
            context: getLastMessageText(),
            sourceMeta: { subject: '', fromEmail: '' }
          };
        } else {
          payload = { ...base, mode: 'draft', context: ctx };
        }
      } else {
        const emailText = getLastMessageText();
        if (kind === 'quick' || !ctx) {
          payload = { mode: 'explain', context: emailText };
        } else {
          payload = { mode: 'explain', context: `${emailText}\n\nContexte:\n${ctx}` };
        }
      }

      try {
        quick.disabled = true; propose.disabled = true;
        const res  = await fetch(ep, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const data = await res.json().catch(()=> ({}));
        out.textContent = (data && (data.text || data.explanation)) || '—';
      } catch {
        out.textContent = '❌ Erreur réseau.';
      } finally {
        quick.disabled = false; propose.disabled = !input.value.trim();
      }
    }
  }

  // ---------- Boot ----------
  function boot() {
    ensureFab();
    const obs = new MutationObserver(()=> ensureFab());
    obs.observe(document.body,{childList:true,subtree:true});
    log('ready');
  }
  try { boot(); } catch(e){ console.error('[HMW]', e); }
})();
