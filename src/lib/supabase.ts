import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE; // server-only

export function createAnonClient() {
  if (!supabaseUrl || !anonKey) throw new Error("Supabase envs missing");
  return createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
}

export function createServerClient() {
  if (!supabaseUrl || !serviceRole) throw new Error("Supabase service envs missing");
  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
    global: { headers: { "X-Server-Env": "true" } },
  });
}
