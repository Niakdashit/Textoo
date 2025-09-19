// HMW – mini box (un seul champ) + FAB Choisir Répondre/Analyser
(() => {
  const WIDTH = 520; // largeur exacte voulue (px)

  const $  = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const log = (...a)=>console.debug('[HMW]',...a);

  /* Endpoint depuis storage */
  let ENDPOINT = '';
  chrome.storage.sync.get(['endpoint'], r => { ENDPOINT = r?.endpoint || ''; });

  /* ---------- Pastille + menu ---------- */
  function ensureFAB(){
    if ($('#hmw-fab')) return;
    const fab = document.createElement('button');
    fab.id='hmw-fab'; fab.textContent='✨';
    const menu = document.createElement('div');
    menu.id='hmw-chooser';
    menu.innerHTML = `
      <button data-hmw="reply">Répondre</button>
      <button data-hmw="analyze">Analyser</button>
    `;
    document.body.append(fab, menu);

    on(fab,'click',()=>{
      menu.style.display = (menu.style.display==='block'?'none':'block');
    });
    on(menu,'click',e=>{
      const mode = e.target?.dataset?.hmw;
      if(!mode) return;
      menu.style.display='none';
      showBox(mode);
    });
    on(document,'click',e=>{
      if(e.target!==fab && !menu.contains(e.target)) menu.style.display='none';
    });
  }

  /* ---------- Trouver/composer ---------- */
  function findComposer(){
    return $('div[aria-label="Corps du message"], div[aria-label="Message body"]');
  }
  function lastMessageText(){
    const nodes = $$('div.a3s, div[role="listitem"] .a3s');
    for(let i=nodes.length-1;i>=0;i--){
      const t = nodes[i].innerText?.trim();
      if(t && t.length>40) return t;
    }
    return '';
  }

  /* ---------- Insertion robuste dans Gmail ---------- */
  function insertInComposer(text){
    const comp = findComposer();
    if(!comp) return;

    // Assure un caret en fin si aucune sélection
    const sel = window.getSelection();
    if(!sel || sel.rangeCount===0 || !comp.contains(sel.anchorNode)){
      const r = document.createRange();
      r.selectNodeContents(comp);
      r.collapse(false); // fin
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }
    try{
      // Méthode moderne : insérer un nœud texte à la sélection
      const range = window.getSelection().getRangeAt(0);
      const node  = document.createTextNode(text);
      range.deleteContents();
      range.insertNode(node);
      // replacer le caret après le nœud
      range.setStartAfter(node);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }catch{
      // Fallback
      comp.focus();
      document.execCommand('insertText', false, text);
    }
  }

  /* ---------- Post-traitement texte ---------- */
  function stripSubject(raw){
    // enlève une ligne d'objet éventuelle au début : "Objet : ..." (espaces, NBSP, etc.)
    return raw.replace(/^\s*(objet[\s\u00A0]*:[^\n]*\n+)/i, '');
  }
  function paragraphize(raw){
    // Normaliser retours
    let t = raw.replace(/\r\n/g, '\n');

    // S'il n'y a pas déjà de paragraphes (double sauts), aérer après . ? !
    if (!/\n{2,}/.test(t)) {
      // Insère un double saut après fin de phrase suivie de n'importe quel caractère non retour
      t = t.replace(/([\.!?])\s+(?=[^\n])/g, '$1\n\n');
    }

    // Minimise les triplons
    t = t.replace(/\n{3,}/g, '\n\n');

    // Forcer paragraphe avant signature
    t = t.replace(/\n*(Cordialement,?\s*\nNOM Prénom)/i, '\n\n$1');

    return t.trim();
  }
  function emailFormat(raw){
    let t = (raw||'').trim();
    t = stripSubject(t);
    t = paragraphize(t);
    return t;
  }

  /* ---------- Affichage de la box ---------- */
  function showBox(mode){ // 'reply' | 'analyze'
    $('#hmw-box')?.remove();

    const box = document.createElement('div');
    box.id='hmw-box';
    box.style.width = WIDTH+'px';

    box.innerHTML = `
      <div class="hmw-title">${mode==='reply'?'Rédaction':'Analyse'}</div>

      <div class="hmw-area">
        <div class="hmw-chip" id="hmw-chip"></div>
        <textarea id="hmw-ctx" placeholder="Contexte… (laisse vide ou écris “répond” pour une réponse automatique)"></textarea>
        <div id="hmw-copy" title="Copier">📋</div>
        <div id="hmw-result"></div>
      </div>

      <div id="hmw-actions">
        <button class="hmw-link" id="hmw-propose">Proposition</button>
        <div class="hmw-sep" aria-hidden="true"></div>
        <button class="hmw-link" id="hmw-quick">${mode==='reply'?'Réponse rapide':'Analyse rapide'}</button>
        <div class="hmw-sep" aria-hidden="true"></div>
        <button class="hmw-link" id="hmw-insert">Insérer</button>
      </div>

      <button id="hmw-close" title="Fermer">✖</button>
    `;

    document.body.appendChild(box);
    placeBox(box);

    const reflow = ()=> placeBox(box);
    const mo = new MutationObserver(reflow);
    mo.observe(document.body,{childList:true,subtree:true});
    window.addEventListener('resize', reflow);

    const ctx   = $('#hmw-ctx', box);
    const chip  = $('#hmw-chip', box);
    const out   = $('#hmw-result', box);
    const close = $('#hmw-close', box);
    const copy  = $('#hmw-copy', box);
    const btnProp = $('#hmw-propose', box);
    const btnQuick= $('#hmw-quick', box);
    const btnIns  = $('#hmw-insert', box);

    on(copy,'click',()=> navigator.clipboard.writeText((out.style.display==='block'?out.textContent:ctx.value)||''));
    on(close,'click',()=>{ mo.disconnect(); box.remove(); });

    // PROPOSITION (avec contexte)
    on(btnProp,'click', async ()=>{
      const context = ctx.value.trim();
      const payload = (mode==='reply')
        ? { mode:'draft', context, tone:'direct', signature:'Cordialement,\nNOM Prénom' }
        : { mode:'analyze', context };
      await runCall(payload, {box, ctx, chip, out});
    });

    // RÉPONSE/ANALYSE RAPIDE (sans contexte)
    on(btnQuick,'click', async ()=>{
      const payload = (mode==='reply')
        ? { mode:'reply', autoTone:true, context:lastMessageText(), tone:'direct', signature:'Cordialement,\nNOM Prénom' }
        : { mode:'analyze', context:lastMessageText() };
      await runCall(payload, {box, ctx, chip, out});
    });

    // Insérer dans le composer
    on(btnIns,'click', ()=>{
      const text = (out.style.display==='block' ? out.textContent : ctx.value).trim();
      if(!text) return;
      insertInComposer(text);
    });
  }

  /* ---------- Positionnement précis au-dessus du composer ---------- */
  function placeBox(box){
    const c = findComposer();
    if(!c){ box.style.display='none'; return; }
    box.style.display='block';
    const r = c.getBoundingClientRect();
    const top = window.scrollY + r.top - box.offsetHeight - 10;
    const left= window.scrollX + r.left; // aligné bord gauche du composer
    box.style.top = `${Math.max(10, top)}px`;
    box.style.left= `${left}px`;
  }

  /* ---------- Appel endpoint + rendu dans le même bloc ---------- */
  async function runCall(payload, refs){
    const {box, ctx, chip, out} = refs;
    if(!ENDPOINT){
      out.textContent = '⚠️ Configure l’endpoint dans les options.';
      box.classList.add('has-result');
      return;
    }
    try{
      $$('#hmw-actions .hmw-link', box).forEach(b=>b.disabled=true);

      const res = await fetch(ENDPOINT, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      let text='';
      if(res.ok){
        const data = await res.json().catch(()=> ({}));
        text = data.text || data.explanation || '';
      }else{
        text = `❌ ${res.status} – ${await res.text().catch(()=> '')}`;
      }

      // Mise en forme "mail" (sans Objet + paragraphes)
      text = emailFormat(text);

      // Affichage dans le même bloc
      chip.textContent = ctx.value.trim()
        ? ctx.value.trim()
        : (payload.mode==='reply' ? 'Réponse rapide' : 'Analyse rapide');

      out.textContent = text || '—';
      box.classList.add('has-result');

      requestAnimationFrame(()=> placeBox(box));
    }catch(e){
      console.error('[HMW] run', e);
      out.textContent = '❌ Erreur réseau.';
      box.classList.add('has-result');
    }finally{
      $$('#hmw-actions .hmw-link', box).forEach(b=>b.disabled=false);
    }
  }

  /* ---------- Boot ---------- */
  function boot(){
    ensureFAB();
    const keep = new MutationObserver(()=> ensureFAB());
    keep.observe(document.body,{childList:true,subtree:true});
  }

  try{ boot(); }catch(e){ console.error('[HMW] init', e); }
})();
