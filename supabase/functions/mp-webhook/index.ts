// Recebe a notificacao do Mercado Pago (pagamento avulso OU preapproval
// recorrente), confirma o status direto na API deles (nunca confia so no
// corpo da notificacao) e atualiza a assinatura no banco.

import { createClient } from "jsr:@supabase/supabase-js@2";

const MP_ACCESS_TOKEN = Deno.env.get("MP_ACCESS_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ONE_TIME_VALID_DAYS = 30;

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? url.searchParams.get("topic");
    const dataId = url.searchParams.get("data.id") ?? url.searchParams.get("id");

    if (!type || !dataId) {
      return new Response("ignorado (sem type/id)", { status: 200 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (type === "payment") {
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });
      const payment = await res.json();
      const externalReference = payment.external_reference;

      if (payment.status === "approved" && externalReference) {
        const expiresAt = new Date(Date.now() + ONE_TIME_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString();
        await supabase
          .from("subscriptions")
          .update({ status: "active", mp_payment_id: String(payment.id), expires_at: expiresAt, updated_at: new Date().toISOString() })
          .eq("mp_reference_id", externalReference);
      }
    } else if (type === "subscription_preapproval" || type === "preapproval") {
      const res = await fetch(`https://api.mercadopago.com/preapproval/${dataId}`, {
        headers: { Authorization: `Bearer ${MP_ACCESS_TOKEN}` },
      });
      const preapproval = await res.json();
      const externalReference = preapproval.external_reference;
      if (!externalReference) return new Response("ok", { status: 200 });

      if (preapproval.status === "authorized") {
        // recorrente: renova por mais um ciclo a cada notificacao de cobranca autorizada
        const expiresAt = new Date(Date.now() + 35 * 24 * 60 * 60 * 1000).toISOString(); // folga de 5 dias
        await supabase
          .from("subscriptions")
          .update({ status: "active", expires_at: expiresAt, updated_at: new Date().toISOString() })
          .eq("mp_reference_id", externalReference);
      } else if (["cancelled", "paused"].includes(preapproval.status)) {
        await supabase
          .from("subscriptions")
          .update({ status: "cancelled", updated_at: new Date().toISOString() })
          .eq("mp_reference_id", externalReference);
      }
    }

    return new Response("ok", { status: 200 });
  } catch (err) {
    console.error(err);
    // sempre responde 200 pro MP nao ficar reenviando em loop por erro nosso
    return new Response("erro interno, logado", { status: 200 });
  }
});
