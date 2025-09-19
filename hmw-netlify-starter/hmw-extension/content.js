// content.js — version robuste (pas d'alert bloquante)
// - crée la pastille même si le composer n'est pas encore présent
// - reattache si Gmail reconstruit le DOM
// - sélecteurs FR/EN pour le composer
(() => {
  const log = (...a) => console.debug('[HMW]', ...a);

  // Lire l'endpoint depuis les options (stockage sync)
  let ENDPOINT = '';
  chrome.storage.sync.get(['endpoint'], (res) => {
    ENDPOINT = (res && res.endpoint) || '';
    log('endpoint:', ENDPOINT || '(non défini)');
  });

  // ---------- utilitaires DOM ----------
  const $    = (sel, root=document) => root.querySelector(sel);
  const $$   = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const on   = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // Détection du composer (FR/EN) de Gmail
  function findComposerBox() {
    // Gmail “Corps du message” (FR) ou “Message body” (EN)
    return $(
      'div[aria-label="Corps du message"], div[aria-label="Message body"]'
    );
  }

  // Récupérer du texte du dernier mail affiché (pour imiter le ton)
  function getLastMessageText() {
    // Prend la dernière div d'email (Google change parfois les classes, on reste large)
    const blocks = $$('div.a3s, div[role="listitem"] .a3s');
    for (let i = blocks.length - 1; i >= 0; i--) {
      const html = blocks[i].innerText || '';
      if (html && html.trim().length > 40) return html.trim();
    }
    return '';
  }

  // Insérer du texte dans le composer (au caret)
  function insertInComposer(text) {
    const box = findComposerBox();
    if (!box) {
      log('Composer introuvable, impossible d’insérer.');
      return;
    }
    box.focus();
    try {
      document.execCommand('insertText', false, text);
    } catch {
      // fallback
      const rng = document.createRange();
      rng.selectNodeContents(box);
      rng.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(rng);
      document.execCommand('insertText', false, text);
    }
  }

  // ---------- UI ----------
  let bubble, modal, ctxInput, output, tabReply, tabExplain, submitBtn, insertBtn;

  function ensureUI() {
    if (bubble && modal) return true;

    // Pastille
    bubble = document.createElement('button');
    bubble.title = 'Help me write';
    bubble.setAttribute('id', 'hmw-bubble');
    bubble.innerHTML = '✨';
    document.body.appendChild(bubble);

    // Panneau
    modal = document.createElement('div');
    modal.id = 'hmw-modal';
    modal.innerHTML = `
      <div class="hmw-card">
        <div class="hmw-tabs">
          <button class="active" data-tab="reply">Répondre</button>
          <span class="sep">|</span>
          <button data-tab="explain">Analyser</button>
        </div>
        <div class="hmw-area">
          <textarea id="hmw-ctx" placeholder="Contexte…"></textarea>
          <div class="hmw-actions">
            <button id="hmw-propose">Proposition</button>
          </div>
        </div>
        <div class="hmw-result">
          <textarea id="hmw-out" readonly></textarea>
          <div class="hmw-actions">
            <button id="hmw-insert">Insérer</button>
            <button id="hmw-close">Fermer</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Références
    ctxInput  = $('#hmw-ctx', modal);
    output    = $('#hmw-out', modal);
    tabReply  = $('[data-tab="reply"]', modal);
    tabExplain= $('[data-tab="explain"]', modal);
    submitBtn = $('#hmw-propose', modal);
    insertBtn = $('#hmw-insert', modal);

    // Interactions
    on(bubble, 'click', () => {
      modal.classList.add('open');
      ctxInput.focus();
    });

    on($('#hmw-close', modal), 'click', () => {
      modal.classList.remove('open');
    });

    on(tabReply, 'click', () => setTab('reply'));
    on(tabExplain, 'click', () => setTab('explain'));

    on(insertBtn, 'click', () => {
      const txt = output.value.trim();
      if (txt) insertInComposer(txt);
    });

    on(submitBtn, 'click', async () => {
      try {
        // Logique :
        // - Si l’utilisateur clique “Répondre”: construire à partir du dernier mail
        // - Si “Analyser”: expliquer le mail reçu
        // - Si rien (juste “Contexte” + Proposition): rédiger avec ce contexte

        const mode = currentTab; // 'reply' | 'explain'
        let payload;

        if (mode === 'reply' && (ctxInput.value.trim().toLowerCase() === 'répond' || !ctxInput.value.trim())) {
          // Réponse automatique sur le ton du dernier mail
          payload = {
            mode: 'reply',
            autoTone: true,
            context: getLastMessageText(),
            tone: 'direct',
            signature: 'Cordialement,\nJonathan',
            sourceMeta: {
              subject: (document.title || '').replace(/ -.*$/, '')
            }
          };
        } else if (mode === 'explain') {
          payload = {
            mode: 'explain',
            context: getLastMessageText() || ctxInput.value.trim()
          };
        } else {
          // Proposition depuis le contexte saisi
          payload = {
            mode: 'draft',
            context: ctxInput.value.trim(),
            tone: 'direct',
            signature: 'Cordialement,\nJonathan'
          };
        }

        if (!ENDPOINT) {
          console.warn('[HMW] Endpoint manquant. Va dans Options de l’extension pour le renseigner.');
          showResult("⚠️ Configure d’abord l’endpoint dans les options de l’extension.");
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = '…';

        const res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!res.ok) {
          const t = await res.text().catch(()=>'');
          showResult(`❌ Erreur (${res.status}). ${t || ''}`.trim());
          return;
        }
        const data = await res.json().catch(()=> ({}));
        showResult((data && (data.text || data.explanation)) || '—');

      } catch (e) {
        console.error('[HMW] submit error', e);
        showResult('❌ Erreur réseau ou serveur.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Proposition';
      }
    });

    return true;
  }

  function showResult(txt) {
    output.value = txt || '';
    modal.classList.add('open');
    output.scrollTop = 0;
  }

  let currentTab = 'reply';
  function setTab(name) {
    currentTab = name;
    for (const b of $$('.hmw-tabs button', modal)) b.classList.remove('active');
    $(`[data-tab="${name}"]`, modal).classList.add('active');
  }

  // ---------- Observateur pour Gmail ----------
  function attachObservers() {
    // Crée l’UI une fois
    ensureUI();

    // Repositionner la pastille si besoin, et réagir quand un composer apparaît
    const obs = new MutationObserver(() => {
      ensureUI();
      positionBubble();
    });
    obs.observe(document.body, { childList: true, subtree: true });

    // Position au chargement
    positionBubble();
  }

  function positionBubble() {
    // On n’a pas besoin du composer pour afficher la pastille :
    // on fixe en bas à droite de la fenêtre (CSS), rien à recalculer ici.
    // Cette fonction existe pour évoluer si tu veux l’aligner sur le composer actif.
  }

  // Lancement
  try {
    ensureUI();
    attachObservers();
    log('Content script prêt.');
  } catch (e) {
    console.error('[HMW] init error', e);
    // Plus d'alert bloquante.
  }
})();
