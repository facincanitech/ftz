// Checa o status de uma assinatura pela referencia (nao expoe email nem
// outros dados, so o status) — usado pela pagina de sucesso do site.

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });

  const url = new URL(req.url);
  const ref = url.searchParams.get("ref");
  if (!ref) {
    return new Response(JSON.stringify({ error: "parametro 'ref' obrigatorio" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("mp_reference_id", ref)
    .maybeSingle();

  return new Response(JSON.stringify({ status: data?.status ?? "not_found" }), {
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
