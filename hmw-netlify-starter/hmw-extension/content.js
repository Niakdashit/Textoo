// content.js — HMW (Gmail) : pastille -> menu -> panneau au-dessus du composer
(() => {
  const log = (...a) => console.debug('[HMW]', ...a);

  // --- Lecture endpoint (options) + fallback LS pour tests ---
  let ENDPOINT = '';
  chrome.storage?.sync?.get?.(['endpoint'], (res) => {
    ENDPOINT = (res && res.endpoint) || localStorage.getItem('HMW_WORKER_URL') || '';
    log('endpoint:', ENDPOINT || '(non défini)');
  });

  // -------- utils DOM --------
  const $  = (s, r=document) => r.querySelector(s);
  const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

  // Composer Gmail (FR/EN)
  function findComposerBox() {
    return $('div[aria-label="Corps du message"], div[aria-label="Message body"]');
  }

  // Dernier message affiché (pour ton/réponse ou analyse)
  function getLastMessageText() {
    const blocks = $$('div.a3s, div[role="listitem"] .a3s');
    for (let i = blocks.length - 1; i >= 0; i--) {
      const t = (blocks[i].innerText || '').trim();
      if (t.length > 40) return t;
    }
    return '';
  }

  // Insertion dans le composer
  function insertInComposer(text) {
    const box = findComposerBox();
    if (!box) return;
    box.focus();
    try { document.execCommand('insertText', false, text); }
    catch {
      const rng = document.createRange(); rng.selectNodeContents(box); rng.collapse(false);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rng);
      document.execCommand('insertText', false, text);
    }
  }

  // Post-traitement : retirer une éventuelle ligne “Objet:” ou “Re: …” en tête
  function stripSubjectHeader(text) {
    if (!text) return text;
    const lines = text.split(/\r?\n/);
    while (lines.length && /^(objet\s*:|re\s*:)/i.test(lines[0].trim())) lines.shift();
    return lines.join('\n').trim();
  }

  // ---------- UI elements ----------
  let bubble, menu, panel, ctxInput, outArea, btnPrimary, btnInsert, tabReply, tabExplain;
  let currentMode = 'reply'; // 'reply' | 'explain'

  function ensureBubble() {
    if (bubble) return;
    bubble = document.createElement('button');
    bubble.id = 'hmw-bubble';
    bubble.title = 'Help me write';
    bubble.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M11.5 3l1.4 3.7L16.5 8l-3.6 1.3L11.5 13l-1.4-3.7L6.5 8l3.6-1.3L11.5 3zM19 13l.9 2.4 2.1.7-2.1.8L19 19l-.9-2.1-2.1-.8 2.1-.7L19 13zM5 14l1.2 3 3 1.2-3 1.1L5 22l-1.2-2.7-3-1.1 3-1.2L5 14z"/>
    </svg>`;
    document.body.appendChild(bubble);

    // menu
    menu = document.createElement('div');
    menu.id = 'hmw-menu';
    menu.innerHTML = `
      <button data-mode="reply">✍️ Répondre</button>
      <button data-mode="explain">🔎 Analyser</button>
    `;
    document.body.appendChild(menu);

    bubble.addEventListener('click', (e) => {
      const r = bubble.getBoundingClientRect();
      menu.style.left = (r.left - 6) + 'px';
      menu.style.top  = (r.top - 100) + 'px';
      menu.style.display = 'block';
      e.stopPropagation();
    });
    document.addEventListener('click', () => { menu.style.display = 'none'; });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      currentMode = b.dataset.mode;
      openPanel();
      menu.style.display = 'none';
    });
  }

  function ensurePanel() {
    if (panel) return;
    panel = document.createElement('div');
    panel.id = 'hmw-panel';
    panel.innerHTML = `
      <div class="hmw-card">
        <div class="hmw-tabs">
          <button data-tab="reply" class="active">Répondre</button>
          <span class="sep">|</span>
          <button data-tab="explain">Analyser</button>
        </div>

        <div class="hmw-badge-wrap"><div id="hmw-badge" class="hmw-badge">Réponse rapide</div></div>

        <div class="hmw-area">
          <textarea id="hmw-ctx" placeholder="Contexte…"></textarea>
          <div class="hmw-actions">
            <button id="hmw-propose" class="primary">Proposition</button>
          </div>
        </div>

        <div class="hmw-result">
          <textarea id="hmw-out" readonly></textarea>
          <div class="hmw-actions">
            <button id="hmw-insert" class="primary">Insérer</button>
            <button id="hmw-close" class="ghost">Fermer</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    // refs
    tabReply   = panel.querySelector('[data-tab="reply"]');
    tabExplain = panel.querySelector('[data-tab="explain"]');
    ctxInput   = panel.querySelector('#hmw-ctx');
    outArea    = panel.querySelector('#hmw-out');
    btnPrimary = panel.querySelector('#hmw-propose');
    btnInsert  = panel.querySelector('#hmw-insert');

    // interactions
    panel.querySelector('#hmw-close').addEventListener('click', () => panel.style.display='none');
    tabReply.addEventListener('click', ()=>setMode('reply'));
    tabExplain.addEventListener('click',()=>setMode('explain'));
    btnInsert.addEventListener('click', () => {
      const t = outArea.value.trim(); if (t) insertInComposer(t);
    });

    btnPrimary.addEventListener('click', onPrimary);
  }

  function setMode(mode){
    currentMode = mode;
    tabReply.classList.toggle('active', mode==='reply');
    tabExplain.classList.toggle('active', mode==='explain');

    // Badge + libellé bouton
    const badge = panel.querySelector('#hmw-badge');
    if (mode==='reply'){
      badge.textContent = 'Réponse rapide';
      btnPrimary.textContent = 'Proposition';
      ctxInput.placeholder = 'Contexte… (laissez vide ou écrivez “répond”)';
    }else{
      badge.textContent = 'Analyse rapide';
      btnPrimary.textContent = 'Étudier';
      ctxInput.placeholder = 'Contexte… (optionnel, l’e-mail affiché sera analysé)';
    }
  }

  async function onPrimary(){
    if (!ENDPOINT){
      showResult('⚠️ Configure d’abord l’endpoint dans les options de l’extension.');
      return;
    }

    // Build payload
    let payload;
    if (currentMode === 'explain'){
      payload = { mode:'explain', context: getLastMessageText() || ctxInput.value.trim() };
    } else {
      const auto = !ctxInput.value.trim() || ctxInput.value.trim().toLowerCase()==='répond';
      payload = auto ? {
        mode:'reply',
        autoTone:true,
        context:getLastMessageText(),
        tone:'direct',
        signature:'Cordialement,\nNOM Prénom',
        sourceMeta:{ /* ne fournit pas de subject pour éviter un “Objet” */ }
      } : {
        mode:'draft',
        context:ctxInput.value.trim(),
        tone:'direct',
        signature:'Cordialement,\nNOM Prénom'
      };
    }

    // Call worker
    try{
      btnPrimary.disabled=true; const keep = btnPrimary.textContent;
      btnPrimary.textContent = '…';

      const res = await fetch(ENDPOINT,{
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });

      if (!res.ok){
        const t = await res.text().catch(()=> '');
        showResult(`❌ Erreur (${res.status}). ${t||''}`.trim());
        btnPrimary.textContent = keep; btnPrimary.disabled=false; return;
      }
      const data = await res.json().catch(()=> ({}));
      let text = (data && (data.text || data.explanation)) || '—';

      // Retire “Objet:” si présent
      text = stripSubjectHeader(text);

      showResult(text);
      btnPrimary.textContent = keep;
    }catch(e){
      console.error(e);
      showResult('❌ Erreur réseau ou serveur.');
    }finally{
      btnPrimary.disabled=false;
    }
  }

  function showResult(txt){
    outArea.value = txt || '';
    outArea.scrollTop = 0;
  }

  // Ouvre le panneau & le positionne juste au-dessus du composer
  function openPanel(){
    ensurePanel();
    setMode(currentMode);

    const comp = findComposerBox();
    const card = panel.querySelector('.hmw-card');

    // Position par défaut : ancré au composer si dispo, sinon centré
    if (comp){
      const r = comp.getBoundingClientRect();
      panel.style.width = Math.min(r.width, window.innerWidth-40)+'px';
      panel.style.left  = Math.max(20, r.left) + 'px';

      // on le met 12px au-dessus du composer (sans voile)
      // si pas assez de place, on le met juste en dessous
      requ
