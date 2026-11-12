export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname !== "/api/save") {
      return new Response("Route introuvable", { status: 404 });
    }

    if (request.method !== "POST") {
      return new Response("Méthode non autorisée", {
        status: 405,
        headers: { Allow: "POST" }
      });
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return new Response("JSON invalide", { status: 400 });
    }

    const fields = ["titre", "information", "commentaire"];

    if (
      body === null ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      fields.some(
        (field) =>
          typeof body[field] !== "string" ||
          body[field].trim().length === 0
      )
    ) {
      return new Response(
        "Les champs titre, information et commentaire sont obligatoires et doivent être des textes non vides.",
        { status: 400 }
      );
    }

    const data = {
      titre: body.titre.trim(),
      information: body.information.trim(),
      commentaire: body.commentaire.trim(),
      date: new Date().toISOString()
    };

    try {
      const filename = `${crypto.randomUUID()}.json`;

      const result = await env.DATA.put(
        filename,
        JSON.stringify(data, null, 2),
        {
          httpMetadata: {
            contentType: "application/json; charset=utf-8"
          }
        }
      );

      if (!result) {
        throw new Error("R2 n'a pas confirmé l'enregistrement.");
      }

      return new Response("Enregistré", {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8"
        }
      });
    } catch (error) {
      console.error("Échec de l'enregistrement dans R2 :", error);

      return new Response("Erreur lors de l'enregistrement", {
        status: 500
      });
    }
  }
};
