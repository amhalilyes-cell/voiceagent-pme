import { NextRequest, NextResponse } from "next/server";

const VAPI_BASE_URL = "https://api.vapi.ai";

/**
 * GET /api/vapi/calls
 * Liste les appels récents via l'API Vapi.
 * Query params :
 *   - limit  (défaut : 20)
 *   - createdAtGt  (filtre ISO date)
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "VAPI_API_KEY non configurée" },
      { status: 500 }
    );
  }

  const { searchParams } = req.nextUrl;
  const limit = searchParams.get("limit") ?? "20";
  const createdAtGt = searchParams.get("createdAtGt");

  const params = new URLSearchParams({ limit });
  if (createdAtGt) params.set("createdAtGt", createdAtGt);

  try {
    const res = await fetch(`${VAPI_BASE_URL}/call?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      const error = await res.text();
      return NextResponse.json(
        { error: "Erreur API Vapi", details: error },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    console.error("[Vapi Calls] Erreur :", err);
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/vapi/calls
 * Déclenche un appel sortant via Vapi (outbound call).
 * Body JSON attendu :
 *   {
 *     phoneNumber: string,   // numéro à appeler (format E.164)
 *     assistantId?: string,  // override de l'assistant par défaut
 *   }
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "VAPI_API_KEY non configurée" },
      { status: 500 }
    );
  }

  let body: { phoneNumber: string; assistantId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête invalide" },
      { status: 400 }
    );
  }

  if (!body.phoneNumber) {
    return NextResponse.json(
      { error: "phoneNumber est requis" },
      { status: 422 }
    );
  }

  const assistantId =
    body.assistantId ?? process.env.VAPI_DEFAULT_ASSISTANT_ID;

  try {
    const res = await fetch(`${VAPI_BASE_URL}/call/phone`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
        assistantId,
        customer: { number: body.phoneNumber },
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      return NextResponse.json(
        { error: "Erreur API Vapi", details: error },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("[Vapi Calls] Erreur appel sortant :", err);
    return NextResponse.json(
      { error: "Erreur interne du serveur" },
      { status: 500 }
    );
  }
}
