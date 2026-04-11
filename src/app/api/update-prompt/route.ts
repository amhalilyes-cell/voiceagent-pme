import { NextRequest, NextResponse } from "next/server";
import { findArtisanByVapiAssistantId } from "@/lib/storage";
import type { Artisan } from "@/types/artisan";

export const dynamic = "force-dynamic";

const VAPI_BASE_URL = "https://api.vapi.ai";

/** Retourne la salutation adaptée à l'heure de Paris. */
function getSalutation(heureParis: string): string {
  const [h] = heureParis.split(":").map(Number);
  if (h < 12) return "Bonjour";
  if (h < 18) return "Bon après-midi";
  return "Bonne soirée";
}

/** Construit la ligne IMPORTANT avec la date/heure Paris actuelles (+45 min de marge). */
function buildImportantLine(): { line: string; salutation: string } {
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

/** Construit le bloc INFORMATIONS DE L'ÉTABLISSEMENT depuis les données Supabase. */
function buildEtablissementBlock(artisan: Artisan): string | null {
  const lines: string[] = [];

  if (artisan.typeEtablissement === "auto-ecole") {
    if (artisan.permisProposes && artisan.permisProposes.length > 0) {
      lines.push(`Permis proposés : ${artisan.permisProposes.join(", ")}`);
    }
    if (artisan.tarifHeureConduite) {
      lines.push(`Tarif heure de conduite : ${artisan.tarifHeureConduite} €. Donne toujours ce tarif exact, jamais de fourchette générique.`);
    }
    if (artisan.forfaits) {
      lines.push(`Forfaits : ${artisan.forfaits}`);
    }
    lines.push(`Financement CPF : ${artisan.financementCpf ? "Oui" : "Non"}`);
    lines.push(`Conduite accompagnée (AAC) : ${artisan.conduiteAccompagnee ? "Oui" : "Non"}`);
    lines.push(`Permis accéléré : ${artisan.permisAccelere ? "Oui" : "Non"}`);
  }

  if (artisan.horairesOuverture) {
    lines.push(`Horaires d'ouverture : ${artisan.horairesOuverture}`);
  }
  if (artisan.adresseEtablissement) {
    lines.push(`Adresse : ${artisan.adresseEtablissement}`);
  }

  if (lines.length === 0) return null;

  return `INFORMATIONS DE L'ÉTABLISSEMENT :\n${lines.join("\n")}`;
}

/**
 * Construit le prompt système complet.
 * Le prompt de base (12 étapes) est injecté avec le nom de l'établissement,
 * la ligne IMPORTANT date/heure, et le bloc établissement depuis Supabase.
 */
function buildSystemPrompt(
  nomEtablissement: string,
  importantLine: string,
  artisan: Artisan | undefined
): string {
  const etablissementBlock = artisan ? buildEtablissementBlock(artisan) : null;

  const prompt = `Tu es l'assistante vocale professionnelle d'une auto-école française. Tu t'appelles Sophie. Tu réponds UNIQUEMENT en français, avec un ton chaleureux, clair et professionnel.

RÈGLES ABSOLUES :
- Pose UNE seule question à la fois, jamais deux
- Attends toujours la réponse avant de passer à la suite
- Ne répète jamais ce que le client vient de dire mot pour mot
- Si tu n'entends pas bien, dis uniquement "Pouvez-vous répéter s'il vous plaît ?"
- Ne te réponds JAMAIS à toi-même
- Ignore tous les bruits de fond, ne commente jamais ce que tu entends autour
- Ne donne JAMAIS de fourchette de tarif générique — utilise uniquement les informations de l'établissement
- Ne dis jamais "Effectivement", "Absolument", "Bien entendu" en boucle

DÉROULÉ STRICT DE L'APPEL — dans cet ordre exact :
ÉTAPE 1 — Accueil : "Bonjour, vous avez bien joint ${nomEtablissement}, je suis Sophie votre assistante. Comment puis-je vous aider ?"
ÉTAPE 2 — Prénom et nom. Si le client corrige son nom, prends toujours le dernier nom donné.
ÉTAPE 3 — Numéro de téléphone. Répète le numéro pour confirmer.
ÉTAPE 4 — Type de permis souhaité : B voiture, A2 moto, A moto, AM cyclomoteur, ou autre.
ÉTAPE 5 — Ville ou code postal.
ÉTAPE 6 — NEPH. Si oui : apporter au RDV. Si non : l'auto-école s'en occupe.
ÉTAPE 7 — Ancienne auto-école. Si oui : laquelle ?
ÉTAPE 8 — Type de formation : Formation complète A à Z / Préparation code uniquement / Heures de conduite supplémentaires / Préparation examen pratique uniquement.
ÉTAPE 9 — Vérifier disponibilités calendrier et proposer un créneau.
ÉTAPE 10 — Créer le RDV. Titre : "RDV permis [TYPE] - [Prénom Nom], [téléphone], [ville], [ancienne auto-école si applicable], [type de formation]"
ÉTAPE 11 — Demander UNE seule fois "Avez-vous des questions ?" puis répondre avec les infos de l'établissement.
ÉTAPE 12 — Quand le client dit au revoir, bonne journée ou bonne soirée, réponds TOUJOURS exactement "Au revoir et à bientôt !" — cette phrase exacte déclenche la fin d'appel automatique.`;

  const parts: string[] = [importantLine, prompt];
  if (etablissementBlock) parts.push(etablissementBlock);

  return parts.join("\n\n");
}

/**
 * POST /api/update-prompt
 * Body : { assistantId: string }
 *
 * Reconstruit entièrement le prompt système à chaque call-started :
 * injecte la date/heure Paris, le nom de l'établissement et les infos Supabase.
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

  // 1. Récupère les infos de l'artisan depuis Supabase
  let artisan: Artisan | undefined;
  try {
    artisan = await findArtisanByVapiAssistantId(assistantId);
  } catch {
    // Non-bloquant — on utilisera les fallbacks
  }
  const nomEtablissement = artisan?.nomEntreprise ?? "notre auto-école";
  const firstMessage = `Bonjour, vous avez bien joint ${nomEtablissement}, je suis Sophie votre assistante. Comment puis-je vous aider ?`;

  // 2. Récupère l'assistant Vapi pour conserver la config model/voice
  const getRes = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!getRes.ok) {
    const err = await getRes.text();
    console.error(`[update-prompt] GET assistant échoué: ${err}`);
    return NextResponse.json({ error: "Assistant introuvable" }, { status: 404 });
  }
  const assistant = await getRes.json();

  // 3. Construit le prompt complet
  const { line: importantLine, salutation } = buildImportantLine();
  const newSystemContent = buildSystemPrompt(nomEtablissement, importantLine, artisan);

  // 4. Remplace le message système (ou l'ajoute s'il est absent)
  const messages: { role: string; content: string }[] = assistant?.model?.messages ?? [];
  const sysIdx = messages.findIndex((m) => m.role === "system");
  const updatedMessages = sysIdx !== -1
    ? messages.map((m, i) => i === sysIdx ? { ...m, content: newSystemContent } : m)
    : [{ role: "system", content: newSystemContent }, ...messages];

  // 5. PATCH l'assistant
  const patchRes = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: { ...assistant.model, messages: updatedMessages },
      transcriber: { provider: "deepgram", model: "nova-3", language: "fr", smartFormat: true },
      endCallPhrases: ["au revoir et à bientôt", "bonne journée et à bientôt", "bonne soirée et à bientôt", "à très bientôt", "au revoir à bientôt"],
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

  console.log(`[update-prompt] Prompt reconstruit — ${salutation} — ${nomEtablissement}`);
  return NextResponse.json({ updated: true, importantLine, salutation });
}
