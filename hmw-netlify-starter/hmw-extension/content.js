// content.js — HMW (Gmail) — version compacte & robuste
(() => {
  /* ---------- helpers ---------- */
  const $   = (sel, root = document) => root.querySelector(sel);
  const $$  = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on  = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const onIf = (el, ev, fn) => el && el.addEventListener(ev, fn); // bind only if exists
  const $in = (root, sel) => (root ? root.querySelector(sel) : null);
  const log = (...a) => console.debug('[HMW]', ...a);
  const ellipsize = (s, n = 90) => (s || '').trim().replace(/\s+/g, ' ').slice(0, n) + ((s || '').length > n ? '…' : '');

  /* ---------- endpoint ---------- */
  let ENDPOINT = '';
  chrome.storage.sync.get(['endpoint'], (res) => {
    ENDPOINT = (res && res.endpoint) || localStorage.getItem('HMW_WORKER_URL') || '';
    log('endpoint:', ENDPOINT || '(non défini)');
  });

  /* ---------- gmail DOM ---------- */
  const findComposerBox = () =>
    $('div[aria-label="Corps du message"], div[aria-label="Message body"]');

  const getLastMessageText = () => {
    const nodes = $$('div.a3s, div[role="listitem"] .a3s'); // Gmail body containers
    for (let i = nodes.length - 1; i >= 0; i--) {
      const t = (nodes[i].innerText || '').trim();
      if (t.length > 40) return t;
    }
    return '';
  };

  const insertInComposer = (text) => {
    const box = findComposerBox();
    if (!box) return;
    box.focus();
    try {
      document.execCommand('insertText', false, text);
    } catch {
      const r = document.createRange();
      r.selectNodeContents(box);
      r.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand('insertText', false, text);
    }
  };

  /* ---------- floating button + chooser ---------- */
  let fab, chooser;
  function ensureFab() {
    if (fab) return;
    fab = document.createElement('button');
    fab.id = 'hmw-fab';
    fab.setAttribute('aria-label', 'Help me write');
    fab.innerHTML = '✨';
    document.body.appendChild(fab);

    chooser = document.createElement('div');
    chooser.id = 'hmw-chooser';
    chooser.innerHTML = `
      <button class="opt" data-mode="reply">Répondre</button>
      <button class="opt" data-mode="explain">Analyser</button>
    `;
    document.body.appendChild(chooser);

    on(fab, 'click', () => {
      const r = fab.getBoundingClientRect();
      chooser.style.left = Math.max(16, r.left - 8) + 'px';
      chooser.style.top  = (r.top - 88) + 'px';
      chooser.classList.toggle('open');
    });

    // safe delegation (ignore clicks hors .opt)
    chooser.addEventListener('click', async (e) => {
      const opt = e.target.closest ? e.target.closest('.opt') : null;
      if (!opt) return;
      chooser.classList.remove('open');
      openPanel(opt.dataset.mode);
    });
  }

  /* ---------- panel (single field) ---------- */
  let panel;
  function openPanel(mode) {
    const composer = findComposerBox();
    if (!composer) return;

    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'hmw-panel';
      panel.innerHTML = `
        <div class="hmw-head"><em id="hmw-title">Rédaction</em></div>
        <div class="hmw-ctxWrap">
          <div id="hmw-ghost" class="ghost" hidden></div>
          <textarea id="hmw-ctx" placeholder="Contexte… (laisse vide ou écris “répond” pour une réponse automatique)"></textarea>
          <button id="hmw-copy" class="icon" title="Copier le résultat" hidden>📋</button>
        </div>
        <div class="hmw-actions">
          <button id="hmw-propose" class="link">Proposition</button>
          <span class="sep"></span>
          <button id="hmw-quick" class="link">Réponse rapide</button>
          <span class="sep"></span>
          <button id="hmw-insert" class="link">Insérer</button>
          <button id="hmw-close" class="close" title="Fermer">✖</button>
        </div>
      `;
      document.body.appendChild(panel);

      // listeners (tolérants)
      const closeBtn  = $in(panel, '#hmw-close');
      const copyBtn   = $in(panel, '#hmw-copy');
      const quickBtn  = $in(panel, '#hmw-quick');
      const propBtn   = $in(panel, '#hmw-propose');
      const insertBtn = $in(panel, '#hmw-insert');
      const ctxInput  = $in(panel, '#hmw-ctx');
      const ghost     = $in(panel, '#hmw-ghost');
      const titleEl   = $in(panel, '#hmw-title');

      // autoresize
      const autoGrow = () => {
        ctxInput.style.height = '0px';
        ctxInput.style.height = Math.min(180, Math.max(48, ctxInput.scrollHeight)) + 'px';
      };
      onIf(ctxInput, 'input', autoGrow);

      // fermeture
      onIf(closeBtn, 'click', () => (panel.style.display = 'none'));

      // copier (affiché après résultat)
      onIf(copyBtn, 'click', () => {
        const v = ctxInput.value || '';
        navigator.clipboard.writeText(v).catch(() => {});
      });

      // insertion
      onIf(insertBtn, 'click', () => {
        const v = (ctxInput.value || '').trim();
        if (v) insertInComposer(v);
      });

      // proposition (avec contexte)
      onIf(propBtn, 'click', async () => {
        await run(mode === 'explain' ? 'explain' : 'draft', ctxInput, ghost, titleEl);
      });

      // réponse/étude rapide (sans contexte)
      onIf(quickBtn, 'click', async () => {
        await run(mode === 'explain' ? 'explain' : 'reply', ctxInput, ghost, titleEl, true);
      });
    }

    // adapter le titre + libellés
    $in(panel, '#hmw-title').textContent = (mode === 'explain') ? 'Analyse' : 'Rédaction';
    $in(panel, '#hmw-quick').textContent = (mode === 'explain') ? 'Analyse rapide' : 'Réponse rapide';
    $in(panel, '#hmw-propose').textContent = (mode === 'explain') ? 'Étudier' : 'Proposition';

    // placer au-dessus du composer
    const r = composer.getBoundingClientRect();
    const W = Math.min(640, Math.max(460, r.width - 40)); // largeur souhaitée
    panel.style.width = W + 'px';
    panel.style.left  = (r.left + window.scrollX + 20) + 'px';
    panel.style.top   = (r.top + window.scrollY - panel.offsetHeight - 16) + 'px';
    panel.style.display = 'block';

    // focus & autoresize
    const ctx = $in(panel, '#hmw-ctx');
    ctx.focus();
    ctx.select && ctx.select();
  }

  async function run(kind, ctxInput, ghost, titleEl, isQuick = false) {
    try {
      if (!ENDPOINT) {
        ctxInput.value = '⚠️ Configure l’endpoint dans les options.';
        return;
      }

      const lastMail = getLastMessageText();
      const ctxText  = (ctxInput.value || '').trim();
      let payload;

      if (kind === 'explain') {
        payload = {
          mode: 'explain',
          context: ctxText || lastMail
        };
      } else if (kind === 'reply') {
        payload = {
          mode: 'reply',
          autoTone: true,
          context: lastMail,
          tone: 'direct',
          signature: 'Cordialement,\nNOM Prénom'
        };
      } else { // draft
        payload = {
          mode: 'draft',
          context: ctxText,
          tone: 'direct',
          signature: 'Cordialement,\nNOM Prénom'
        };
      }

      // si quick et mode rédaction: on ignore le contexte utilisateur
      if (isQuick && (kind === 'reply')) {
        // déjà sans ctx utilisateur
      }

      // UI état
      const btn = isQuick ? $in(panel, '#hmw-quick') : $in(panel, '#hmw-propose');
      const old = btn.textContent;
      btn.disabled = true; btn.textContent = '…';

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      btn.disabled = false; btn.textContent = old;

      if (!res.ok) {
        const t = await res.text().catch(()=>'');
        ctxInput.value = `❌ Erreur (${res.status}). ${t||''}`;
        return;
      }

      const data = await res.json().catch(()=> ({}));
      const out  = data.text || data.explanation || '';

      // Affiche le résultat dans le même champ.
      const prev = ctxText;
      ctxInput.value = out || '—';
      $in(panel, '#hmw-copy').hidden = !out;

      // Affiche le contexte au-dessus en grisé, une seule ligne
      if (prev) {
        ghost.textContent = ellipsize(prev, 110);
        ghost.hidden = false;
      } else {
        ghost.hidden = true;
      }

      // autoresize après mise à jour
      ctxInput.dispatchEvent(new Event('input'));
    } catch (e) {
      console.error('[HMW] run error', e);
      ctxInput.value = '❌ Erreur réseau ou serveur.';
    }
  }

  /* ---------- observers ---------- */
  function attach() {
    ensureFab();
    // reposition légère de temps en temps
    const obs = new MutationObserver(() => ensureFab());
    obs.observe(document.body, { childList: true, subtree: true });
  }

  try {
    attach();
    log('ready');
  } catch (e) {
    console.error('[HMW] init', e);
  }
})();
