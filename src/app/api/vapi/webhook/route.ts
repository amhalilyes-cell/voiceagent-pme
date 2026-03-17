import { NextRequest, NextResponse } from "next/server";
import { verifyVapiSignature, handleVapiEvent } from "@/lib/vapi";
import type { VapiWebhookEvent } from "@/types/vapi";

/**
 * POST /api/vapi/webhook
 *
 * Point d'entrée pour tous les événements Vapi (call-started, call-ended,
 * end-of-call-report, function-call, transcript…).
 *
 * Configurer dans le dashboard Vapi :
 *   Server URL → https://votre-domaine.com/api/vapi/webhook
 */
export async function POST(req: NextRequest) {
  // 1. Lire le corps brut
  const rawBody = await req.text();

  console.log("[Vapi Webhook] Requête reçue");
  console.log("[Vapi Webhook] Headers:", Object.fromEntries(req.headers.entries()));
  console.log("[Vapi Webhook] Body brut:", rawBody);

  // 2. Vérifier la signature si le secret est configuré
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (secret) {
    const signature = req.headers.get("x-vapi-secret");
    if (!verifyVapiSignature(rawBody, signature, secret)) {
      console.warn("[Vapi Webhook] Signature invalide — rejetée");
      return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
    }
  }

  // 3. Parser le JSON — on accepte même un corps vide ou malformé
  let parsed: Record<string, unknown> = {};
  if (rawBody.trim()) {
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      console.warn("[Vapi Webhook] Corps non-JSON reçu, traitement ignoré:", rawBody);
      return NextResponse.json({ received: true }, { status: 200 });
    }
  }

  console.log("[Vapi Webhook] Événement parsé:", JSON.stringify(parsed, null, 2));

  // 4. Si le format est incomplet ou inattendu, on loggue et on acquitte sans planter
  const eventType = (parsed as { message?: { type?: string } }).message?.type;
  if (!eventType) {
    console.warn("[Vapi Webhook] Champ message.type manquant — acquittement sans traitement");
    return NextResponse.json({ received: true }, { status: 200 });
  }

  console.log("[Vapi Webhook] Type d'événement:", eventType);

  // 5. Traiter l'événement
  try {
    const event = parsed as unknown as VapiWebhookEvent;
    const result = await handleVapiEvent(event);

    // Pour les function-calls, Vapi attend une réponse avec le résultat
    if (eventType === "function-call" && result) {
      console.log("[Vapi Webhook] Réponse function-call:", result);
      return NextResponse.json(result, { status: 200 });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error("[Vapi Webhook] Erreur lors du traitement :", err);
    // On acquitte quand même pour éviter les retrys Vapi
    return NextResponse.json({ received: true, warning: "Erreur interne" }, { status: 200 });
  }
}

// Vapi peut aussi envoyer des GET pour vérifier l'URL
export async function GET() {
  return NextResponse.json({ status: "VoiceAgent PME webhook actif" }, { status: 200 });
}
