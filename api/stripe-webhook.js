
const crypto = require("node:crypto");

module.exports = async function handler(req, res) {

  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Metodo non consentito"
    });
  }

  const secret =
    process.env.STRIPE_WEBHOOK_SECRET?.trim();

  if (!secret?.startsWith("whsec_")) {
    return res.status(503).json({
      error: "Webhook non configurato"
    });
  }

  const signature =
    req.headers["stripe-signature"];

  if (typeof signature !== "string") {
    return res.status(400).json({
      error: "Firma Stripe mancante"
    });
  }

  try {

    const chunks = [];
    let size = 0;

    for await (const chunk of req) {

      const buffer = Buffer.from(chunk);
      size += buffer.length;

      if (size > 1024 * 1024) {
        return res.status(413).end();
      }

      chunks.push(buffer);
    }

    const body = Buffer.concat(chunks);

    const parts = signature.split(",");

    const timestamp = parts
      .find(p => p.startsWith("t="))
      ?.slice(2);

    const signatures = parts
      .filter(p => p.startsWith("v1="))
      .map(p => p.slice(3));

    if (
      !timestamp ||
      !/^\d+$/.test(timestamp) ||
      !Number.isSafeInteger(Number(timestamp)) ||
      Math.abs(
        Math.floor(Date.now() / 1000) -
        Number(timestamp)
      ) > 300
    ) {
      return res.status(400).json({
        error: "Timestamp non valido"
      });
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.`)
      .update(body)
      .digest();

    const valid = signatures.some(value => {

      if (!/^[a-f0-9]{64}$/i.test(value)) {
        return false;
      }

      return crypto.timingSafeEqual(
        expected,
        Buffer.from(value, "hex")
      );

    });

    if (!valid) {
      return res.status(400).json({
        error: "Firma Stripe non valida"
      });
    }

    const event = JSON.parse(
      body.toString("utf8")
    );

    if (
      event.object !== "event" ||
      event.livemode !== false ||
      typeof event.id !== "string" ||
      typeof event.type !== "string"
    ) {
      return res.status(400).json({
        error: "Evento non consentito"
      });
    }

    console.info("STAYGO_WEBHOOK_VERIFIED", {
      id: event.id,
      type: event.type,
      livemode: event.livemode
    });

    return res.status(503).json({
      error: "Elaborazione finanziaria non ancora attiva"
    });

  } catch (error) {

    console.error("STAYGO_WEBHOOK_ERROR", {
      name: error.name
    });

    return res.status(500).json({
      error: "Errore webhook"
    });

  }
};

module.exports.config = {
  api: {
    bodyParser: false
  }
};
