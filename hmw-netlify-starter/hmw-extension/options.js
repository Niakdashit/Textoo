// En MV3, pas de JS inline : tout dans ce fichier.
const LS = 'HMW_WORKER_URL';

const $ = (sel) => document.querySelector(sel);
const input = $('#endpoint');
const btn   = $('#save');
const msg   = $('#msg');

function setMsg(text, ok = true) {
  msg.textContent = text;
  msg.style.color = ok ? '#065f46' : '#b91c1c';
  if (text) setTimeout(() => (msg.textContent = ''), 1800);
}

// Charge la valeur existante (chrome.storage > localStorage fallback)
(async () => {
  try {
    const { HMW_WORKER_URL } = await chrome.storage.local.get([LS]);
    const v = HMW_WORKER_URL || localStorage.getItem(LS) || '';
    if (v) input.value = v;
  } catch (e) {
    // très rare, mais au cas où
    const v = localStorage.getItem(LS) || '';
    if (v) input.value = v;
  }
})();

// Sauvegarde
btn.addEventListener('click', async () => {
  const v = input.value.trim();
  if (!v) {
    setMsg("L’URL est vide.", false);
    return;
  }
  try {
    await chrome.storage.local.set({ [LS]: v });
    // fallback pour le bookmarklet éventuel
    localStorage.setItem(LS, v);
    setMsg('Enregistré ✔');
  } catch (e) {
    setMsg('Erreur de sauvegarde', false);
  }
});
