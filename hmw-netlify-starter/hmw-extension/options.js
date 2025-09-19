(function(){
  const input = document.getElementById('endpoint');
  const msg   = document.getElementById('msg');
  const save  = document.getElementById('save');

  function looksValid(u){ return /^https?:\/\//i.test((u||'').trim()); }

  function setMsg(t){ msg.textContent = t; setTimeout(()=> msg.textContent='', 1600); }

  // load
  try {
    chrome.storage.sync.get(['endpoint'], v => {
      if (v && v.endpoint) input.value = v.endpoint;
      else {
        chrome.storage.local.get(['endpoint'], w => {
          if (w && w.endpoint) input.value = w.endpoint;
          else {
            const ls = localStorage.getItem('HMW_WORKER_URL') || '';
            if (ls) input.value = ls;
          }
        });
      }
    });
  } catch {}

  save.addEventListener('click', () => {
    const val = (input.value || '').trim();
    if (!looksValid(val)) { setMsg('URL invalide'); return; }

    try {
      chrome.storage.sync.set({ endpoint: val }, () => {
        // Backups for old versions:
        try { chrome.storage.local.set({ endpoint: val }); } catch {}
        try { localStorage.setItem('HMW_WORKER_URL', val); } catch {}
        setMsg('Sauvegardé ✓');
      });
    } catch {
      try { localStorage.setItem('HMW_WORKER_URL', val); setMsg('Sauvegardé (local) ✓'); }
      catch { setMsg('Erreur de sauvegarde'); }
    }
  });
})();
