import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";

/**
 * GET /api/supabase-health
 * Vérifie la connexion Supabase et affiche les variables d'env configurées.
 * Utile pour diagnostiquer les erreurs "fetch failed" en production.
 */
export async function GET() {
  const url = process.env.SUPABASE_URL ?? "";
  const keyPresent = !!process.env.SUPABASE_ANON_KEY;

  // Masque l'URL pour les logs (garde le hostname seulement)
  let hostname = "(non définie)";
  try {
    hostname = url ? new URL(url).hostname : "(vide)";
  } catch {
    hostname = `(invalide: "${url}")`;
  }

  try {
    const supabase = getSupabase();

    // Requête minimale pour tester la connectivité
    const { error } = await supabase
      .from("artisans")
      .select("id")
      .limit(1);

    if (error) {
      return NextResponse.json({
        ok: false,
        stage: "query",
        error: error.message,
        supabaseUrl: hostname,
        keyPresent,
      }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      supabaseUrl: hostname,
      keyPresent,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const cause = (err as Error & { cause?: unknown }).cause;
    const causeMsg = cause instanceof Error ? cause.message : undefined;

    return NextResponse.json({
      ok: false,
      stage: "connection",
      error,
      cause: causeMsg,
      supabaseUrl: hostname,
      keyPresent,
    }, { status: 500 });
  }
}
