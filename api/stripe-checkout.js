
const SUPABASE_URL =
  "https://zjfcnojzstlwzxeldaqn.supabase.co";

const SUPABASE_PUBLIC_KEY =
  "sb_publishable_7PH45XJmmxUiZfobZQS6SA_1rtHRZ72";

const SITE_URL =
  "https://staygo-app-nine.vercel.app";

module.exports = async function handler(req, res) {

  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Metodo non consentito"
    });
  }

  const stripeKey =
    process.env.STRIPE_SECRET_KEY?.trim();

  const dbKey =
    process.env.SUPABASE_SECRET_KEY?.trim();

  if (
    !stripeKey?.startsWith("sk_test_") ||
    !dbKey
  ) {
    return res.status(503).json({
      error: "STAYGO Pay non configurato"
    });
  }

  const authorization = req.headers.authorization;

  if (
    !authorization ||
    !authorization.startsWith("Bearer ")
  ) {
    return res.status(401).json({
      error: "Accesso richiesto"
    });
  }

  try {

    const prenotazioneId =
      req.body?.prenotazione_id;

    if (
      typeof prenotazioneId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(prenotazioneId)
    ) {
      return res.status(400).json({
        error: "Prenotazione non valida"
      });
    }

    // 1. Verifica identità del viaggiatore

    const authResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: SUPABASE_PUBLIC_KEY,
          Authorization: authorization
        },
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!authResponse.ok) {
      return res.status(401).json({
        error: "Sessione non valida"
      });
    }

    const user = await authResponse.json();

    if (!user.id || !user.email_confirmed_at) {
      return res.status(403).json({
        error: "Account non verificato"
      });
    }

    // 2. Accesso riservato al backend

    const dbHeaders = {
      apikey: dbKey,
      "Content-Type": "application/json"
    };

    if (!dbKey.startsWith("sb_secret_")) {
      dbHeaders.Authorization = `Bearer ${dbKey}`;
    }

    // 3. Preparazione atomica del pagamento

    const prepareResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/staygo_avvia_checkout`,
      {
        method: "POST",
        headers: dbHeaders,
        body: JSON.stringify({
          p_prenotazione_id: prenotazioneId,
          p_viaggiatore_id: user.id
        }),
        signal: AbortSignal.timeout(15000)
      }
    );

    if (!prepareResponse.ok) {
      const error = await prepareResponse.text();

      console.error("STAYGO_CHECKOUT_PREPARE", {
        status: prepareResponse.status,
        detail: error.slice(0, 300)
      });

      return res.status(409).json({
        error: "Prenotazione non pagabile o non disponibile"
      });
    }

    const payment = await prepareResponse.json();

    if (
      !payment.id ||
      !payment.stripe_account_id ||
      !payment.idempotency_key ||
      payment.livemode !== false ||
      payment.stato !== "in_attesa"
    ) {
      throw new Error("INVALID_PAYMENT_RECORD");
    }

    const amount = Number(payment.importo_cent);
    const fee = Number(payment.commissione_cent);

    if (
      !Number.isSafeInteger(amount) ||
      !Number.isSafeInteger(fee) ||
      amount <= 0 ||
      fee < 0 ||
      fee > amount
    ) {
      throw new Error("INVALID_PAYMENT_AMOUNT");
    }

    if (
      !/^acct_[a-zA-Z0-9]+$/.test(
        payment.stripe_account_id
      )
    ) {
      throw new Error("INVALID_HOST_ACCOUNT");
    }

    // 4. Se esiste già una sessione, recuperala

    if (payment.stripe_checkout_session_id) {

      const existingResponse = await fetch(
        `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(payment.stripe_checkout_session_id)}`,
        {
          headers: {
            Authorization: `Bearer ${stripeKey}`
          },
          signal: AbortSignal.timeout(10000)
        }
      );

      if (existingResponse.ok) {
        const existing = await existingResponse.json();

        if (
          existing.status === "open" &&
          existing.url
        ) {
          return res.status(200).json({
            success: true,
            checkout_url: existing.url,
            mode: "sandbox",
            reused: true
          });
        }
      }

      return res.status(409).json({
        error: "La sessione precedente deve essere verificata prima di un nuovo tentativo"
      });
    }

    // 5. Creazione Stripe Checkout

    const expiresAt =
      Math.floor(Date.now() / 1000) + 31 * 60;

    const form = new URLSearchParams();

    form.set("mode", "payment");

    form.set(
      "success_url",
      `${SITE_URL}/?payment=success&session_id={CHECKOUT_SESSION_ID}`
    );

    form.set(
      "cancel_url",
      `${SITE_URL}/?payment=cancelled`
    );

    form.set(
      "client_reference_id",
      prenotazioneId
    );

    form.set(
      "expires_at",
      String(expiresAt)
    );

    form.set(
      "line_items[0][quantity]",
      "1"
    );

    form.set(
      "line_items[0][price_data][currency]",
      "eur"
    );

    form.set(
      "line_items[0][price_data][unit_amount]",
      String(amount)
    );

    form.set(
      "line_items[0][price_data][product_data][name]",
      "Prenotazione STAYGO"
    );

    form.set(
      "line_items[0][price_data][product_data][description]",
      "Pagamento soggiorno STAYGO"
    );

    form.set(
      "payment_intent_data[application_fee_amount]",
      String(fee)
    );

    form.set(
      "payment_intent_data[transfer_data][destination]",
      payment.stripe_account_id
    );

    form.set(
      "payment_intent_data[metadata][staygo_payment_id]",
      payment.id
    );

    form.set(
      "payment_intent_data[metadata][prenotazione_id]",
      prenotazioneId
    );

    form.set(
      "metadata[staygo_payment_id]",
      payment.id
    );

    form.set(
      "metadata[prenotazione_id]",
      prenotazioneId
    );

    if (user.email) {
      form.set("customer_email", user.email);
    }

    const stripeResponse = await fetch(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${stripeKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": payment.idempotency_key
        },
        body: form.toString(),
        signal: AbortSignal.timeout(20000)
      }
    );

    const session = await stripeResponse.json();

    if (!stripeResponse.ok) {

      console.error("STAYGO_STRIPE_CHECKOUT_ERROR", {
        status: stripeResponse.status,
        code: session?.error?.code || null,
        type: session?.error?.type || null
      });

      return res.status(502).json({
        error: "Stripe non ha potuto creare il pagamento"
      });
    }

    if (
      !session.id ||
      !session.url ||
      session.mode !== "payment"
    ) {
      throw new Error("INVALID_STRIPE_SESSION");
    }

    // 6. Salvataggio sessione nel database

    const updateResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/staygo_pagamenti?id=eq.${encodeURIComponent(payment.id)}`,
      {
        method: "PATCH",
        headers: {
          ...dbHeaders,
          Prefer: "return=representation"
        },
        body: JSON.stringify({
          stripe_checkout_session_id: session.id,
          checkout_scadenza_il:
            new Date(expiresAt * 1000).toISOString(),
          aggiornato_il: new Date().toISOString()
        }),
        signal: AbortSignal.timeout(15000)
      }
    );

    if (!updateResponse.ok) {
      console.error("STAYGO_CHECKOUT_DATABASE_UPDATE", {
        status: updateResponse.status,
        sessionCreated: true
      });

      return res.status(503).json({
        error: "Sessione creata: sincronizzazione database da completare"
      });
    }

    const updated = await updateResponse.json();

    if (
      !Array.isArray(updated) ||
      updated.length !== 1
    ) {
      throw new Error("CHECKOUT_DATABASE_MISMATCH");
    }

    // 7. Restituzione link Checkout

    return res.status(200).json({
      success: true,
      checkout_url: session.url,
      mode: "sandbox",
      reused: false
    });

  } catch (error) {

    console.error("STAYGO_CHECKOUT_ERROR", {
      name: error.name,
      code: error.message
    });

    return res.status(503).json({
      error: "Impossibile avviare il pagamento"
    });
  }
};
