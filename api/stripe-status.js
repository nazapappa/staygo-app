
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: "Metodo non consentito"
    });
  }

  const key = process.env.STRIPE_SECRET_KEY;

  if (!key || !key.startsWith("sk_test_")) {
    return res.status(503).json({
      connected: false,
      error: "Sandbox non configurata"
    });
  }

  try {
    const response = await fetch(
      "https://api.stripe.com/v1/balance",
      {
        headers: {
          Authorization: `Bearer ${key}`
        },
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!response.ok) {
      console.error("STRIPE_CONNECTION_ERROR", {
        status: response.status
      });

      return res.status(503).json({
        connected: false,
        error: "Connessione Stripe non riuscita"
      });
    }

    const data = await response.json();

    if (data.livemode !== false) {
      return res.status(503).json({
        connected: false
      });
    }

    return res.status(200).json({
      service: "STAYGO PAY",
      connected: true,
      mode: "sandbox",
      livemode: false
    });

  } catch (error) {
    console.error("STRIPE_ERROR", {
      name: error.name
    });

    return res.status(503).json({
      connected: false,
      error: "Servizio temporaneamente non disponibile"
    });
  }
};
