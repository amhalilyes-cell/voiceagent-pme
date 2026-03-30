import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_supabase) return _supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("SUPABASE_URL et SUPABASE_ANON_KEY sont requises");
  }

  // Valide le format de l'URL (doit commencer par https://)
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error(`SUPABASE_URL invalide — valeur reçue: "${url}" (doit être https://xxxx.supabase.co)`);
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error(`SUPABASE_URL doit utiliser HTTPS — reçu: "${parsedUrl.protocol}"`);
  }

  console.log(`[Supabase] Connexion à ${parsedUrl.hostname}`);

  _supabase = createClient(url, key);
  return _supabase;
}

/** Réinitialise le singleton — utile si les variables d'env changent entre les requêtes */
export function resetSupabase(): void {
  _supabase = null;
}
