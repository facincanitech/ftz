// Cria uma cobranca no Mercado Pago (avulsa ou recorrente) e devolve a
// URL de checkout pra redirecionar o cliente. Chamado pelo site (GitHub
// Pages) via fetch — CORS liberado abaixo pro dominio do GitHub Pages.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Ajuste o preco/nome conforme o plano real do bot.
const PLAN = {
  amount: 50, // BRL
  title: "FTZ Bot — assinatura mensal",
};

const WEBHOOK_URL = "https://xfzfttpnkxqevjfwijpw.supabase.co/functions/v1/mp-webhook";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  try {
    const { email, planType } = await req.json();
    if (!email || !["recurring", "one_time"].includes(planType)) {
      return new Response(JSON.stringify({ error: "email e planType ('recurring' | 'one_time') sao obrigatorios" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const externalReference = crypto.randomUUID();

    let checkoutUrl;

    if (planType === "one_time") {
      const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ title: PLAN.title, quantity: 1, unit_price: PLAN.amount, currency_id: "BRL" }],
          payer: { email },
          external_reference: externalReference,
          back_urls: {
            success: "https://facincanitech.github.io/ftz/sucesso.html",
            failure: "https://facincanitech.github.io/ftz/",
          },
          auto_return: "approved",
          notification_url: WEBHOOK_URL,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`MP preference falhou: ${JSON.stringify(data)}`);
      checkoutUrl = data.init_point;
    } else {
      const res = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: PLAN.title,
          external_reference: externalReference,
          payer_email: email,
          back_url: "https://facincanitech.github.io/ftz/sucesso.html",
          notification_url: WEBHOOK_URL,
          auto_recurring: {
            frequency: 1,
            frequency_type: "months",
            transaction_amount: PLAN.amount,
            currency_id: "BRL",
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(`MP preapproval falhou: ${JSON.stringify(data)}`);
      checkoutUrl = data.init_point;
    }

    await supabase.from("subscriptions").insert({
      email,
      plan_type: planType,
      mp_reference_id: externalReference,
      status: "pending",
    });

    return new Response(JSON.stringify({ checkoutUrl }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
