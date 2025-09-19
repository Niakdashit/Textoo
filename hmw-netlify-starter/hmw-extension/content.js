// Help Me Write – Gmail content script
(() => {
  const log = (...a) => console.debug('[HMW]', ...a);

  /* ----------- Endpoint depuis chrome.storage ----------- */
  let ENDPOINT = '';
  chrome.storage.sync.get(['endpoint'], (res) => {
    ENDPOINT = (res && res.endpoint) || '';
    log('Endpoint:', ENDPOINT || '(non défini)');
  });

  /* ----------------- Utilitaires DOM -------------------- */
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  function findComposerBox() {
    // FR / EN
    return $('div[aria-label="Corps du message"], div[aria-label="Message body"]');
  }

  function getLastMessageText() {
    const nodes = $$('div.a3s, div[role="listitem"] .a3s');
    for (let i = nodes.length - 1; i >= 0; i--) {
      const t = (nodes[i].innerText || '').trim();
      if (t && t.replace(/\s+/g, ' ').length > 40) return t;
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
      const r = document.createRange();
      r.selectNodeContents(box); r.collapse(false);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      document.execCommand('insertText', false, text);
    }
  }

  function debounce(fn, ms = 120) {
    let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }

  /* ------------------ Interface UI ---------------------- */
  let bubble, chooser, card;
  let mode = null; // 'reply' | 'analyze'
  let ctxInput, output, quickBtn, primaryBtn, insertBtn, closeBtn, titleEl;

  function ensureBubble() {
    if (bubble) return;
    bubble = document.createElement('button');
    bubble.id = 'hmw-bubble';
    bubble.setAttribute('title', 'Help me write');
    bubble.innerHTML = '✨';
    document.body.appendChild(bubble);

    chooser = document.createElement('div');
    chooser.id = 'hmw-chooser';
    chooser.innerHTML = `
      <button data-mode="reply">Répondre</button>
      <button data-mode="analyze">Analyser</button>
    `;
    document.body.appendChild(chooser);

    on(bubble, 'click', () => {
      chooser.style.display = chooser.style.display === 'none' ? 'grid' : 'none';
    });
    on(document, 'click', (e) => {
      if (!chooser.contains(e.target) && e.target !== bubble) {
        chooser.style.display = 'none';
      }
    });

    chooser.querySelectorAll('button').forEach(btn => {
      on(btn, 'click', () => {
        chooser.style.display = 'none';
        openCard(btn.dataset.mode);
      });
    });
  }

  function buildCard() {
    if (card) return;
    card = document.createElement('div');
    card.id = 'hmw-card';
    card.innerHTML = `
      <div class="hmw-header">
        <div class="hmw-title" id="hmw-title">Rédaction</div>
        <button class="hmw-quick" id="hmw-quick">Réponse rapide</button>
      </div>

      <div class="hmw-field">
        <textarea id="hmw-context" rows="2"
          placeholder="Contexte…"></textarea>
        <div class="hmw-actions">
          <button class="hmw-primary" id="hmw-primary" disabled>Proposition</button>
        </div>
      </div>

      <div id="hmw-output" placeholder=""></div>

      <div class="hmw-footer">
        <button class="hmw-link" id="hmw-insert">Insérer</button>
        <button class="hmw-link" id="hmw-close">Fermer</button>
      </div>
    `;
    document.body.appendChild(card);

    // refs
    titleEl   = $('#hmw-title',  card);
    quickBtn  = $('#hmw-quick',  card);
    ctxInput  = $('#hmw-context',card);
    primaryBtn= $('#hmw-primary',card);
    output    = $('#hmw-output', card);
    insertBtn = $('#hmw-insert', card);
    closeBtn  = $('#hmw-close',  card);

    // logic
    on(closeBtn, 'click', () => card.style.display = 'none');
    on(insertBtn, 'click', () => {
      const txt = (output.textContent || '').trim();
      if (txt) insertInComposer(txt);
    });

    // auto height textarea
    const autoGrow = () => {
      ctxInput.style.height = 'auto';
      ctxInput.style.height = Math.min(180, ctxInput.scrollHeight) + 'px';
      setTimeout(positionCard, 0);
    };
    on(ctxInput, 'input', () => {
      primaryBtn.disabled = !ctxInput.value.trim();
      autoGrow();
    });
    autoGrow();

    on(quickBtn, 'click', () => runAction({ quick: true }));
    on(primaryBtn, 'click', () => runAction({ quick: false }));
  }

  function labelize() {
    if (mode === 'reply') {
      titleEl.textContent = 'Rédaction';
      quickBtn.textContent = 'Réponse rapide';
      ctxInput.placeholder = 'Contexte… (laisse vide ou écris “répond” pour répondre automatiquement)';
      primaryBtn.textContent = 'Proposition';
    } else {
      titleEl.textContent = 'Analyse';
      quickBtn.textContent = 'Analyse rapide';
      ctxInput.placeholder = "Contexte… (facultatif, l’email actuel sera analysé)";
      primaryBtn.textContent = 'Étudier';
    }
  }

  function openCard(chosenMode) {
    mode = chosenMode; buildCard(); labelize();
    ctxInput.value = ''; primaryBtn.disabled = true; output.textContent = '';
    placeCardAboveComposer();
    card.style.display = 'block';
    ctxInput.focus();
  }

  /* ------ Positionner la carte au-dessus du composer ------ */
  function placeCardAboveComposer() {
    const box = findComposerBox();
    if (!box) { // fallback: centrer
      const vw = Math.min(860, window.innerWidth - 24);
      card.style.width = vw + 'px';
      card.style.left = ((window.innerWidth - vw) / 2) + 'px';
      card.style.top  = (window.scrollY + 90) + 'px';
      return;
    }
    const r = box.getBoundingClientRect();
    const vw = Math.min(r.width, 860, window.innerWidth - 24);
    card.style.width = vw + 'px';
    card.style.left  = (window.scrollX + r.left + (r.width - vw)/2) + 'px';
    // juste au-dessus du composer avec 10px d’air
    const top = window.scrollY + r.top - card.offsetHeight - 10;
    card.style.top  = Math.max(10 + window.scrollY, top) + 'px';
  }
  const positionCard = debounce(placeCardAboveComposer, 50);
  window.addEventListener('resize', positionCard);
  window.addEventListener('scroll', positionCard, { passive: true });

  /* -------------------- Actions IA ----------------------- */
  async function runAction({ quick }) {
    try {
      if (!ENDPOINT) { output.textContent = '⚠️ Configure l’endpoint dans les options.'; return; }

      const last = getLastMessageText();
      let payload;

      if (mode === 'reply') {
        if (quick || !ctxInput.value.trim() || ctxInput.value.trim().toLowerCase() === 'répond') {
          payload = {
            mode: 'reply',
            autoTone: true,
            context: last,
            tone: 'direct',
            signature: 'Cordialement,\nNOM Prénom',
            sourceMeta: { subject: '' }
          };
        } else {
          payload = {
            mode: 'draft',
            context: ctxInput.value.trim(),
            tone: 'direct',
            signature: 'Cordialement,\nNOM Prénom'
          };
        }
      } else { // analyze
        if (quick || !ctxInput.value.trim()) {
          payload = { mode: 'explain', context: last };
        } else {
          // on demande une explication guidée par le contexte (et non une reformulation)
          payload = { mode: 'explain', context: ctxInput.value.trim() + '\n\n— Texte reçu —\n' + last };
        }
      }

      // état UI
      const oldQuick = quickBtn.textContent;
      const oldPrim  = primaryBtn.textContent;
      if (quick) { quickBtn.textContent = '…'; quickBtn.disabled = true; }
      else       { primaryBtn.textContent = '…'; primaryBtn.disabled = true; }

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const t = await res.text().catch(()=> '');
        output.textContent = `❌ Erreur ${res.status}. ${t}`;
      } else {
        const data = await res.json().catch(()=> ({}));
        const txt = (data.text || data.explanation || '').trim();
        output.textContent = txt || '—';
      }
    } catch (e) {
      console.error(e);
      output.textContent = '❌ Erreur réseau/serveur.';
    } finally {
      quickBtn.disabled = false; primaryBtn.disabled = !ctxInput.value.trim();
      quickBtn.textContent = (mode === 'reply') ? 'Réponse rapide' : 'Analyse rapide';
      primaryBtn.textContent = (mode === 'reply') ? 'Proposition' : 'Étudier';
      positionCard();
    }
  }

  /* --------- Observateurs pour rester présents ---------- */
  function mount() {
    ensureBubble(); buildCard(); // carte cachée tant qu’on ne choisit pas
    // Repositionner si Gmail modifie le DOM
    const obs = new MutationObserver(positionCard);
    obs.observe(document.body, { childList: true, subtree: true });
    log('HMW prêt.');
  }

  try { mount(); } catch (e) { console.error('[HMW] init', e); }
})();
