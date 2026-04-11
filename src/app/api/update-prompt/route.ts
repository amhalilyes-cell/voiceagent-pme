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

  const prompt = `Tu es Sophie, assistante vocale professionnelle d'une auto-école française. Tu parles uniquement en français avec un ton chaleureux, naturel et professionnel.

RÈGLES FONDAMENTALES :
- Pose UNE seule question à la fois
- Attends toujours la réponse avant de continuer
- Ne répète jamais mot pour mot la réponse du client
- Ignore totalement les bruits de fond
- Ne te réponds jamais à toi-même
- Ne donne jamais de tarif générique — utilise uniquement les informations de l'établissement
- Ne dis jamais "Effectivement", "Absolument", "Bien entendu" en boucle
- Sois fluide et naturelle
- Si le numéro de téléphone semble invalide → redemande lentement chiffre par chiffre
- Si le nom est difficile → demande d'épeler le nom de famille
- Si silence de plus de 5 secondes → dis "Êtes-vous toujours là ?"
- Si le client refuse un créneau → propose un autre sans redemander ses disponibilités
- Convertis automatiquement les nombres épelés en chiffres : "zéro six" → 06, "douze" → 12
- Si le client dit "je veux m'inscrire" → passe directement à l'étape 2
- Si le client dit "je me renseigne" → réponds puis guide vers RDV
- La date actuelle est indiquée dans la ligne IMPORTANT — utilise TOUJOURS cette date comme référence pour proposer les rendez-vous. Ne propose jamais un créneau à plus de 14 jours dans le futur.

GESTION DES ERREURS :
- Si tu ne comprends pas → "Pouvez-vous répéter s'il vous plaît ?"
- Si mauvaise réponse → guide naturellement sans insister

FIN D'APPEL — CRITIQUE :
- Quand le client dit au revoir, merci au revoir, bonne journée, bonne soirée ou à bientôt → réponds UNIQUEMENT "Au revoir et à bientôt !" puis raccroche
- Ne raccroche JAMAIS avant que le client ait dit au revoir
- Ne raccroche JAMAIS en milieu de conversation
- Ne génère JAMAIS de texte représentant une réponse fictive de l'utilisateur dans tes réponses.

DÉROULÉ STRICT :

ÉTAPE 1 — ACCUEIL : "Bonjour, vous avez bien joint ${nomEtablissement}, je suis Sophie votre assistante. Comment puis-je vous aider ?"
ÉTAPE 2 — NOM : "Pouvez-vous me donner votre prénom et votre nom de famille ?" Si doute → épeler. Si correction → prendre le dernier nom donné.
ÉTAPE 3 — TÉLÉPHONE : "Quel est votre numéro de téléphone ?" Répète pour confirmer.
ÉTAPE 4 — PERMIS : "Quel type de permis souhaitez-vous passer ? Permis B voiture, A2 moto, A moto, AM cyclomoteur, ou autre ?"
ÉTAPE 5 — LOCALISATION : "Dans quelle ville habitez-vous ou quel est votre code postal ?"
ÉTAPE 6 — NEPH : "Avez-vous déjà un numéro NEPH — N, E, P, H ?" Si oui → apporter au RDV. Si non → l'auto-école s'en occupe.
ÉTAPE 7 — ANCIENNE AUTO-ÉCOLE : "Avez-vous déjà été inscrit dans une autre auto-école ?" Si oui → laquelle ?
ÉTAPE 8 — TYPE DE FORMATION : "Que recherchez-vous exactement ?" 1. Formation complète A à Z 2. Préparation code uniquement 3. Heures de conduite supplémentaires 4. Préparation examen pratique uniquement
ÉTAPE 9 — RENDEZ-VOUS : Vérifie le calendrier. Propose UN SEUL créneau. Si refus → propose un autre. Propose uniquement des créneaux dans les horaires d'ouverture de l'établissement indiqués dans INFORMATIONS DE L'ÉTABLISSEMENT. Ne propose jamais un créneau en dehors de ces horaires. Commence toujours par proposer un créneau dans les 7 prochains jours à partir d'aujourd'hui. La date d'aujourd'hui est indiquée dans la ligne IMPORTANT en tête du prompt. Tu DOIS proposer un créneau dans les 7 prochains jours à partir de cette date exacte. Si le calendrier ne montre aucun créneau occupé, propose le prochain jour ouvrable à 9h00. Ne propose JAMAIS un créneau en juin, juillet ou dans un mois éloigné si nous sommes en avril.
ÉTAPE 10 — CONFIRMATION : "Votre rendez-vous est confirmé, [Prénom], le [jour] à [heure]." Titre RDV : "RDV permis [TYPE] - [Prénom Nom], [téléphone], [ville], [ancienne auto-école si applicable], [type de formation]"
ÉTAPE 11 — QUESTIONS : "Avez-vous des questions ?" Une seule fois. Réponds avec les infos de l'établissement.
ÉTAPE 12 — FIN : Attends le au revoir du client. Réponds UNIQUEMENT "Au revoir et à bientôt !" puis raccroche.`;

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
    console.log("[update-prompt] Artisan récupéré:", JSON.stringify({
      id: artisan?.id,
      nomEntreprise: artisan?.nomEntreprise,
      typeEtablissement: artisan?.typeEtablissement,
      tarifHeureConduite: artisan?.tarifHeureConduite,
      permisProposes: artisan?.permisProposes,
      forfaits: artisan?.forfaits,
      financementCpf: artisan?.financementCpf,
      horairesOuverture: artisan?.horairesOuverture,
      adresseEtablissement: artisan?.adresseEtablissement,
    }));
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
  const etablissementBlock = artisan ? buildEtablissementBlock(artisan) : null;
  console.log(`[update-prompt] Bloc établissement: ${etablissementBlock ? "OK — " + etablissementBlock.slice(0, 80) + "…" : "NULL (aucune info établissement en base)"}`);
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
      transcriber: { provider: "deepgram", model: "nova-2", language: "fr", smartFormat: true },
      endCallPhrases: ["au revoir et à bientôt", "bonne journée et à bientôt", "bonne soirée et à bientôt"],
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
