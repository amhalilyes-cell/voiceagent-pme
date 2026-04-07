import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VAPI_BASE_URL = "https://api.vapi.ai";

/** Retourne la salutation adaptée à l'heure de Paris. */
function getSalutation(heureParis: string): string {
  const [h] = heureParis.split(":").map(Number);
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonne soirée";
}

/** Construit la ligne IMPORTANT avec la date/heure Paris actuelles (+5 min de marge). */
function buildImportantLine(): { line: string; salutation: string } {
  // +5 minutes pour éviter de proposer des créneaux qui débutent maintenant
  const now = new Date(Date.now() + 5 * 60 * 1000);
  const dateParis = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  const heureParis = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const salutation = getSalutation(heureParis);
  const line =
    `IMPORTANT : Nous sommes le ${dateParis} et il est ${heureParis} heure de Paris. ` +
    `Tu DOIS utiliser cette date et cette heure. Ne propose jamais un créneau avant ${heureParis}. ` +
    `Salutation du moment : ${salutation}. Utilise "${salutation}" quand tu accueilles le client ET quand tu termines l'appel.`;
  return { line, salutation };
}

/**
 * POST /api/update-prompt
 * Body : { assistantId: string }
 *
 * Récupère l'assistant Vapi, remplace la ligne IMPORTANT dans le prompt système
 * par la date/heure Paris actuelles, puis PATCH l'assistant.
 * Appelé automatiquement depuis /api/vapi/webhook à chaque call-started.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "VAPI_API_KEY manquante" }, { status: 500 });
  }

  let assistantId: string | undefined;
  try {
    const body = await req.json();
    assistantId = body?.assistantId;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide" }, { status: 400 });
  }

  if (!assistantId) {
    return NextResponse.json({ error: "assistantId requis" }, { status: 400 });
  }

  // 1. Récupère l'assistant actuel
  const getRes = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!getRes.ok) {
    const err = await getRes.text();
    console.error(`[update-prompt] GET assistant échoué: ${err}`);
    return NextResponse.json({ error: "Assistant introuvable" }, { status: 404 });
  }
  const assistant = await getRes.json();

  // 2. Trouve le message système
  const messages: { role: string; content: string }[] = assistant?.model?.messages ?? [];
  const sysIdx = messages.findIndex((m) => m.role === "system");
  if (sysIdx === -1) {
    return NextResponse.json({ error: "Prompt système introuvable" }, { status: 422 });
  }

  // 3. Remplace la ligne IMPORTANT (ou la préfixe si absente)
  const oldContent: string = messages[sysIdx].content;
  const { line: newLine, salutation } = buildImportantLine();
  const withoutOld = oldContent.replace(/^IMPORTANT\s*:.*(?:\r?\n){1,2}/i, "");
  const newContent = `${newLine}\n\n${withoutOld.trimStart()}`;

  const updatedMessages = messages.map((m, i) =>
    i === sysIdx ? { ...m, content: newContent } : m
  );

  // 4. PATCH l'assistant avec prompt + endCallPhrases
  const patchRes = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: { ...assistant.model, messages: updatedMessages },
      endCallPhrases: [],
      silenceTimeoutSeconds: 30,
      maxDurationSeconds: 600,
    }),
  });

  if (!patchRes.ok) {
    const err = await patchRes.text();
    console.error(`[update-prompt] PATCH assistant échoué: ${err}`);
    return NextResponse.json({ error: err }, { status: 500 });
  }

  console.log(`[update-prompt] Prompt mis à jour — ${salutation} — ${newLine}`);
  return NextResponse.json({ updated: true, importantLine: newLine, salutation });
}
