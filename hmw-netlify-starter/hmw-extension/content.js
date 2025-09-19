// content.js — HMW v2 (pastille -> menu -> panneau)
// - pas d’overlay ; panneau positionné au-dessus du composer Gmail
// - “Répondre” = autoTone sur dernier mail (sans objet)
// - “Analyser” = explique le mail reçu
// - signature par défaut : "NOM Prénom"

(() => {
  const log = (...a) => console.debug('[HMW]', ...a);

  // ---------- Lecture ENDPOINT ----------
  let ENDPOINT = '';
  function loadEndpoint() {
    try {
      chrome.storage.sync.get(['endpoint'], (res) => {
        ENDPOINT = (res && res.endpoint) || localStorage.getItem('HMW_WORKER_URL') || '';
        log('endpoint:', ENDPOINT || '(non défini)');
      });
    } catch {
      // si chrome.storage n’est pas dispo (peu probable en MV3)
      ENDPOINT = localStorage.getItem('HMW_WORKER_URL') || '';
    }
  }
  loadEndpoint();

  // ---------- Helpers DOM ----------
  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

  function findComposerBox(){
    // FR / EN / parfois aria-missing sur brouillons : on cible le div[role="textbox"]
    return $('div[aria-label="Corps du message"], div[aria-label="Message body"], div[role="textbox"]');
  }
  function composerRect() {
    const box = findComposerBox();
    if (!box) return null;
    const r = box.getBoundingClientRect();
    return { top: Math.max(12, r.top - 260), left: r.left, width: r.width };
  }

  function getLastMessageText(){
    const blocks = $$('div.a3s, div[role="listitem"] .a3s');
    for(let i=blocks.length-1;i>=0;i--){
      const t = (blocks[i].innerText || '').trim();
      if(t.length > 40) return t;
    }
    return '';
  }

  function insertInComposer(text){
    const box = findComposerBox();
    if(!box) return;
    box.focus();
    try{ document.execCommand('insertText', false, text); }
    catch{
      const rng = document.createRange(); rng.selectNodeContents(box); rng.collapse(false);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(rng);
      document.execCommand('insertText', false, text);
    }
  }

  // ---------- UI : pastille + menu ----------
  let bubble, menu, panel, ctx, out, primaryBtn, insertBtn, closeBtn, modeLabel;
  let currentMode = 'reply'; // 'reply' | 'explain'

  function ensureBubble(){
    if(bubble) return;
    bubble = document.createElement('button');
    bubble.id = 'hmw-bubble';
    bubble.title = 'Help me write';
    bubble.textContent = '✨';
    document.body.appendChild(bubble);

    menu = document.createElement('div');
    menu.id = 'hmw-menu';
    menu.innerHTML = `
      <button data-mode="reply">Répondre</button>
      <button data-mode="explain">Analyser</button>
    `;
    document.body.appendChild(menu);

    bubble.addEventListener('click', () => {
      menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
    });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if(!b) return;
      currentMode = b.dataset.mode;
      menu.style.display = 'none';
      openPanel(currentMode);
    });

    // refermer le menu si clic ailleurs
    document.addEventListener('click', (e)=>{
      if(e.target === bubble || menu.contains(e.target)) return;
      menu.style.display = 'none';
    }, true);
  }

  // ---------- UI : panneau ----------
  function ensurePanel(){
    if(panel) return;

    panel = document.createElement('div');
    panel.id = 'hmw-panel';
    panel.innerHTML = `
      <div class="hmw-tabs">Répondre <span class="sep">|</span> Analyser</div>
      <div class="hmw-block">
        <span class="hmw-badge" id="hmw-mode">Réponse rapide</span>
        <textarea id="hmw-ctx" placeholder="Contexte…"></textarea>
        <div class="hmw-actions">
          <button class="hmw-btn hmw-btn--primary" id="hmw-primary">Proposition</button>
        </div>
      </div>
      <div class="hmw-block" style="margin-top:14px">
        <textarea id="hmw-out" readonly></textarea>
        <div class="hmw-actions">
          <button class="hmw-btn" id="hmw-insert">Insérer</button>
          <button class="hmw-btn" id="hmw-close">Fermer</button>
        </div>
      </div>
    `;
    document.body.appendChild(panel);

    ctx        = $('#hmw-ctx', panel);
    out        = $('#hmw-out', panel);
    primaryBtn = $('#hmw-primary', panel);
    insertBtn  = $('#hmw-insert', panel);
    closeBtn   = $('#hmw-close', panel);
    modeLabel  = $('#hmw-mode', panel);

    closeBtn.addEventListener('click', ()=> panel.style.display='none');
    insertBtn.addEventListener('click', ()=> {
      const t = (out.value||'').trim(); if(!t) return;
      insertInComposer(t);
    });

    primaryBtn.addEventListener('click', onPrimaryClick);

    // reposition sur scroll/resize
    const rePos = () => { if(panel.style.display==='none') return; positionPanel(); };
    window.addEventListener('resize', rePos, {passive:true});
    document.addEventListener('scroll', rePos, {passive:true, capture:true});
  }

  function positionPanel(){
    const r = composerRect();
    if(!r){ panel.style.display='none'; return; }
    panel.style.left = `${Math.max(12, r.left)}px`;
    panel.style.top  = `${r.top}px`;
    panel.style.width= `${Math.min(r.width, 820)}px`;
  }

  function openPanel(mode){
    ensurePanel();
    currentMode = mode;
    // header + bouton
    if(mode==='reply'){
      modeLabel.textContent = 'Réponse rapide';
      primaryBtn.textContent = 'Proposition';
      ctx.placeholder = 'Contexte… (laisse vide ou écris “répond” pour répondre automatiquement)';
      ctx.value = '';
    } else {
      modeLabel.textContent = 'Analyse rapide';
      primaryBtn.textContent = 'Étudier';
      ctx.placeholder = 'Contexte… (facultatif, l’email actuel sera analysé)';
      ctx.value = '';
    }
    out.value = '';
    positionPanel();
    panel.style.display = 'block';
    ctx.focus();
  }

  // ---------- Appel API ----------
  async function onPrimaryClick(){
    if(!ENDPOINT){
      out.value = '⚠️ Configure d’abord l’endpoint dans les options.';
      return;
    }

    primaryBtn.disabled = true;

    try{
      let payload;
      if(currentMode === 'explain'){
        payload = {
          mode: 'explain',
          context: getLastMessageText() || (ctx.value||'').trim()
        };
      } else {
        const wantsAuto = !ctx.value.trim() || ctx.value.trim().toLowerCase() === 'répond';
        if(wantsAuto){
          payload = {
            mode: 'reply',
            autoTone: true,
            context: getLastMessageText(),
            tone: 'direct',
            signature: 'NOM Prénom',
            sourceMeta: { subject: '' }
          };
        } else {
          payload = {
            mode: 'draft',
            context: ctx.value.trim(),
            tone: 'direct',
            signature: 'NOM Prénom'
          };
        }
      }

      const res = await fetch(ENDPOINT, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });

      if(!res.ok){
        const t = await res.text().catch(()=> '');
        out.value = `❌ Erreur (${res.status}). ${t}`;
        return;
      }

      const data = await res.json().catch(()=> ({}));
      out.value = (data.text || data.explanation || '').trim() || '—';

    } catch(err){
      console.error(err);
      out.value = '❌ Erreur réseau/serveur.';
    } finally {
      primaryBtn.disabled = false;
    }
  }

  // ---------- Observers ----------
  function attach(){
    ensureBubble();
    ensurePanel();

    // Sur mutations Gmail, on garde la pastille et on replace le panneau
    const obs = new MutationObserver(()=>{
      ensureBubble();
      if(panel && panel.style.display!=='none') positionPanel();
    });
    obs.observe(document.body, { childList:true, subtree:true });
  }

  // boot
  try{
    attach();
    log('Ready');
  }catch(e){
    console.error('[HMW] init error', e);
  }
})();
