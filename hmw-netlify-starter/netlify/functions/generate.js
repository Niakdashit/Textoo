// netlify/functions/generate.js (CommonJS)
const fetch = (...args) => import('node-fetch').then(({default: f}) => f(...args));

exports.handler = async (event, context) => {
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const {
      context = "",
      tone = "direct",
      signature = "Cordialement,\nJonathan",
      autoTone = false,
      mode = "draft",
      sourceMeta = {}
    } = body;

    const SYSTEM = [
      "Tu es un assistant qui rédige des emails professionnels concis et naturels.",
      "Toujours rendre un texte prêt à copier-coller (pas de balises, pas de commentaires).",
      "N'invente pas d'éléments factuels ni de pièces jointes.",
    ].join("\n");

    let USER;
    if (autoTone && mode === "reply") {
      const subj = sourceMeta.subject || "";
      const from = (sourceMeta.fromEmail || "").toLowerCase();

      USER = [
        "RÉPONDS au message source ci-dessous. Écris depuis mon point de vue (première personne).",
        "Imite EXACTEMENT le ton du message source : langue (FR/EN), niveau de formalité, vouvoiement/tutoiement, chaleur, longueur approximative.",
        "Ne paraphrase pas le message source : fais avancer la conversation (accusé de réception, réponse, question, prochaine étape, remerciement).",
        "Structure : (Objet si pertinent → 'Re: " + subj + "'), message, signature fournie telle quelle.",
        (from.includes("no-reply") || from.includes("noreply"))
          ? "Attention : l'expéditeur semble 'no-reply'. Propose poliment un autre canal si nécessaire."
          : "",
        "<source>\n" + context + "\n</source>",
        "Signature à utiliser :\n" + signature
      ].filter(Boolean).join("\n");
    } else {
      const tones = {
        direct: "Ton direct, clair, concret.",
        poli:   "Ton poli et détaillé, tournures courtoises.",
        ferme:  "Ton ferme, cadré, professionnel et respectueux."
      };
      USER = [
        "Rédige un email avec ce style : " + (tones[tone] || tones.direct),
        "Structure : objet (si utile), message, signature.",
        "Contexte :\n" + context,
        "Signature à utiliser :\n" + signature
      ].join("\n");
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "Missing OPENAI_API_KEY" }) };
    }

    const payload = {
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: USER }
      ],
      temperature: autoTone ? 0.4 : 0.5,
      max_tokens: 600
    };

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!r.ok) {
      const t = await r.text();
      return { statusCode: 500, body: JSON.stringify({ error: "openai_error", details: t }) };
    }

    const data = await r.json();
    const text = (data.choices?.[0]?.message?.content || "").trim();
    return { statusCode: 200, body: JSON.stringify({ text }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "server_error", details: String(err?.message || err) }) };
  }
};
