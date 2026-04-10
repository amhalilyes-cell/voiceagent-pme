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

/** Règles langue française — injectées en tête de chaque prompt. */
const FRENCH_RULES =
  `TU PARLES UNIQUEMENT EN FRANÇAIS. JAMAIS UN MOT ANGLAIS. PAS DE "GOODBYE", PAS DE "THANK YOU", PAS DE "OK". ` +
  `SI TU ES TENTÉ DE PARLER ANGLAIS, ARRÊTE-TOI ET REFORMULE EN FRANÇAIS. ` +
  `Tu ne dis jamais de date en anglais. Si la date est 2026, tu dis "deux mille vingt-six" et jamais "two thousand twenty-six". ` +
  `Quand le client épèle son numéro de téléphone chiffre par chiffre, répète-le entièrement pour confirmer avant de continuer. ` +
  `Quand le client donne son adresse, répète-la toujours mot par mot pour confirmer avant de créer le rendez-vous. Si quelque chose semble incorrect dans l'adresse, redemande. ` +
  `Pour le code postal, demande toujours au client de l'épeler chiffre par chiffre. Pour la ville, répète-la pour confirmer. Ne jamais inventer ou modifier une adresse. ` +
  `Dès que le client dit merci au revoir, au revoir, bonne journée ou à bientôt, tu dis immédiatement "Au revoir et à bientôt !" puis tu raccroches sans attendre. Ne dis jamais "Effectivement" ou autre chose après. ` +
  `Une fois le RDV confirmé, conclus directement avec "Au revoir et à bientôt !" puis raccroche. Ne pose aucune question supplémentaire. ` +
  `Après avoir pris le type de permis, demande obligatoirement la ville ou le code postal du futur élève avant de proposer un créneau. ` +
  `Ensuite, demande : "Avez-vous déjà été inscrit dans une autre auto-école ou avez-vous déjà commencé une formation ?" Si oui, demande : "Dans quelle auto-école étiez-vous inscrit précédemment ?" ` +
  `Ensuite, demande : "Que recherchez-vous exactement ?" et propose ces 4 options : 1) Formation complète de A à Z (code de la route, conduite et examen), 2) Préparation au code de la route uniquement, 3) Heures de conduite supplémentaires, 4) Préparation à l'examen pratique uniquement. ` +
  `Ces deux informations (auto-école précédente si applicable, et type de formation recherché) doivent être incluses dans le titre ou la description du rendez-vous Google Calendar ET dans le résumé transmis au moniteur.`;

/** Connaissances spécifiques auto-école — injectées si typeEtablissement === "auto-ecole". */
const AUTO_ECOLE_KNOWLEDGE =
  `CONNAISSANCES AUTO-ÉCOLE : ` +
  `Le NEPH (Numéro d'Enregistrement Préfectoral Harmonisé) est un numéro à 15 chiffres attribué à chaque candidat lors de la première inscription au permis de conduire. Il est nécessaire pour s'inscrire aux examens. ` +
  `Le CPF (Compte Personnel de Formation) permet de financer la formation au permis B uniquement. Le candidat doit avoir plus de 18 ans et être salarié ou demandeur d'emploi. Le montant disponible dépend des droits accumulés. ` +
  `Documents généralement requis pour l'inscription au permis B : pièce d'identité valide, justificatif de domicile, photo d'identité, NEPH si déjà attribué. ` +
  `Délais moyens : permis B en formation classique 6 à 12 mois, permis accéléré (stage intensif) 1 à 2 semaines de formation + attente examen, AAC (conduite accompagnée) dès 15 ans avec un accompagnateur agréé. ` +
  `Différences permis : AM = cyclomoteurs (dès 14 ans) ; A2 = motos jusqu'à 35 kW (dès 18 ans) ; A = toutes motos après 2 ans en A2 ou dès 24 ans ; B = voitures (dès 17 ans en AAC, 18 ans en classique) ; C = poids lourds ; D = transports en commun ; BE = voiture + remorque lourde. ` +
  `Quand un futur élève appelle pour s'inscrire ou prendre un rendez-vous, demande-lui systématiquement s'il possède déjà un numéro NEPH. Si oui, demande-lui de l'avoir avec lui lors de son rendez-vous. Si non, rassure-le en lui disant que l'auto-école s'en occupera lors de son inscription. ` +
  `Dans le titre du rendez-vous Google Calendar, inclus toujours : type de permis, nom complet, téléphone et ville du futur élève. Format : "RDV permis [TYPE] - [Prénom Nom], [téléphone], [ville]". ` +
  `Dans la description du rendez-vous Google Calendar, inclus : type de formation recherché (Formation complète / Code uniquement / Heures supplémentaires / Examen pratique), auto-école précédente si le futur élève en a eu une, et numéro NEPH si communiqué.`;

/** Construit le bloc INFORMATIONS DE L'ÉTABLISSEMENT à injecter dans le prompt. */
function buildEtablissementBlock(artisan: Artisan): string | null {
  const lines: string[] = [];

  if (artisan.typeEtablissement) {
    const typeLabel =
      artisan.typeEtablissement === "auto-ecole" ? "Auto-école" :
      artisan.typeEtablissement === "artisan" ? "Artisan" : "Autre";
    lines.push(`Type d'établissement : ${typeLabel}`);
  }

  if (artisan.typeEtablissement === "auto-ecole") {
    if (artisan.permisProposes && artisan.permisProposes.length > 0) {
      lines.push(`Permis proposés : ${artisan.permisProposes.join(", ")}`);
    }
    if (artisan.tarifHeureConduite) {
      lines.push(`Le tarif exact de cette auto-école est de ${artisan.tarifHeureConduite} € par heure de conduite. Donne toujours ce tarif exact quand on te le demande, ne donne jamais une fourchette générique.`);
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

  // 1. Récupère les infos de l'artisan depuis Supabase
  let artisan: Artisan | undefined;
  try {
    artisan = await findArtisanByVapiAssistantId(assistantId);
  } catch {
    // Non-bloquant
  }
  const nomEntreprise = artisan?.nomEntreprise;
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
    .replace(/^CONNAISSANCES AUTO-ÉCOLE[\s\S]*?\n\n/, "")
    .replace(/^INFORMATIONS DE L'ÉTABLISSEMENT[\s\S]*?\n\n/, "")
    .replace(/^IMPORTANT\s*:.*(?:\r?\n){1,2}/i, "");

  const isAutoEcole = artisan?.typeEtablissement === "auto-ecole";
  const frenchRulesBlock = isAutoEcole
    ? `${FRENCH_RULES}\n\n${AUTO_ECOLE_KNOWLEDGE}`
    : FRENCH_RULES;

  const etablissementBlock = artisan ? buildEtablissementBlock(artisan) : null;

  const newContent = etablissementBlock
    ? `${frenchRulesBlock}\n\n${etablissementBlock}\n\n${newLine}\n\n${withoutOld.trimStart()}`
    : `${frenchRulesBlock}\n\n${newLine}\n\n${withoutOld.trimStart()}`;

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
      endCallPhrases: ["au revoir", "bonne soirée", "bonne journée", "à bientôt", "à plus tard", "merci au revoir", "c'est bon merci", "ok merci"],
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
