import { NextRequest, NextResponse } from "next/server";
import { findExpiredTrialArtisans, updateArtisan } from "@/lib/storage";
import { setVapiAssistantActive } from "@/lib/onboarding";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/check-trials
 * Cron Vercel : "0 0 * * *" (chaque jour à minuit UTC)
 * Protégé par Authorization: Bearer CRON_SECRET
 *
 * Trouve les artisans dont l'essai est expiré (trial_ends_at < now, status = pending, vapi_assistant_id non null)
 * et met en pause leur assistant Vapi + met à jour leur statut.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  let processed = 0;
  let paused = 0;
  let errors = 0;

  try {
    const expired = await findExpiredTrialArtisans();
    processed = expired.length;

    console.log(`[check-trials] ${processed} essai(s) expiré(s) à traiter`);

    for (const artisan of expired) {
      try {
        // Met en pause l'assistant Vapi
        if (artisan.vapiAssistantId) {
          await setVapiAssistantActive(artisan.vapiAssistantId, false);
        }

        // Met à jour le statut
        await updateArtisan(artisan.id, { status: "trial_expired" });

        console.log(`[check-trials] Artisan ${artisan.id} (${artisan.email}) — essai expiré, assistant mis en pause`);
        paused++;
      } catch (err) {
        errors++;
        console.error(`[check-trials] Erreur pour artisan ${artisan.id}:`, err);
        // Continue avec les autres artisans
      }
    }
  } catch (err) {
    console.error("[check-trials] Erreur DB:", err);
    return NextResponse.json({ error: "Erreur lors de la requête DB" }, { status: 500 });
  }

  return NextResponse.json({ processed, paused, errors });
}
