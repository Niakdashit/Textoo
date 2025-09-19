// Injecte un bouton flottant persistant et charge ton hmw.js à la demande

const NETLIFY_SCRIPT_URL = "https://textooapp.netlify.app/hmw.js";
const LS_KEY = "HMW_WORKER_URL"; // ton endpoint Netlify Function est mémorisé par hmw.js

let globalFab;          // bouton global (en bas à droite)
let modalLoaded = false; // hmw.js déjà chargé ?

// 1) Crée le FAB global, visible dès qu’on est sur une page mail
function ensureGlobalFab() {
  if (globalFab) return;
  globalFab = document.createElement("div");
  globalFab.className = "hmw-fab";
  globalFab.title = "Help me write";
  globalFab.textContent = "✦";
  globalFab.addEventListener("click", openHMW);
  document.documentElement.appendChild(globalFab);
}

// 2) Charge ton hmw.js (une seule fois), puis ouvre le modal
function openHMW() {
  if (modalLoaded) {
    // hmw.js a déjà attaché window.HMW_OPEN si tu le souhaites; sinon, relance le bookmarklet interne :
    if (window.HMW_OPEN) { window.HMW_OPEN(); return; }
  }
  const s = document.createElement("script");
  // cache-busting pour recharger les updates
  s.src = NETLIFY_SCRIPT_URL + "?v=" + Date.now();
  s.onload = () => { modalLoaded = true; };
  s.onerror = () => alert("Impossible de charger l’interface HMW.");
  document.documentElement.appendChild(s);
}

// 3) Ajoute un petit badge par composeur (optionnel + sympa)
function attachMiniBadges() {
  // Gmail : le composeur est un div[aria-label="Message body"] contenu dans un card
  const composeAreas = Array.from(document.querySelectorAll('div[aria-label="Message body"], div[contenteditable="true"]'));
  composeAreas.forEach(area => {
    const host = area.closest('[role="dialog"], .aoI, .nH, .bAs'); // différents wrappers Gmail
    if (!host || host.querySelector(".hmw-mini")) return;
    const mini = document.createElement("div");
    mini.className = "hmw-mini";
    mini.textContent = "✦";
    mini.title = "Help me write";
    mini.addEventListener("click", openHMW);
    host.style.position = host.style.position || "relative";
    host.appendChild(mini);
  });
}

// 4) Observe l’arrivée de nouveaux composeurs
const mo = new MutationObserver(() => {
  ensureGlobalFab();
  attachMiniBadges();
});
mo.observe(document.documentElement, { childList: true, subtree: true });

// Premier passage
ensureGlobalFab();
attachMiniBadges();
