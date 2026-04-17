import { createClient } from "https://esm.sh/@supabase/supabase-js@2.81.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { email, password } = await req.json();

  // find user
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) return new Response(JSON.stringify({ error: listErr.message }), { status: 500, headers: corsHeaders });

  const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!user) return new Response(JSON.stringify({ error: "user_not_found" }), { status: 404, headers: corsHeaders });

  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password,
    email_confirm: true,
  });

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });

  return new Response(JSON.stringify({ ok: true, user_id: user.id, email: user.email }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
