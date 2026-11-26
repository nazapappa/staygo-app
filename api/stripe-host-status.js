
const SUPABASE_URL =
  "https://zjfcnojzstlwzxeldaqn.supabase.co";

const SUPABASE_PUBLIC_KEY =
  "sb_publishable_7PH45XJmmxUiZfobZQS6SA_1rtHRZ72";

module.exports = async function handler(req, res) {

  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Metodo non consentito"
    });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const dbKey = process.env.SUPABASE_SECRET_KEY;

  if (!stripeKey ||
      !stripeKey.startsWith("sk_test_") ||
      !dbKey) {
    return res.status(503).json({
      error: "STAYGO Pay non configurato"
    });
  }

  const authorization = req.headers.authorization;

  if (!authorization ||
      !authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Accedi al tuo account STAYGO"
    });
  }

  try {

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

    const dbHeaders = {
      apikey: dbKey,
      "Content-Type": "application/json"
    };

    if (!dbKey.startsWith("sb_secret_")) {
      dbHeaders.Authorization = `Bearer ${dbKey}`;
    }

    const table =
      `${SUPABASE_URL}/rest/v1/staygo_stripe_accounts`;

    const filter =
      `host_id=eq.${encodeURIComponent(user.id)}&livemode=eq.false`;

    const accountResponse = await fetch(
      `${table}?${filter}&select=stripe_account_id`,
      {
        headers: dbHeaders,
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!accountResponse.ok) {
      throw new Error("DATABASE_READ_ERROR");
    }

    const accounts = await accountResponse.json();

    if (!accounts.length) {
      return res.status(200).json({
        connected: false,
        ready: false,
        mode: "sandbox"
      });
    }

    const accountId = accounts[0].stripe_account_id;

    if (!/^acct_[a-zA-Z0-9]+$/.test(accountId)) {
      throw new Error("INVALID_ACCOUNT");
    }

    const stripeResponse = await fetch(
      `https://api.stripe.com/v1/accounts/${accountId}`,
      {
        headers: {
          Authorization: `Bearer ${stripeKey}`
        },
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!stripeResponse.ok) {
      throw new Error("STRIPE_ACCOUNT_ERROR");
    }

    const account = await stripeResponse.json();

    if (account.id !== accountId ||
        account.object !== "account" ||
        account.controller?.is_controller !== true) {
      throw new Error("ACCOUNT_MISMATCH");
    }

    const status = {
      charges_enabled: account.charges_enabled === true,
      payouts_enabled: account.payouts_enabled === true,
      details_submitted: account.details_submitted === true,
      aggiornato_il: new Date().toISOString()
    };

    const updateResponse = await fetch(
      `${table}?${filter}&stripe_account_id=eq.${encodeURIComponent(accountId)}`,
      {
        method: "PATCH",
        headers: {
          ...dbHeaders,
          Prefer: "return=representation"
        },
        body: JSON.stringify(status),
        signal: AbortSignal.timeout(10000)
      }
    );

    if (!updateResponse.ok) {
      throw new Error("DATABASE_UPDATE_ERROR");
    }

    const updated = await updateResponse.json();

    if (updated.length !== 1) {
      throw new Error("ACCOUNT_UPDATE_MISMATCH");
    }

    const transfersEnabled =
      account.capabilities?.transfers === "active";

    const cardPaymentsEnabled =
      account.capabilities?.card_payments === "active";

    return res.status(200).json({
      connected: true,
      mode: "sandbox",
      charges_enabled: status.charges_enabled,
      payouts_enabled: status.payouts_enabled,
      details_submitted: status.details_submitted,
      transfers_enabled: transfersEnabled,
      card_payments_enabled: cardPaymentsEnabled,
      ready:
        status.charges_enabled &&
        status.payouts_enabled &&
        status.details_submitted &&
        transfersEnabled &&
        cardPaymentsEnabled
    });

  } catch (error) {

    console.error("STAYGO_HOST_STATUS_ERROR", {
      name: error.name
    });

    return res.status(503).json({
      error: "Impossibile verificare lo stato Stripe"
    });

  }

};
