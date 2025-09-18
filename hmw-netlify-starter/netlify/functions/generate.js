// Netlify Function: /generate  (Node 18+)
// Env var required: OPENAI_API_KEY
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST,OPTIONS"
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: cors, body: "" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 404, headers: cors, body: "Not Found" };
  }

  try {
    const { context = "", tone = "direct", signature = "Cordialement,\nJonathan" } =
      JSON.parse(event.body || "{}");

    const sys = "Tu es un assistant e-mail fiable. Écris un mail complet, prêt à envoyer.";
    const user = `Rôle: Assistant de rédaction d'email.
Contexte (peut être vide):
"""${context}"""
Style: ${tone}
Contraintes:
- Français par défaut (ou langue dominante si non FR)
- 6–12 phrases, ton professionnel, clair.
- Aucune promesse/chiffre non présentes dans le contexte.
- Utilise des placeholders entre [] si une info manque.
- Termine par la signature ci-dessous, sans l'altérer.

Signature:
${signature}`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.5,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user }
        ]
      })
    });

    if (!r.ok) {
      const t = await r.text();
      return { statusCode: 500, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify({ error: "openai_error", details: t }) };
    }
    const data = await r.json();
    const text = data?.choices?.[0]?.message?.content?.trim() || "";

    return { statusCode: 200, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify({ text }) };
  } catch (e) {
    return { statusCode: 500, headers: { ...cors, "Content-Type": "application/json" }, body: JSON.stringify({ error: "server_error", details: String(e) }) };
  }
};
