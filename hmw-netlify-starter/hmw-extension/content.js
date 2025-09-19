// content.js — Gmail HMW (UI mono-champ, propre & épuré)
// - pastille -> choix (Répondre | Analyser)
// - un seul champ : le contexte, puis le résultat remplace l’éditeur
//   (la ligne de contexte reste affichée, grisée, tronquée à 1 ligne)
// - pas d’overlay sombre, panel posé au-dessus du composer
// - correction race de lecture endpoint (await chrome.storage.sync)
// - signature générique "NOM Prénom", pas d'objet dans les drafts générés

(() => {
  const log = (...a) => console.debug('[HMW]', ...a);

  // ------- helpers -------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  function findComposerBox() {
    // FR/EN
    return $('div[aria-label="Corps du message"], div[aria-label="Message body"]');
  }

  function getLastMessageText() {
    // Dernier bloc visible suffisamment long
    const blocks = $$('div.a3s, div[role="listitem"] .a3s');
    for (let i = blocks.length - 1; i >= 0; i--) {
      const txt = (blocks[i].innerText || '').trim();
      if (txt.length > 40) return txt;
    }
    return '';
  }

  function insertInComposer(text) {
    const box = findComposerBox();
    if (!box) return;
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

  // ------- storage (endpoint) -------
  async function loadEndpoint() {
    try {
      const res = await chrome.storage.sync.get({ endpoint: '' });
      const url = (res?.endpoint || '').trim();
      log('endpoint:', url || '(non défini)');
      return url;
    } catch {
      return '';
    }
  }

  // ------- UI state -------
  let bubble, chooser, panel, mode; // mode: 'reply' | 'explain'
  let ctxInput, ctxLine, resultBox, actionQuickBtn, actionCtxBtn, insertBtn, closeBtn, warnRow;

  function makeBubble() {
    if (bubble) return;
    bubble = document.createElement('button');
    bubble.id = 'hmw-bubble';
    bubble.title = 'Help me write';
    bubble.innerHTML = '<span class="hmw-spark">✦</span>';
    document.body.appendChild(bubble);

    on(bubble, 'click', () => {
      toggleChooser(true);
      placeChooser();
    });
  }

  function makeChooser() {
    if (chooser) return;
    chooser = document.createElement('div');
    chooser.id = 'hmw-chooser';
    chooser.innerHTML = `
      <button data-act="reply">Répondre</button>
      <button data-act="explain">Analyser</button>
    `;
    document.body.appendChild(chooser);

    chooser.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      mode = btn.dataset.act;
      toggleChooser(false);
      openPanel(mode);
    });
  }

  function toggleChooser(show) {
    if (!chooser) return;
    chooser.classList.toggle('open', !!show);
  }

  function placeChooser() {
    const box = findComposerBox();
    if (!box) return;
    const r = box.getBoundingClientRect();
    chooser.style.left = Math.round(r.left + (r.width - chooser.offsetWidth) / 2) + 'px';
    chooser.style.top = Math.round(r.top - 56) + 'px';
  }

  function makePanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'hmw-panel';
    panel.innerHTML = `
      <div class="hmw-head">
        <i class="hmw-title"></i>
        <div class="hmw-head-actions">
          <button class="hmw-ghost" id="hmw-quick"></button>
          <button class="hmw-primary" id="hmw-fromctx"></button>
        </div>
      </div>

      <div class="hmw-field">
        <div class="hmw-contextline" id="hmw-ctxline" title=""></div>
        <textarea id="hmw-ctx" rows="2" placeholder=""></textarea>
        <pre id="hmw-result"></pre>
      </div>

      <div class="hmw-warn" id="hmw-warn" hidden>⚠️ Configure l’endpoint dans les options.</div>

      <div class="hmw-foot">
        <button id="hmw-close" class="hmw-ghost">Fermer</button>
        <button id="hmw-insert" class="hmw-primary">Insérer</button>
      </div>
    `;
    document.body.appendChild(panel);

    // refs
    ctxInput   = $('#hmw-ctx', panel);
    ctxLine    = $('#hmw-ctxline', panel);
    resultBox  = $('#hmw-result', panel);
    actionQuickBtn = $('#hmw-quick', panel);
    actionCtxBtn   = $('#hmw-fromctx', panel);
    insertBtn  = $('#hmw-insert', panel);
    closeBtn   = $('#hmw-close', panel);
    warnRow    = $('#hmw-warn', panel);

    // actions
    on(closeBtn, 'click', () => togglePanel(false));
    on(insertBtn, 'click', () => {
      const txt = (resultBox.textContent || '').trim();
      if (txt) insertInComposer(txt);
    });

    // Submit depuis les boutons
    on(actionQuickBtn, 'click', () => submit('quick'));
    on(actionCtxBtn,   'click', () => submit('context'));

    // Petit confort: Ctrl+Enter => depuis le champ contexte
    on(ctxInput, 'keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit('context');
    });
  }

  function openPanel(selectedMode) {
    makePanel();

    // titre, placeholders & libellés selon le mode
    if (selectedMode === 'reply') {
      $('.hmw-title', panel).textContent = 'Rédaction';
      ctxInput.placeholder = 'Contexte… (laisse vide ou écris “répond” pour une réponse automatique)';
      actionQuickBtn.textContent = 'Réponse rapide';
      actionCtxBtn.textContent   = 'Proposition';
    } else {
      $('.hmw-title', panel).textContent = 'Analyse';
      ctxInput.placeholder = 'Contexte… (facultatif, le mail actuel sera analysé)';
      actionQuickBtn.textContent = 'Analyse rapide';
      actionCtxBtn.textContent   = 'Étudier';
    }

    // Réinitialiser l’état mono-champ
    ctxInput.value = '';
    ctxInput.hidden = false;
    resultBox.textContent = '';
    resultBox.hidden = true;
    ctxLine.textContent = '';
    ctxLine.title = '';
    ctxLine.hidden = true;

    togglePanel(true);
    placePanel();
    ctxInput.focus();
  }

  function togglePanel(show) {
    panel.classList.toggle('open', !!show);
  }

  function placePanel() {
    const box = findComposerBox();
    if (!box) return;
    const r = box.getBoundingClientRect();
    // largeur = composer - marges, coller par-dessus
    const pad = 12;
    panel.style.width = Math.max(360, r.width - pad * 2) + 'px';
    panel.style.left  = Math.round(r.left + pad) + 'px';
    panel.style.top   = Math.round(r.top - panel.offsetHeight - 12) + 'px';
  }

  function showWarn(show) {
    warnRow.hidden = !show;
  }

  function showResult(contextText, resultText) {
    // Conserver la trace du contexte, tronquée 1 ligne
    const ctx = (contextText || '').trim();
    if (ctx) {
      ctxLine.textContent = ctx;
      ctxLine.title = ctx;
      ctxLine.hidden = false;
    } else {
      ctxLine.hidden = true;
    }
    // Remplacer l’éditeur par le résultat dans le *même* bloc
    ctxInput.hidden = true;
    resultBox.textContent = (resultText || '').trim() || '—';
    resultBox.hidden = false;

    // Ajuster la position si la hauteur a changé
    placePanel();
  }

  // ------- submit -------
  async function submit(kind) {
    // kind: 'quick' (aucun contexte) | 'context' (utilise ctxInput)
    const ENDPOINT = await loadEndpoint();
    showWarn(!ENDPOINT);
    if (!ENDPOINT) return;

    const last = getLastMessageText();
    const rawCtx = (ctxInput.value || '').trim();
    const useCtx = kind === 'context' ? rawCtx : '';

    /** payload */
    let payload;

    if (mode === 'reply') {
      if (!useCtx || /^répond/.test(useCtx.toLowerCase())) {
        payload = {
          mode: 'reply',
          autoTone: true,
          context: last,
          tone: 'direct',
          signature: 'Cordialement,\nNOM Prénom',
          sourceMeta: { subject: '' } // on n'impose pas d'objet
        };
      } else {
        payload = {
          mode: 'draft',
          context: useCtx,
          tone: 'direct',
          signature: 'Cordialement,\nNOM Prénom'
        };
      }
    } else {
      // analyse
      payload = {
        mode: 'explain',
        context: useCtx || last
      };
    }

    // UI busy
    const previousQuick = actionQuickBtn.textContent;
    const previousCtx   = actionCtxBtn.textContent;
    actionQuickBtn.disabled = true;
    actionCtxBtn.disabled   = true;
    actionQuickBtn.textContent = '…';
    actionCtxBtn.textContent   = '…';

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const t = await res.text().catch(()=>'');
        showResult(rawCtx, `❌ Erreur (${res.status}). ${t || ''}`.trim());
        return;
      }
      const data = await res.json().catch(()=> ({}));
      const text = (data.text || data.explanation || '').trim();
      showResult(rawCtx, text);
    } catch (e) {
      showResult(rawCtx, '❌ Erreur réseau ou serveur.');
      console.error(e);
    } finally {
      actionQuickBtn.disabled = false;
      actionCtxBtn.disabled   = false;
      actionQuickBtn.textContent = previousQuick;
      actionCtxBtn.textContent   = previousCtx;
    }
  }

  // ------- observers & layout -------
  function attachObservers() {
    // (re)placer UI quand Gmail change le DOM
    const obs = new MutationObserver(() => {
      makeBubble();
      makeChooser();
      placeChooser();
      if (panel?.classList.contains('open')) placePanel();
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // recalculs sur resize / scroll
    window.addEventListener('resize', () => {
      placeChooser();
      if (panel?.classList.contains('open')) placePanel();
    }, { passive: true });
    window.addEventListener('scroll', () => {
      placeChooser();
      if (panel?.classList.contains('open')) placePanel();
    }, { passive: true });
  }

  // boot
  try {
    makeBubble();
    makeChooser();
    attachObservers();
    log('ready');
  } catch (e) {
    console.error('[HMW] init', e);
  }
})();
