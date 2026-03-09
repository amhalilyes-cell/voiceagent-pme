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
  // 1. Lire le corps brut pour vérification de signature
  const rawBody = await req.text();

  // 2. Vérifier la signature si le secret est configuré
  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (secret) {
    const signature = req.headers.get("x-vapi-secret");
    if (!verifyVapiSignature(rawBody, signature, secret)) {
      return NextResponse.json(
        { error: "Signature invalide" },
        { status: 401 }
      );
    }
  }

  // 3. Parser le JSON
  let event: VapiWebhookEvent;
  try {
    event = JSON.parse(rawBody) as VapiWebhookEvent;
  } catch {
    return NextResponse.json(
      { error: "Corps de requête invalide" },
      { status: 400 }
    );
  }

  // 4. Traiter l'événement
  try {
    const result = await handleVapiEvent(event);

    // Pour les function-calls, Vapi attend une réponse avec le résultat
    if (event.message.type === "function-call" && result) {
      return NextResponse.json(result, { status: 200 });
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    console.error("[Vapi Webhook] Erreur lors du traitement :", err);
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}

// Vapi peut aussi envoyer des GET pour vérifier l'URL
export async function GET() {
  return NextResponse.json(
    { status: "VoiceAgent PME webhook actif" },
    { status: 200 }
  );
}
