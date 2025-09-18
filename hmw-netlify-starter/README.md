# Help me write — Netlify Starter

Ce repo contient :
- **/generate** : une Netlify Function qui appelle OpenAI et renvoie un texte.
- **/site** : une petite PWA (textarea → Proposer → Copier).
- **/bookmarklet** : l'URL javascript à mettre dans un favori.

## Déploiement (Netlify)
1. Crée un nouveau repo avec ces fichiers.
2. Sur Netlify: *Add new site* → lie ton repo.
3. Dans *Site settings → Environment variables*, ajoute `OPENAI_API_KEY` (ta clé).
4. Déploie. Ton endpoint sera `https://<ton-site>.netlify.app/generate`.
5. Ouvre `https://<ton-site>.netlify.app/site/index.html` pour la PWA.

## Utilisation PWA
- Choisis un style, colle un contexte court (dernier message), clique **Proposer** puis **Copier**.

## Utilisation Bookmarklet
- Crée un favori "Help me write".
- Copie-colle le contenu de `bookmarklet/url.txt` dans le champ URL du favori.
- Au premier clic, il te demandera l'URL du Worker (ta route `/generate`).

## Personnaliser
- Modèle/ton dans `netlify/functions/generate.js` (payload OpenAI).
- Style/UX de la PWA dans `site/index.html`.
