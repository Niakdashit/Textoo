<script>
// hmw.js — charge via bookmarklet court. Aucune dépendance.
(function () {
  try {
    var d = document, LS = 'HMW_WORKER_URL';
    var W = localStorage.getItem(LS) || '';

    function setW() {
      var v = prompt('Endpoint (ex: https://textooapp.netlify.app/generate)', W || '');
      if (v) { W = v.trim(); localStorage.setItem(LS, W); }
    }
    if (!W) { setW(); if (!W) return; }

    function q(s, root){ return (root||d).querySelector(s) }
    function qa(s, root){ return Array.from((root||d).querySelectorAll(s)) }

    function getLastGmailMessageText(){
      // Récupère le dernier mail ouvert (texte long) pour imiter le ton
      var nodes = qa('div.a3s');
      for (var i = nodes.length - 1; i >= 0; i--) {
        var t = (nodes[i].innerText || '').trim();
        if (t && t.replace(/\s+/g,' ').length > 40) return t;
      }
      return '';
    }
    function getGmailComposer(){
      return q('div[aria-label="Message body"],div[aria-label="Corps du message"]');
    }
    function insertIntoComposer(text){
      var box = getGmailComposer();
      if (!box){ alert("Composer introuvable — ouvre une réponse ou un nouveau message."); return; }
      box.focus();
      try { document.execCommand('insertText', false, text); }
      catch(_){ box.innerText = (box.innerText||'') + (text||''); }
    }

    // ---- UI (design violet arrondi) ----
    var css = `
#hmwX{position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)}
#hmwX .card{width:min(760px,96vw);background:#fff;border-radius:28px;box-shadow:0 22px 70px rgba(0,0,0,.25);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
#hmwX .tabs{display:flex;gap:14px;align-items:center;background:#f7f2ff;border-radius:24px 24px 0 0;border-bottom:1px solid #efe8ff;padding:12px 18px 10px}
#hmwX .tab{cursor:pointer;color:#6b46ff;font-weight:700;letter-spacing:.2px;border-radius:14px;padding:6px 12px}
#hmwX .tab.active{background:#e8ddff}
#hmwX .sep{color:#bfaaff}
#hmwX .body{padding:16px}
#hmwX textarea.ctx{width:100%;min-height:180px;resize:vertical;background:#fbf8ff;border:1px solid #efe8ff;border-radius:20px;padding:18px 18px 66px;font:16px/1.45 inherit;color:#2b2166;box-shadow:inset 0 1px 0 rgba(255,255,255,.7)}
#hmwX textarea.ctx::placeholder{color:#c7b6ff}
#hmwX .actions{position:relative;height:0}
#hmwX .go{position:absolute;right:16px;bottom:-10px;background:#f5f0ff;color:#6b46ff;border:2px solid #bfaaff;border-radius:999px;padding:10px 18px;font-weight:800;cursor:pointer;box-shadow:0 4px 0 #e9e0ff}
#hmwX .go:disabled{opacity:.6;cursor:not-allowed}
#hmwX .out{margin:16px;border:1px solid #efe8ff;border-radius:20px;padding:16px;background:#fbf8ff}
#hmwX .out.hidden{display:none}
#hmwX .out pre{white-space:pre-wrap;margin:0;color:#3b2ca6;font:16px/1.5 inherit}
#hmwX .bar{display:flex;justify-content:space-between;align-items:center;padding:8px 18px 16px}
#hmwX .btn{border:1px solid #e8e8f9;background:#fff;border-radius:12px;padding:8px 12px;cursor:pointer}
#hmwX .btn.primary{background:#6b46ff;color:#fff;border-color:#6b46ff}
#hmwX .gear{border:none;background:#fff;font-size:18px;cursor:pointer}
`;
    var style = d.createElement('style'); style.textContent = css;

    var root = d.createElement('div'); root.id='hmwX';
    var card = d.createElement('div'); card.className='card';

    var tabs = d.createElement('div'); tabs.className='tabs';
    function mkTab(t){ var s=d.createElement('span'); s.className='tab'; s.textContent=t; return s; }
    var tReply = mkTab('Répondre');
    var sep1 = d.createElement('span'); sep1.className='sep'; sep1.textContent=' | ';
    var tAnalyze = mkTab('Analyser');
    var sep2 = d.createElement('span'); sep2.className='sep'; sep2.textContent=' | ';
    tabs.append(tReply, sep1, tAnalyze, sep2);

    var body = d.createElement('div'); body.className='body';
    var ctx = d.createElement('textarea'); ctx.className='ctx'; ctx.placeholder='Contexte…';
    var actions = d.createElement('div'); actions.className='actions';
    var go = d.createElement('button'); go.className='go'; go.textContent='Proposition';
    actions.append(go);

    var out = d.createElement('div'); out.className='out hidden';
    var pre = d.createElement('pre'); out.append(pre);

    var bar = d.createElement('div'); bar.className='bar';
    var gear = d.createElement('button'); gear.className='gear'; gear.title='Changer endpoint'; gear.textContent='⚙️';
    var right = d.createElement('div');
    var btnInsert = d.createElement('button'); btnInsert.className='btn primary hidden'; btnInsert.textContent='Insérer';
    var btnClose = d.createElement('button'); btnClose.className='btn'; btnClose.textContent='Fermer';
    right.append(btnInsert, d.createTextNode(' '), btnClose);
    bar.append(gear, d.createElement('div'), right);

    card.append(tabs, body, bar);
    body.append(ctx, actions, out);
    root.append(card);
    d.body.append(style, root);

    function close(){ root.remove(); style.remove(); }
    btnClose.onclick = close;
    gear.onclick = setW;

    var active = null;
    function setActive(x){
      active = x;
      [tReply, tAnalyze].forEach(t=>t.classList.remove('active'));
      if (x==='reply') tReply.classList.add('active');
      if (x==='analyze') tAnalyze.classList.add('active');
    }

    function meta(){
      return {
        subject: (q('h2.hP')||{}).innerText || '',
        fromEmail: q('span.gD') && q('span.gD').getAttribute && q('span.gD').getAttribute('email') || ''
      };
    }

    async function callAPI(payload){
      var r = await fetch(W, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error('HTTP '+r.status);
      return r.json();
    }

    async function doReply(){
      go.disabled = true; var old = go.textContent; go.textContent = 'Génération…';
      pre.textContent=''; out.classList.add('hidden'); btnInsert.classList.add('hidden');
      try{
        var content = getLastGmailMessageText();
        if (!content){ alert('Ouvre un mail (ou clique “Répondre”) pour imiter le ton.'); return; }
        var data = await callAPI({ context: content, tone:'direct', signature:'Cordialement,\nJonathan', autoTone:true, mode:'reply', sourceMeta: meta() });
        pre.textContent = (data && data.text) || '';
        out.classList.remove('hidden'); btnInsert.classList.remove('hidden');
      }catch(e){
        pre.textContent = 'Erreur: '+(e.message||e); out.classList.remove('hidden');
      }finally{ go.disabled=false; go.textContent=old; }
    }

    async function doAnalyze(){
      go.disabled = true; var old = go.textContent; go.textContent = 'Analyse…';
      try{
        var content = getLastGmailMessageText();
        if (!content){ alert('Aucun message détecté. Ouvre une conversation.'); return; }
        var data = await callAPI({ context: content, tone:'direct', signature:'Cordialement,\nJonathan', autoTone:false, mode:'analyze', sourceMeta: meta() });
        ctx.value = (data && data.text) || '';
        pre.textContent=''; out.classList.add('hidden'); btnInsert.classList.add('hidden');
      }catch(e){
        pre.textContent = 'Erreur: '+(e.message||e); out.classList.remove('hidden');
      }finally{ go.disabled=false; go.textContent=old; }
    }

    async function doDraftFromContext(){
      var txt = (ctx.value||'').trim();
      if (!txt){ alert('Écris du contexte, ou clique “Répondre / Analyser”.'); return; }
      go.disabled = true; var old = go.textContent; go.textContent = 'Proposition…';
      pre.textContent=''; out.classList.add('hidden'); btnInsert.classList.add('hidden');
      try{
        var data = await callAPI({ context: txt, tone:'direct', signature:'Cordialement,\nJonathan', autoTone:false, mode:'draft', sourceMeta: meta() });
        pre.textContent = (data && data.text) || '';
        out.classList.remove('hidden'); btnInsert.classList.remove('hidden');
      }catch(e){
        pre.textContent = 'Erreur: '+(e.message||e); out.classList.remove('hidden');
      }finally{ go.disabled=false; go.textContent=old; }
    }

    tReply.onclick   = function(){ setActive('reply');   doReply();   };
    tAnalyze.onclick = function(){ setActive('analyze'); doAnalyze(); };
    go.onclick       = function(){
      if (active==='reply')   return doReply();
      if (active==='analyze') return doAnalyze();
      return doDraftFromContext();
    };
    btnInsert.onclick = function(){ insertIntoComposer(pre.textContent); close(); };

  } catch(e) {
    alert('Bookmarklet erreur: ' + (e.message||e));
  }
})();
</script>
