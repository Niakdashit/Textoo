// HMW — content script (pastille + sélecteur + panneau compact)
// respecte le design demandé et la logique des modes.

(() => {
  const log = (...a) => console.debug('[HMW]', ...a);

  // ---- Endpoint depuis Options (chrome.storage.sync) ----
  let ENDPOINT = '';
  chrome.storage.sync.get(['endpoint'], (res) => {
    ENDPOINT = (res && res.endpoint) || '';
    log('endpoint:', ENDPOINT || '(non défini)');
  });
  chrome.storage.onChanged.addListener((chg, area) => {
    if (area === 'sync' && chg.endpoint) {
      ENDPOINT = chg.endpoint.newValue || '';
      log('endpoint updated:', ENDPOINT || '(vide)');
    }
  });

  // ---- utilitaires DOM ----
  const $ = (s, r = document) => r.querySelector(s);
  const qAll = (s, r = document) => Array.from(r.querySelectorAll(s));

  // Composer Gmail (FR/EN)
  function getComposerBox() {
    return $('div[aria-label="Corps du message"], div[aria-label="Message body"]');
  }
  function getComposerToolbar() {
    // barre du bas : on va s’aligner juste au-dessus
    return $('div[aria-label="Corps du message"]').closest('[role="group"]') ||
           $('div[aria-label="Message body"]').closest('[role="group"]') ||
           $('div[aria-label="Corps du message"]').parentElement;
  }

  // dernier mail pour ton/explication
  function getLastMailText() {
    const blocks = qAll('div.a3s, div[role="listitem"] .a3s');
    for (let i = blocks.length - 1; i >= 0; i--) {
      const t = (blocks[i].innerText || '').trim();
      if (t && t.length > 60) return t;
    }
    return '';
  }

  function insertIntoComposer(text) {
    const box = getComposerBox();
    if (!box) return;
    box.focus();
    document.execCommand('insertText', false, text);
  }

  // ---- Pastille + Chooser ----
  let fab, chooser;
  function ensureFab() {
    if (!fab) {
      fab = document.createElement('button');
      fab.id = 'hmw-fab';
      fab.title = 'Help me write';
      fab.innerHTML = '✨';
      fab.addEventListener('click', () => {
        chooser.style.display = chooser.style.display === 'block' ? 'none' : 'block';
      });
      document.body.appendChild(fab);
    }
    if (!chooser) {
      chooser = document.createElement('div');
      chooser.id = 'hmw-chooser';
      chooser.innerHTML = `
        <div class="opt" data-mode="reply">Répondre</div>
        <div class="opt" data-mode="analyze">Analyser</div>
      `;
      chooser.addEventListener('click', (e) => {
        const m = e.target.closest('.opt')?.dataset.mode;
        if (!m) return;
        chooser.style.display = 'none';
        openPanel(m);
      });
      document.body.appendChild(chooser);
    }
  }

  // ---- Panneau (un seul bloc) ----
  let panel, ctx, linkLeft, linkMid, linkRight, closeBtn, copyBtn, currentMode='reply';

  function openPanel(mode='reply') {
    currentMode = mode;
    ensurePanel();

    // titre & libellés
    $('.hmw-title', panel).textContent = (mode === 'reply') ? 'Rédaction' : 'Analyse';
    linkLeft.textContent  = (mode === 'reply') ? 'Proposition'   : 'Étudier';
    linkMid.textContent   = (mode === 'reply') ? 'Réponse rapide' : 'Analyse rapide';

    // placeholder
    ctx.value = '';
    ctx.dataset.filled = '0';
    ctx.placeholder = (mode === 'reply')
      ? 'Contexte… (laisse vide ou écris “répond” pour une réponse automatique)'
      : 'Contexte… (facultatif, l’email actuel sera analysé)';

    // positionner juste au-dessus du composer
    placePanel();
  }

  function ensurePanel() {
    if (panel) { panel.style.display = 'block'; return; }

    panel = document.createElement('div');
    panel.id = 'hmw-panel';
    panel.innerHTML = `
      <div class="hmw-head">
        <div class="hmw-title">Rédaction</div>
        <button class="hmw-copy" title="Copier le résultat" aria-label="Copier">📋</button>
      </div>
      <textarea id="hmw-ctx" placeholder="Contexte…"></textarea>
      <div class="hmw-bar">
        <span class="hmw-link" id="hmw-left">Proposition</span>
        <span class="hmw-sep"></span>
        <span class="hmw-link" id="hmw-mid">Réponse rapide</span>
        <span class="hmw-sep"></span>
        <span class="hmw-link" id="hmw-right">Insérer</span>
        <button class="hmw-close" title="Fermer" aria-label="Fermer">✕</button>
      </div>
    `;
    document.body.appendChild(panel);

    // refs
    ctx       = $('#hmw-ctx', panel);
    linkLeft  = $('#hmw-left', panel);
    linkMid   = $('#hmw-mid', panel);
    linkRight = $('#hmw-right', panel);
    closeBtn  = $('.hmw-close', panel);
    copyBtn   = $('.hmw-copy', panel);

    // actions
    closeBtn.addEventListener('click', () => panel.style.display = 'none');
    copyBtn.addEventListener('click', () => navigator.clipboard.writeText(ctx.value || ''));

    linkRight.addEventListener('click', () => {
      const v = (ctx.value || '').trim();
      if (v) insertIntoComposer(v);
    });

    // gauche = proposition / étudier (avec contexte)
    linkLeft.addEventListener('click', () => runFlow({ quick:false }));

    // milieu = réponse/analyse rapide (sans contexte)
    linkMid.addEventListener('click', () => runFlow({ quick:true }));
  }

  function placePanel() {
    const tb = getComposerToolbar() || getComposerBox();
    if (!tb) { panel.style.display='none'; return; }
    const r = tb.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const left = r.left + window.scrollX + 0;              // aligné côté gauche du composer
    const top  = r.top  + scrollY  - (panel.offsetHeight || 140) - 10; // juste au-dessus

    panel.style.left = `${left}px`;
    panel.style.top  = `${Math.max(10, top)}px`;
    panel.style.display = 'block';
  }

  // ---- Appel backend ----
  async function runFlow({ quick }) {
    try {
      if (!ENDPOINT) {
        ctx.value = '⚠️ Configure l’endpoint dans les options.';
        ctx.dataset.filled = '1';
        return;
      }

      const lastMail = getLastMailText();
      const context  = (ctx.value || '').trim();

      let payload;
      if (currentMode === 'reply') {
        payload = quick
          ? { mode:'reply', autoTone:true, context:lastMail, tone:'direct', signature:'NOM Prénom' }
          : { mode:'draft', context, tone:'direct', signature:'NOM Prénom' };
      } else {
        payload = quick
          ? { mode:'explain', context:lastMail }
          : { mode:'explain', context: context || lastMail };
      }

      // état “chargement”
      const prev = ctx.value;
      ctx.value = '…';
      ctx.dataset.filled = '1';

      const res = await fetch(ENDPOINT, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        ctx.value = `❌ Erreur (${res.status}). ${t||''}`.trim();
        return;
      }

      const data = await res.json().catch(()=> ({}));
      const text = data.text || data.explanation || '';
      // Écrit la réponse **dans la même zone**
      ctx.value = text || '(vide)';
      ctx.dataset.filled = '1';

      // Contexte réduit & grisé sur une ligne (placeholder sert d’indice visuel)
      if (context) {
        const short = context.length > 90 ? context.slice(0, 87) + '…' : context;
        ctx.placeholder = short; // grisé + ellipsis
      }
    } catch (e) {
      console.error(e);
      ctx.value = '❌ Erreur réseau.';
      ctx.dataset.filled = '1';
    }
  }

  // ---- Observers : maintient la pastille et recalcule la position ----
  function boot() {
    ensureFab();
    const obs = new MutationObserver(() => {
      ensureFab();
      if (panel && panel.style.display === 'block') placePanel();
    });
    obs.observe(document.body, { childList:true, subtree:true });
    window.addEventListener('resize', () => panel && placePanel());
    window.addEventListener('scroll', () => panel && placePanel(), { passive:true });
  }

  try { boot(); } catch(e) { console.error('[HMW] init', e); }
})();
