// === HMW Gmail — mini composer helper (boîte compacte) ===
// - 1 seul "champ": saisie de contexte, puis affiche le résultat dans la même boite
// - Contexte récapitulé sur 1 ligne (chip) une fois la réponse affichée
// - Boutons: Proposition | Réponse rapide | Insérer
// - Pas d’overlay, style épuré, largeur fixe contrôlée ici

(() => {
  const BOX_WIDTH = 640; // << largeur exacte souhaitée (px). Tu peux réduire à 560 si besoin.

  const log = (...a) => console.debug('[HMW]', ...a);
  let ENDPOINT = '';
  let MODE = 'reply'; // défini par la pastille/menu ailleurs; par défaut 'reply'

  // --- lecture endpoint (et écoute des mises à jour) ---
  function loadEndpoint(cb){
    chrome.storage.sync.get(['endpoint', 'mode'], (res) => {
      ENDPOINT = (res && res.endpoint) || '';
      if (res && res.mode) MODE = res.mode; // si tu stockes le choix du menu "Répondre/Analyser"
      log('endpoint:', ENDPOINT || '(non défini)', 'mode:', MODE);
      cb && cb();
    });
  }
  chrome.storage.onChanged?.addListener((chg, area) => {
    if (area === 'sync' && chg.endpoint) ENDPOINT = chg.endpoint.newValue || '';
  });

  // --- utilitaires DOM ---
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  function findComposerBox() {
    // Gmail (FR/EN) "Corps du message" / "Message body"
    return $('div[aria-label="Corps du message"], div[aria-label="Message body"]');
  }
  function findComposerContainer() {
    // bloc qui contient le composer (pour ancrer notre box juste au-dessus)
    const box = findComposerBox();
    return box ? box.closest('div[role="textbox"]')?.parentElement?.parentElement : null;
  }
  function lastMessageText() {
    const blocks = $$('div.a3s, div[role="listitem"] .a3s');
    for (let i = blocks.length - 1; i >= 0; i--) {
      const t = (blocks[i].innerText || '').trim();
      if (t.length > 40) return t;
    }
    return '';
  }

  // --- construction UI ---
  let root, chip, ta, result, actions, copyBtn, closeBtn;

  function buildBox() {
    if (root) return root;

    root = document.createElement('div');
    root.id = 'hmw-box';
    root.style.width = BOX_WIDTH + 'px';

    root.innerHTML = `
      <div class="hmw-title" id="hmw-title">Rédaction</div>
      <div class="hmw-area">
        <div class="hmw-chip" id="hmw-chip" title="Contexte (copiable)"></div>
        <textarea id="hmw-ta" placeholder="Contexte… (laisse vide ou écris “répond” pour une réponse automatique)"></textarea>
        <div id="hmw-result"></div>
        <div id="hmw-copy" title="Copier">📋</div>
      </div>

      <div id="hmw-actions">
        <button class="hmw-link" id="hmw-propose">Proposition</button>
        <div class="hmw-sep"></div>
        <button class="hmw-link" id="hmw-quick">Réponse rapide</button>
        <div class="hmw-sep"></div>
        <button class="hmw-link" id="hmw-insert">Insérer</button>
      </div>

      <button id="hmw-close" title="Fermer">✕</button>
    `;
    document.body.appendChild(root);

    // refs
    chip    = $('#hmw-chip', root);
    ta      = $('#hmw-ta', root);
    result  = $('#hmw-result', root);
    actions = $('#hmw-actions', root);
    copyBtn = $('#hmw-copy', root);
    closeBtn= $('#hmw-close', root);

    // interactions
    copyBtn.addEventListener('click', () => {
      const txt = (root.classList.contains('has-result') ? chip.textContent : ta.value) || '';
      if (!txt) return;
      navigator.clipboard?.writeText(txt);
      copyBtn.textContent = '✓';
      setTimeout(() => (copyBtn.textContent = '📋'), 900);
    });

    closeBtn.addEventListener('click', () => {
      root.remove();
      root = null;
    });

    $('#hmw-propose', root).addEventListener('click', () => handleSubmit('draft'));
    $('#hmw-quick',   root).addEventListener('click', () => handleSubmit(MODE === 'explain' ? 'explain' : 'reply', true));
    $('#hmw-insert',  root).addEventListener('click', () => {
      const txt = (result.textContent || '').trim();
      if (!txt) return;
      insertInComposer(txt);
    });

    return root;
  }

  function setTitle() {
    const t = $('#hmw-title', root);
    t.textContent = (MODE === 'explain') ? 'Analyse' : 'Rédaction';
    $('#hmw-quick', root).textContent = (MODE === 'explain') ? 'Analyse rapide' : 'Réponse rapide';
    $('#hmw-ta', root).placeholder = (MODE === 'explain')
      ? 'Contexte… (facultatif, l’email actuel sera analysé)'
      : 'Contexte… (laisse vide ou écris “répond” pour une réponse automatique)';
  }

  // --- positionnement au-dessus du composer ---
  function placeBox() {
    const comp = findComposerBox();
    if (!comp) return;

    const r = comp.getBoundingClientRect();
    const scrollY = window.scrollY || document.documentElement.scrollTop;

    let left = r.left + window.scrollX;          // aligner sur le bord gauche du composer
    // Si la boîte dépasse l'écran à droite, on la ramène
    const maxLeft = document.documentElement.clientWidth - BOX_WIDTH - 16;
    if (left > maxLeft) left = Math.max(16, maxLeft);

    root.style.top  = (r.top + scrollY - 90) + 'px'; // ~90px au-dessus du corps
    root.style.left = left + 'px';
  }

  // --- insertion dans le composer (au caret) ---
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

  // --- appel backend ---
  async function handleSubmit(intent, isQuick=false) {
    if (!ENDPOINT) {
      result.textContent = '⚠️ Configure l’endpoint dans les options.';
      root.classList.add('has-result');
      chip.textContent = ta.value.trim();
      return;
    }

    // Construire payload selon le mode
    const ctx = ta.value.trim();
    const src = lastMessageText();

    let payload = {};
    if (intent === 'reply') {
      // réponse auto (ton du dernier mail). Si pas de texte dernier mail, on bascule sur draft.
      payload = {
        mode: 'reply',
        autoTone: true,
        context: src,
        tone: 'direct',
        signature: 'NOM Prénom',
        sourceMeta: { subject: (document.title || '').replace(/ -.*$/, '') }
      };
      if (!src) payload = { mode: 'draft', context: ctx, tone: 'direct', signature: 'NOM Prénom' };
    } else if (intent === 'explain') {
      payload = { mode: 'explain', context: src || ctx };
    } else {
      // proposition guidée par le contexte saisi
      payload = { mode: 'draft', context: ctx, tone: 'direct', signature: 'NOM Prénom' };
    }

    // UI état
    const prev = ta.value.trim();
    $('#hmw-propose', root).disabled = true;
    $('#hmw-quick',   root).disabled = true;

    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json().catch(() => ({}));
      const txt = (data && (data.text || data.explanation)) || '—';

      // bascule en mode résultat, chip = ancien contexte (éventuel)
      chip.textContent = prev || (MODE==='explain' ? '(analyse du message)' : '');
      result.textContent = txt;
      root.classList.add('has-result');

    } catch (e) {
      result.textContent = '❌ Erreur réseau/serveur.';
      root.classList.add('has-result');
      chip.textContent = prev;
      console.error(e);
    } finally {
      $('#hmw-propose', root).disabled = false;
      $('#hmw-quick',   root).disabled = false;
      placeBox();
    }
  }

  // --- observer pour réattacher/placer la box ---
  function attach() {
    buildBox(); setTitle(); placeBox();

    // Repositionner sur scroll/resize
    window.addEventListener('scroll', placeBox, { passive: true });
    window.addEventListener('resize', placeBox, { passive: true });

    // Reagir aux reconstructions DOM de Gmail
    const obs = new MutationObserver(() => placeBox());
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // --- boot ---
  loadEndpoint(() => {
    attach();
  });
})();
