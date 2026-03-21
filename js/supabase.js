// === Supabase Client Singleton ===
// Replace URL + Key after creating project at supabase.com
// The anon key is safe to expose in frontend code — RLS protects data.

const SUPABASE_URL = 'REPLACE_WITH_YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'REPLACE_WITH_YOUR_SUPABASE_ANON_KEY';

let client = null;

export function getSupabase() {
  if (!client && window.supabase && isConfigured()) {
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}

export function isConfigured() {
  return SUPABASE_URL !== 'REPLACE_WITH_YOUR_SUPABASE_URL';
}
