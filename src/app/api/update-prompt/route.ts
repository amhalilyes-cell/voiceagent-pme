import { NextRequest, NextResponse } from "next/server";
import { findArtisanByVapiAssistantId } from "@/lib/storage";

export const dynamic = "force-dynamic";

const VAPI_BASE_URL = "https://api.vapi.ai";

/** Retourne la salutation adaptée à l'heure de Paris. */
function getSalutation(heureParis: string): string {
  const [h] = heureParis.split(":").map(Number);
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonne soirée";
}

/** Règles langue française — injectées en tête de chaque prompt. */
const FRENCH_RULES =
  `TU PARLES UNIQUEMENT EN FRANÇAIS. JAMAIS UN MOT ANGLAIS. PAS DE "GOODBYE", PAS DE "THANK YOU", PAS DE "OK". ` +
  `SI TU ES TENTÉ DE PARLER ANGLAIS, ARRÊTE-TOI ET REFORMULE EN FRANÇAIS. ` +
  `Tu ne dis jamais de date en anglais. Si la date est 2026, tu dis "deux mille vingt-six" et jamais "two thousand twenty-six". ` +
  `Quand le client épèle son numéro de téléphone chiffre par chiffre, répète-le entièrement pour confirmer avant de continuer. ` +
  `Quand le client donne son adresse, répète-la toujours mot par mot pour confirmer avant de créer le rendez-vous. Si quelque chose semble incorrect dans l'adresse, redemande. ` +
  `Pour le code postal, demande toujours au client de l'épeler chiffre par chiffre. Pour la ville, répète-la pour confirmer. Ne jamais inventer ou modifier une adresse.`;

/** Construit la ligne IMPORTANT avec la date/heure Paris actuelles (+5 min de marge). */
function buildImportantLine(): { line: string; salutation: string } {
  // +5 minutes pour éviter de proposer des créneaux qui débutent maintenant
  const now = new Date(Date.now() + 45 * 60 * 1000);
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

  // 1. Récupère le nom de l'entreprise depuis Supabase pour personnaliser le firstMessage
  let nomEntreprise: string | undefined;
  try {
    const artisan = await findArtisanByVapiAssistantId(assistantId);
    nomEntreprise = artisan?.nomEntreprise;
  } catch {
    // Non-bloquant — on utilisera le fallback générique
  }
  const firstMessage = nomEntreprise
    ? `Bonjour, vous avez bien joint ${nomEntreprise}, je suis l'assistant vocal, comment puis-je vous aider ?`
    : "Bonjour, vous avez bien joint notre service, je suis l'assistant vocal, comment puis-je vous aider ?";

  // 2. Récupère l'assistant actuel
  const getRes = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!getRes.ok) {
    const err = await getRes.text();
    console.error(`[update-prompt] GET assistant échoué: ${err}`);
    return NextResponse.json({ error: "Assistant introuvable" }, { status: 404 });
  }
  const assistant = await getRes.json();

  // 3. Trouve le message système
  const messages: { role: string; content: string }[] = assistant?.model?.messages ?? [];
  const sysIdx = messages.findIndex((m) => m.role === "system");
  if (sysIdx === -1) {
    return NextResponse.json({ error: "Prompt système introuvable" }, { status: 422 });
  }

  // 4. Remplace la ligne IMPORTANT (ou la préfixe si absente)
  const oldContent: string = messages[sysIdx].content;
  const { line: newLine, salutation } = buildImportantLine();
  const withoutOld = oldContent
    .replace(/^TU PARLES UNIQUEMENT[\s\S]*?\n\n/, "")
    .replace(/^IMPORTANT\s*:.*(?:\r?\n){1,2}/i, "");
  const newContent = `${FRENCH_RULES}\n\n${newLine}\n\n${withoutOld.trimStart()}`;

  const updatedMessages = messages.map((m, i) =>
    i === sysIdx ? { ...m, content: newContent } : m
  );

  // 5. PATCH l'assistant avec prompt + firstMessage personnalisé
  const patchRes = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: { ...assistant.model, messages: updatedMessages },
      transcriber: { provider: "deepgram", model: "nova-3", language: "fr", smartFormat: true },
      endCallPhrases: [],
      silenceTimeoutSeconds: 60,
      maxDurationSeconds: 1800,
      endCallMessage: "Au revoir et à bientôt !",
      voicemailMessage: "Bonjour, vous avez contacté notre service. Nous ne sommes pas disponibles pour le moment. Merci de rappeler ou de nous laisser un message, nous vous recontacterons dans les plus brefs délais.",
      firstMessage,
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
