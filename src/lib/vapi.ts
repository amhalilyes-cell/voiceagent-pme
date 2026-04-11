// Version 4 - 09/04/2026
import crypto from "crypto";
import type { VapiWebhookEvent, VapiFunctionCallResponse } from "@/types/vapi";
import { sendCallReport } from "@/lib/email";
import { sendConfirmationSMS } from "@/lib/sms";
import { saveCall, findArtisanByVapiAssistantId } from "@/lib/storage";

/**
 * Convertit les nombres français parlés (0-99) en chiffres dans un texte.
 * Ex : "zéro six soixante-six zéro sept trente-six quatre-vingt-cinq" → "0666073685"
 * Utile pour extraire les numéros de téléphone depuis la transcription.
 */
export function convertSpokenNumbersToDigits(text: string): string {
  // Table complète 0-99, ordonnée du plus long au plus court pour éviter les remplacements partiels
  const NUMS: [string, number][] = [
    ["quatre-vingt-dix-neuf", 99], ["quatre-vingt-dix-huit", 98],
    ["quatre-vingt-dix-sept", 97], ["quatre-vingt-seize", 96],
    ["quatre-vingt-quinze", 95], ["quatre-vingt-quatorze", 94],
    ["quatre-vingt-treize", 93], ["quatre-vingt-douze", 92],
    ["quatre-vingt-onze", 91], ["quatre-vingt-dix", 90],
    ["quatre-vingt-neuf", 89], ["quatre-vingt-huit", 88],
    ["quatre-vingt-sept", 87], ["quatre-vingt-six", 86],
    ["quatre-vingt-cinq", 85], ["quatre-vingt-quatre", 84],
    ["quatre-vingt-trois", 83], ["quatre-vingt-deux", 82],
    ["quatre-vingt-un", 81], ["quatre-vingts", 80], ["quatre-vingt", 80],
    ["soixante-dix-neuf", 79], ["soixante-dix-huit", 78],
    ["soixante-dix-sept", 77], ["soixante-seize", 76],
    ["soixante-quinze", 75], ["soixante-quatorze", 74],
    ["soixante-treize", 73], ["soixante-douze", 72],
    ["soixante et onze", 71], ["soixante-onze", 71],
    ["soixante-dix", 70],
    ["soixante-neuf", 69], ["soixante-huit", 68],
    ["soixante-sept", 67], ["soixante-six", 66],
    ["soixante-cinq", 65], ["soixante-quatre", 64],
    ["soixante-trois", 63], ["soixante-deux", 62],
    ["soixante et un", 61], ["soixante-un", 61], ["soixante", 60],
    ["cinquante-neuf", 59], ["cinquante-huit", 58],
    ["cinquante-sept", 57], ["cinquante-six", 56],
    ["cinquante-cinq", 55], ["cinquante-quatre", 54],
    ["cinquante-trois", 53], ["cinquante-deux", 52],
    ["cinquante et un", 51], ["cinquante-un", 51], ["cinquante", 50],
    ["quarante-neuf", 49], ["quarante-huit", 48],
    ["quarante-sept", 47], ["quarante-six", 46],
    ["quarante-cinq", 45], ["quarante-quatre", 44],
    ["quarante-trois", 43], ["quarante-deux", 42],
    ["quarante et un", 41], ["quarante-un", 41], ["quarante", 40],
    ["trente-neuf", 39], ["trente-huit", 38],
    ["trente-sept", 37], ["trente-six", 36],
    ["trente-cinq", 35], ["trente-quatre", 34],
    ["trente-trois", 33], ["trente-deux", 32],
    ["trente et un", 31], ["trente-un", 31], ["trente", 30],
    ["vingt-neuf", 29], ["vingt-huit", 28],
    ["vingt-sept", 27], ["vingt-six", 26],
    ["vingt-cinq", 25], ["vingt-quatre", 24],
    ["vingt-trois", 23], ["vingt-deux", 22],
    ["vingt et un", 21], ["vingt-un", 21], ["vingt", 20],
    ["dix-neuf", 19], ["dix-huit", 18], ["dix-sept", 17],
    ["seize", 16], ["quinze", 15], ["quatorze", 14],
    ["treize", 13], ["douze", 12], ["onze", 11], ["dix", 10],
    ["neuf", 9], ["huit", 8], ["sept", 7], ["six", 6],
    ["cinq", 5], ["quatre", 4], ["trois", 3], ["deux", 2],
    ["une", 1], ["un", 1], ["zéro", 0], ["zero", 0],
  ];

  let result = text;
  for (const [word, value] of NUMS) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Frontières : pas précédé ni suivi d'une lettre (y compris accentuée)
    result = result.replace(
      new RegExp(`(?<![a-zà-ÿA-ZÀ-Ÿ])${escaped}(?![a-zà-ÿA-ZÀ-Ÿ])`, "gi"),
      String(value)
    );
  }

  // Fusionne les séquences de chiffres séparés par des espaces (pour les numéros de téléphone)
  // ex: "0 6 66 07 36 85" → "0666073685"
  for (let i = 0; i < 6; i++) {
    result = result.replace(/(\d+)\s+(\d+)/g, "$1$2");
  }

  return result;
}

/** Formate une date ISO en heure Europe/Paris lisible */
function toParisTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: "Europe/Paris",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/**
 * Vérifie la signature HMAC-SHA256 d'un webhook Vapi.
 * Retourne true si la signature est valide.
 */
export function verifyVapiSignature(
  rawBody: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");

  // Comparaison en temps constant pour éviter les timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Filtre les blocs hallucinés par le transcripteur dans la transcription.
 * Supprime les phrases/paragraphes contenant :
 * - Des mots anglais caractéristiques (hallucination LLM)
 * - Des montants en dollars ($)
 * - Des noms de villes non françaises typiques des hallucinations
 * - Des noms de journalistes/présentateurs souvent hallucinés
 */
function filterHallucinatedBlocks(transcript: string): string {
  // Corrections de codes postaux mal transcrits avant tout filtrage
  let result = transcript
    // "6 2 3 0 0" → "62300" (chiffres épelés séparés par des espaces)
    .replace(/\b(\d)\s+(\d)\s+(\d)\s+(\d)\s+(\d)\b/g, "$1$2$3$4$5")
    // "623 cents" → "62300" (six cent / cents = 00)
    .replace(/\b(\d{1,3})\s+cents?\b/gi, (_, n) => n + "00");

  const HALLUCINATION_PATTERNS = [
    /\$\s*\d+/,                                                        // montants en dollars
    /\b(?:thank you|goodbye|you're welcome|have a nice day|see you)\b/i, // formules anglaises
    /\b(?:washington|new york|london|los angeles|chicago|silicon valley)\b/i, // villes non françaises
    /\b(?:breaking news|stay tuned|live from|reported by|anchor|correspondent)\b/i, // vocabulaire journalistique
    /\b(?:subscribe|newsletter|podcast|episode|viewers|listeners)\b/i,  // vocabulaire médias
    /[A-Za-z]{4,}\s+[A-Za-z]{4,}\s+[A-Za-z]{4,}\s+[A-Za-z]{4,}\s+[A-Za-z]{4,}/, // suite de 5+ mots anglais consécutifs
  ];

  // Découpe par lignes, filtre les lignes suspectes, recolle
  const lines = result.split("\n");
  const filtered = lines.filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true; // garde les lignes vides (structure)
    return !HALLUCINATION_PATTERNS.some((re) => re.test(trimmed));
  });

  return filtered.join("\n");
}

/**
 * Gestionnaire centralisé des événements Vapi.
 * Retourne une réponse optionnelle (utile pour les function-calls).
 */
export async function handleVapiEvent(
  event: VapiWebhookEvent
): Promise<VapiFunctionCallResponse | null> {
  const { type } = event.message;

  switch (type) {
    case "call-started": {
      const { call } = event.message;
      const clientPhone = call.customer?.number ?? call.customer?.phoneNumber ?? "inconnu";
      console.log(
        `[Vapi] Appel démarré — ID: ${call.id} | Client: ${clientPhone}`
      );

      // Met à jour le prompt de l'assistant avec l'heure Paris actuelle (non-bloquant)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://voiceagent-pme.vercel.app";
      fetch(`${appUrl}/api/update-prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId: call.assistantId }),
      }).catch((err) => console.error("[Vapi] update-prompt échoué:", err));

      return null;
    }

    case "call-ended": {
      const { call } = event.message;
      console.log(
        `[Vapi] Appel terminé — ID: ${call.id} | Raison: ${event.message.endedReason}`
      );
      return null;
    }

    case "end-of-call-report": {
      const { call } = event.message;
      const report = event.message;
      console.log(`[Vapi] Rapport de fin d'appel — ID: ${call.id}`);
      console.log(`[Vapi] Résumé: ${report.summary}`);

      // Fallbacks pour les champs potentiellement null (appel terminé anormalement)
      // convertSpokenNumbersToDigits appliqué pour faciliter l'extraction du téléphone
      // filterHallucinatedBlocks supprime les blocs parasites introduits par le transcripteur
      const transcript = filterHallucinatedBlocks(convertSpokenNumbersToDigits(report.transcript ?? ""));
      const summaryRaw = report.summary ?? "";
      const messages = report.messages ?? [];

      // Numéro du client : champ réel Vapi = customer.number
      const clientPhone = call.customer?.number ?? call.customer?.phoneNumber;

      // Durée : priorité à message.durationSeconds (fourni par Vapi), sinon calcul depuis timestamps
      let durationSeconds: number | undefined;
      if (typeof report.durationSeconds === "number" && report.durationSeconds > 0) {
        durationSeconds = Math.round(report.durationSeconds ?? 0);
      } else if (call.startedAt && call.endedAt) {
        const endTime = new Date(call.endedAt).getTime();
        const startTime = new Date(call.startedAt).getTime();
        durationSeconds = Math.round((endTime - startTime) / 1000);
      }

      // Nom client : customer.name > args GCal > transcript
      const clientNameFromGcal = extractNameFromCalendarArgs(messages);
      const clientName =
        call.customer?.name ??
        clientNameFromGcal ??
        extractNameFromTranscript(transcript);

      // ── Debug ──────────────────────────────────────────
      console.log("[Debug] clientPhone:", clientPhone);
      console.log("[Debug] clientName:", call.customer?.name);
      console.log("[Debug] clientNameFromGcal:", clientNameFromGcal);
      console.log("[Debug] durationSeconds:", report.durationSeconds, durationSeconds);
      console.log("[Debug] extractedName:", extractNameFromTranscript(transcript));
      // ───────────────────────────────────────────────────

      // Date de l'appel en Europe/Paris
      const callDate = call.startedAt ?? call.endedAt;
      const callDateParis = callDate ? toParisTime(callDate) : undefined;

      // Corpus élargi pour la détection RDV : summary + transcript + messages du bot
      const botMessagesText = messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.content)
        .join(" ");
      const rdvCorpus = [summaryRaw, transcript, botMessagesText]
        .filter(Boolean)
        .join(" ");

      // Recherche d'un événement Google Calendar confirmé dans les tool results
      const calendarEvent = extractCalendarEvent(messages);
      if (calendarEvent) {
        console.log(`[Vapi] Événement GCal détecté — eventId: ${calendarEvent.eventId}, start: ${calendarEvent.startIso}`);
      }

      // RDV : priorité à l'événement GCal, sinon extraction textuelle
      let rdvInfo: { date: string; heure?: string } | null = null;
      if (calendarEvent) {
        rdvInfo = { date: calendarEvent.date, heure: calendarEvent.heure };
      } else {
        rdvInfo = extractRdvFromText(rdvCorpus);
      }
      const rdvMentioned = /\b(?:rendez-vous|rdv)\b/i.test(rdvCorpus);
      const rdvText = rdvInfo
        ? `${rdvInfo.date}${rdvInfo.heure ? ` à ${rdvInfo.heure}` : ""}`
        : undefined;

      // Recherche de l'artisan pour lier l'appel et enrichir le SMS
      let artisanId: string | undefined;
      let artisanTelephone: string | undefined;
      let artisanNomEntreprise: string | undefined;
      try {
        const artisan = await findArtisanByVapiAssistantId(call.assistantId);
        artisanId = artisan?.id;
        artisanTelephone = artisan?.telephone;
        artisanNomEntreprise = artisan?.nomEntreprise;
      } catch (err) {
        console.warn(`[Vapi] Artisan introuvable pour assistantId ${call.assistantId}:`, err);
      }

      // Adresse : summary GCal en priorité (adresse structurée), puis transcription en fallback
      const clientAddress =
        extractAddressFromCalendarSummary(messages) ??
        extractAddressFromTranscript(transcript);

      // Résumé : utilise report.summary si disponible, sinon génère depuis la transcription
      const summary =
        summaryRaw.trim() ||
        generateSummary(transcript, rdvInfo, clientName, clientPhone, clientAddress, messages);
      console.log("[Debug] summary utilisé:", summary);

      // Sauvegarde dans Supabase
      try {
        await saveCall({
          artisanId,
          vapiCallId: call.id,
          clientName,
          clientPhone,
          clientAddress,
          durationSeconds,
          summary,
          transcript,
          recordingUrl: report.recordingUrl,
          rdv: rdvText,
          startedAt: call.startedAt,
          endedAt: call.endedAt,
        });
        console.log(`[Vapi] Appel ${call.id} sauvegardé en base`);
      } catch (err) {
        console.error(`[Vapi] Échec sauvegarde appel ${call.id}:`, err);
      }

      // Envoi email de rapport
      try {
        await sendCallReport({
          callId: call.id,
          clientName,
          clientPhone,
          clientAddress,
          summary,
          transcript,
          durationSeconds,
          recordingUrl: report.recordingUrl,
          rdv: rdvText,
          callDate: calendarEvent?.startIso ?? callDate,
        });
        console.log("[Debug] callDate envoyé à email:", calendarEvent?.startIso ?? callDate);
        console.log(`[Vapi] Email de rapport envoyé pour l'appel ${call.id} (${callDateParis})`);
      } catch (err) {
        console.error(`[Vapi] Échec envoi email pour l'appel ${call.id}:`, err);
      }

      // Envoi SMS de confirmation si un RDV est détecté
      if ((rdvInfo || rdvMentioned) && clientPhone) {
        const smsClientName = clientName ?? "Client";
        const companyName = artisanNomEntreprise ?? process.env.ARTISAN_COMPANY_NAME ?? "votre artisan";
        try {
          await sendConfirmationSMS({
            clientName: smsClientName,
            clientPhone,
            rdvDate: rdvInfo?.date,
            rdvHeure: rdvInfo?.heure,
            companyName,
            artisanPhone: artisanTelephone,
          });
          console.log(
            rdvInfo
              ? `[Vapi] SMS de confirmation (${rdvInfo.date}) envoyé à ${clientPhone}`
              : `[Vapi] SMS générique RDV envoyé à ${clientPhone}`
          );
        } catch (err) {
          console.error(`[Vapi] Échec envoi SMS pour l'appel ${call.id}:`, err);
        }
      }

      return null;
    }

    case "transcript": {
      // Traitement des transcriptions en temps réel si nécessaire
      return null;
    }

    case "function-call": {
      const { functionCall } = event.message;
      return await dispatchFunctionCall(
        functionCall.name,
        functionCall.parameters
      );
    }

    default:
      return null;
  }
}

/**
 * Dispatch les appels de fonctions définis dans l'assistant Vapi.
 */
async function dispatchFunctionCall(
  name: string,
  params: Record<string, unknown>
): Promise<VapiFunctionCallResponse> {
  switch (name) {
    case "checkDisponibilite": {
      // TODO: Interroger un vrai calendrier (Google Calendar, Calendly…)
      const date = params.date as string | undefined;
      return {
        result: date
          ? `Je suis disponible le ${date}. Souhaitez-vous que je confirme ce créneau ?`
          : "Pouvez-vous me préciser la date souhaitée ?",
      };
    }

    case "prendrRendezVous": {
      // TODO: Créer l'événement dans le calendrier
      const { date, heure, nom, telephone } = params as Record<string, string>;
      console.log(
        `[RDV] Nouveau RDV — ${nom} | ${telephone} | ${date} à ${heure}`
      );

      // Envoi SMS de confirmation immédiat (données explicites)
      if (telephone) {
        const companyName = process.env.ARTISAN_COMPANY_NAME ?? "votre artisan";
        sendConfirmationSMS({
          clientName: nom ?? "Client",
          clientPhone: telephone,
          rdvDate: date,
          rdvHeure: heure,
          companyName,
        }).catch((err) =>
          console.error("[RDV] Échec envoi SMS de confirmation :", err)
        );
      }

      const heureStr = heure ? ` à ${heure}` : "";
      return {
        result: `Parfait ! J'ai bien noté votre rendez-vous le ${date}${heureStr}. Vous recevrez une confirmation par SMS.`,
      };
    }

    case "demanderDevis": {
      // TODO: Enregistrer la demande en base / envoyer une notification
      const { typesTravaux, adresse, nom, telephone } = params as Record<
        string,
        string
      >;
      console.log(
        `[DEVIS] Nouvelle demande — ${nom} | ${telephone} | ${typesTravaux} @ ${adresse}`
      );
      return {
        result: `Merci ${nom}. Votre demande de devis pour ${typesTravaux} a bien été enregistrée. L'artisan vous rappellera dans les 24 heures.`,
      };
    }

    default:
      console.warn(`[Vapi] Fonction inconnue appelée : ${name}`);
      return {
        result: "Je suis désolé, je ne peux pas traiter cette demande pour le moment.",
      };
  }
}

/** Mots français pour les heures écrites en toutes lettres */
const HEURES_LETTRES =
  "(?:une|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|onze|douze|treize|quatorze|quinze|seize|dix-sept|dix-huit|dix-neuf|vingt)";

/**
 * Extrait une date et une heure de RDV depuis un texte libre.
 * Cherche dans summary, transcript ET messages du bot.
 * Retourne null si aucun RDV n'est détecté.
 */
function extractRdvFromText(text: string): { date: string; heure?: string } | null {
  // Cherche "rendez-vous le <date>" ou "RDV le <date>"
  const rdvPattern = /(?:rendez-vous|rdv)[^.]*?(?:le|du|pour le)\s+([^,.]{4,40})/i;
  const rdvMatch = text.match(rdvPattern);
  if (!rdvMatch) return null;

  const raw = rdvMatch[1].trim();

  // Heure numérique : "à 10h30", "à 10:30"
  const heureNumMatch =
    raw.match(/[àa]\s*(\d{1,2}[h:]\d{0,2})/i) ??
    text.match(/[àa]\s*(\d{1,2}[h:]\d{0,2})/i);

  // Heure en lettres : "à onze heures", "à dix heures et demie"
  const heureLettrePat = new RegExp(
    `[àa]\\s+(${HEURES_LETTRES}\\s+heures?(?:\\s+(?:et\\s+)?(?:quart|demie?|une|deux|trois|quatre|cinq|dix|vingt))?)`,
    "i"
  );
  const heureLettreMatch = raw.match(heureLettrePat) ?? text.match(heureLettrePat);

  let heure: string | undefined;
  if (heureNumMatch) {
    heure = heureNumMatch[1].replace(":", "h");
  } else if (heureLettreMatch) {
    heure = heureLettreMatch[1].trim();
  }

  // Nettoie la date : retire l'heure et les mots parasites
  const date = raw
    .replace(/[àa]\s*\d{1,2}[h:]\d{0,2}/i, "")
    .replace(heureLettrePat, "")
    .replace(/\b(?:du\s+coup|donc|coup|euh|ben|voilà)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return { date, heure };
}

/**
 * Cherche un résultat d'outil Google Calendar dans les messages Vapi.
 * Retourne la date/heure confirmée de l'événement si trouvée.
 */
function extractCalendarEvent(
  messages: { role: string; content: string; name?: string }[]
): { eventId?: string; startIso?: string; date: string; heure?: string } | null {
  const toolResults = messages.filter(
    (m) =>
      m.role === "tool" ||
      m.role === "tool_call_result" ||
      (m.role === "tool" && m.name === "google_calendar_tool") ||
      m.name === "google_calendar_tool"
  );

  for (const msg of toolResults) {
    // Log brut pour debug
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: string = (msg as any).result ?? msg.content ?? "";
    console.log("[Debug] Tool message:", msg.name, raw.slice(0, 200));

    try {
      const parsed = JSON.parse(raw);

      // Format Google Calendar API : event avec id + start.dateTime
      const eventId: string | undefined =
        parsed?.id ?? parsed?.eventId ?? parsed?.event?.id ?? undefined;
      const startRaw: string | undefined =
        parsed?.start?.dateTime ??
        parsed?.start?.date ??
        parsed?.event?.start?.dateTime ??
        parsed?.event?.start?.date ??
        undefined;

      if (startRaw) {
        const startDate = new Date(startRaw);
        const date = new Intl.DateTimeFormat("fr-FR", {
          timeZone: "Europe/Paris",
          weekday: "long",
          day: "numeric",
          month: "long",
        }).format(startDate);
        const heure = new Intl.DateTimeFormat("fr-FR", {
          timeZone: "Europe/Paris",
          hour: "2-digit",
          minute: "2-digit",
        }).format(startDate);

        return { eventId, startIso: startRaw, date, heure };
      }
    } catch {
      // Contenu non-JSON, on ignore
    }
  }

  return null;
}

/**
 * Extrait le prénom du client depuis les arguments d'un tool_call google_calendar_tool.
 * Cherche dans le champ "summary" des args : "Intervention urgente - [Prénom]" ou "Client : [Prénom]".
 */
function extractNameFromCalendarArgs(
  messages: { role: string; content: string; name?: string }[]
): string | undefined {
  const toolCalls = messages.filter(
    (m) =>
      m.role === "tool_calls" ||
      m.role === "assistant" // les tool_calls sont parfois dans le rôle assistant
  );

  for (const msg of toolCalls) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (msg as any).toolCalls ?? (msg as any).tool_calls ?? [];
    const calls = Array.isArray(raw) ? raw : [];

    for (const tc of calls) {
      const fnName: string = tc?.function?.name ?? tc?.name ?? "";
      if (!fnName.includes("google_calendar")) continue;

      const argsRaw: string =
        typeof tc?.function?.arguments === "string"
          ? tc.function.arguments
          : JSON.stringify(tc?.function?.arguments ?? tc?.arguments ?? {});

      let args: Record<string, string> = {};
      try {
        args = JSON.parse(argsRaw);
      } catch {
        continue;
      }

      const summary: string = args.summary ?? args.title ?? "";
      console.log("[Debug] GCal tool_call summary:", summary);

      // Format auto-école prioritaire : "RDV permis B - Thomas Dupont, 0666073685, Paris"
      const permisMatch = summary.match(/RDV\s+permis\s+\w+\s*[-–]\s*([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)*)\s*,/i);
      if (permisMatch) {
        const candidate = permisMatch[1].trim();
        console.log("[Debug] Nom depuis RDV permis format:", candidate);
        return candidate;
      }

      // Format générique : "Intervention - Nom, tel, adresse"
      // → capture tout ce qui est entre le tiret et la première virgule comme nom complet
      const dashMatch = summary.match(/[-–]\s*([A-ZÀ-Ÿa-zà-ÿ][A-ZÀ-Ÿa-zà-ÿ\s]+?)\s*,/i);
      console.log("[Debug] dashMatch result:", dashMatch);
      if (dashMatch) {
        const candidate = dashMatch[1].trim();
        const MOTS_VOIE = new Set([
          "place", "places", "rue", "avenue", "boulevard", "impasse",
          "chemin", "route", "résidence", "villa", "allée", "voie", "cité",
        ]);
        const firstWord = candidate.split(" ")[0].toLowerCase();
        if (!MOTS_VOIE.has(firstWord) && !FAUX_PRENOMS.has(firstWord)) {
          return candidate;
        }
      }

      // "Client : Amal"
      const clientMatch = summary.match(/Client\s*:\s*([A-ZÀ-Ÿa-zà-ÿ]+)/i);
      if (clientMatch) return clientMatch[1].trim();
    }
  }
  return undefined;
}

/**
 * Extrait une adresse depuis la transcription.
 * Cherche un numéro + type de voie, ou un code postal français.
 */
/** Cherche une adresse française dans un texte libre. */
function extractAddressFromText(text: string): string | undefined {
  // 1. Numéro + voie + CP + ville optionnels : "14 place des Pervenches, 62300 Lens"
  const fullMatch = text.match(
    /(\d{1,4}\s+(?:rue|avenue|boulevard|place|impasse|allée|chemin|route|voie|cité|résidence)[^,\n]{0,60}),?\s*(\d{5})?\s*([A-ZÀ-Ÿa-zà-ÿ][a-zà-ÿ\-]{2,})?/i
  );
  if (fullMatch) {
    const voie = fullMatch[1].trim();
    const cp = fullMatch[2];
    const ville = fullMatch[3];
    if (cp && ville) return `${voie}, ${cp} ${ville}`;
    if (cp) return `${voie}, ${cp}`;
    return voie;
  }

  // 2. Type de voie sans numéro : "rue des Lilas", "place Saint-Michel"
  const voieSansNumMatch = text.match(
    /\b((?:place|rue|avenue|boulevard|impasse|allée|chemin|résidence)\s+(?:des?|du|la|les|saint|sainte)?\s*[A-ZÀ-Ÿa-zà-ÿ][a-zà-ÿ\s\-]{2,40})/i
  );
  if (voieSansNumMatch) return voieSansNumMatch[1].trim();

  // 3. Code postal + ville : "62300 Lens"
  const cpVilleMatch = text.match(/\b(\d{5})\s+([A-ZÀ-Ÿ][a-zà-ÿ\-]{2,})\b/);
  if (cpVilleMatch) return `${cpVilleMatch[1]} ${cpVilleMatch[2]}`;

  return undefined;
}

function extractAddressFromTranscript(transcript: string): string | undefined {
  return extractAddressFromText(transcript);
}

/**
 * Extrait une adresse depuis le summary d'un tool_call google_calendar_tool.
 * Format attendu : "Intervention [type] - [Nom], [téléphone], [adresse complète]"
 * Ex : "Intervention fuite d'eau - Amal, 0 six soixante-cinq..., 14 places des Pervenches, Résidence des Fleurs, 62300 Lens"
 *
 * Stratégie : après le tiret, on a "Nom, Téléphone, Adresse...".
 * On saute les 2 premiers éléments (nom + téléphone) et on prend le reste comme adresse.
 * Fallback : extractAddressFromText() sur le summary entier.
 */
function extractAddressFromCalendarSummary(
  messages: { role: string; content: string; name?: string }[]
): string | undefined {
  const toolCalls = messages.filter(
    (m) => m.role === "tool_calls" || m.role === "assistant"
  );
  for (const msg of toolCalls) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (msg as any).toolCalls ?? (msg as any).tool_calls ?? [];
    const calls = Array.isArray(raw) ? raw : [];
    for (const tc of calls) {
      const fnName: string = tc?.function?.name ?? tc?.name ?? "";
      if (!fnName.includes("google_calendar")) continue;
      const argsRaw: string =
        typeof tc?.function?.arguments === "string"
          ? tc.function.arguments
          : JSON.stringify(tc?.function?.arguments ?? tc?.arguments ?? {});
      let args: Record<string, string> = {};
      try { args = JSON.parse(argsRaw); } catch { continue; }
      const summary: string = args.summary ?? args.title ?? "";
      console.log("[Debug] GCal summary pour adresse:", summary);

      // Priorité 1 : format "Intervention X - Nom, Téléphone, Adresse..."
      // On isole ce qui vient après le tiret, puis on saute les 2 premiers segments
      const afterDash = summary.split(/[-–]/).slice(1).join("-").trim();
      if (afterDash) {
        const parts = afterDash.split(",").map((p) => p.trim()).filter(Boolean);
        // parts[0] = Nom, parts[1] = Téléphone, parts[2..] = Adresse
        if (parts.length >= 3) {
          const address = parts.slice(2).join(", ");
          console.log("[Debug] Adresse depuis GCal summary (format structuré):", address);
          return address;
        }
      }

      // Priorité 2 : recherche de pattern d'adresse dans le summary entier
      const found = extractAddressFromText(summary);
      if (found) {
        console.log("[Debug] Adresse depuis GCal summary (regex):", found);
        return found;
      }
    }
  }
  return undefined;
}

/** Extrait ville + code postal uniquement depuis une adresse complète ou la transcription. */
function extractVille(address: string | undefined, transcript: string): string | undefined {
  // 1. CP + ville dans l'adresse passée
  if (address) {
    const m = address.match(/\b(\d{5})\s+([A-ZÀ-Ÿ][a-zà-ÿ\-]{2,})\b/);
    if (m) return `${m[1]} ${m[2]}`;
    // Dernier segment après virgule si pas de CP
    const parts = address.split(",");
    if (parts.length >= 2) {
      const last = parts[parts.length - 1].trim();
      if (/^[A-ZÀ-Ÿ][a-zà-ÿ\-]{2,}/.test(last)) return last;
    }
  }
  // 2. CP + ville dans la transcription
  const cpVille = transcript.match(/\b(\d{5})\s+([A-ZÀ-Ÿ][a-zà-ÿ\-]{2,})\b/);
  if (cpVille) return `${cpVille[1]} ${cpVille[2]}`;
  // 3. "j'habite à [ville]", "je suis à [ville]"
  const habite = transcript.match(/(?:j['']habite|je\s+suis\s+[àa]|domicilié\s+[àa])\s+(?:[àa]\s+)?([A-ZÀ-Ÿ][a-zà-ÿ\-]{2,})/i);
  if (habite) return habite[1];
  return undefined;
}

/** Extrait le type de permis recherché depuis la transcription. */
function extractPermis(transcript: string): string | undefined {
  // "permis B", "permis A2", "permis AM", etc.
  const withPermis = transcript.match(/permis\s+([A-Z][A-Z0-9E]?|AM|BE)\b/i);
  if (withPermis) return withPermis[1].toUpperCase();
  // Mention isolée dans contexte auto-école
  const isolé = transcript.match(/\b(A2|AM|BE)\b/);
  if (isolé) return isolé[1].toUpperCase();
  return undefined;
}

/** Extrait l'ancienne auto-école depuis la transcription (si le client en mentionne une). */
function extractAncienneAutoEcole(transcript: string): string | undefined {
  const patterns = [
    /(?:j'étais|étais inscrit|inscrit)\s+(?:chez|dans|[àa] l['']auto-école)\s+([A-ZÀ-Ÿ][a-zà-ÿ\s\-]{2,30})/i,
    /(?:ancienne|précédente)\s+auto-école\s*:\s*([A-ZÀ-Ÿ][a-zà-ÿ\s\-]{2,30})/i,
    /auto-école\s+([A-ZÀ-Ÿ][a-zà-ÿ\s\-]{2,30})(?:\s+avant|\s+précédemment|\s+auparavant)/i,
    /(?:chez|dans)\s+(?:l['']auto-école\s+)?([A-ZÀ-Ÿ][a-zà-ÿ\s\-]{2,30})\s+(?:avant|auparavant|précédemment)/i,
  ];
  for (const re of patterns) {
    const m = transcript.match(re);
    if (m) return m[1].trim();
  }
  return undefined;
}

/** Extrait le type de formation recherché parmi les 4 options proposées. */
function extractFormation(transcript: string): string | undefined {
  if (/formation\s+compl[eè]te|de\s+A\s+[àa]\s+Z/i.test(transcript))
    return "Formation complète de A à Z";
  if (/code\s+de\s+la\s+route\s+uniquement|pr[eé]p(?:aration)?\s+(?:au|pour\s+le)\s+code/i.test(transcript))
    return "Préparation au code de la route uniquement";
  if (/heures?\s+de\s+conduite\s+suppl[eé]mentaires?/i.test(transcript))
    return "Heures de conduite supplémentaires";
  if (/examen\s+pratique\s+uniquement|pr[eé]p(?:aration)?\s+[àa]\s+l['']examen\s+pratique/i.test(transcript))
    return "Préparation à l'examen pratique uniquement";
  return undefined;
}

/**
 * Génère un résumé structuré de l'appel quand report.summary est vide.
 * Format auto-école : Client / Téléphone / Ville / Permis / Ancienne auto-école / Formation / RDV.
 * Affiche "Non communiqué" pour chaque champ manquant.
 */
function generateSummary(
  transcript: string,
  rdvInfo: { date: string; heure?: string } | null,
  clientName: string | undefined,
  clientPhone?: string,
  clientAddress?: string,
  messages?: { role: string; content: string; name?: string }[]
): string {
  const nc = "Non communiqué";

  const nom = clientName ?? nc;
  const tel = clientPhone ?? nc;
  const ville = extractVille(clientAddress, transcript) ?? nc;
  const permis = extractPermis(transcript) ?? nc;
  const ancienneEcole = extractAncienneAutoEcole(transcript);
  const formation = extractFormation(transcript) ?? nc;

  // RDV : priorité au rdvInfo fourni, sinon relit les tool results
  let resolvedRdvInfo = rdvInfo;
  if (!resolvedRdvInfo && messages && messages.length > 0) {
    resolvedRdvInfo = extractCalendarEvent(messages);
  }
  const rdv = resolvedRdvInfo
    ? `${resolvedRdvInfo.date}${resolvedRdvInfo.heure ? ` à ${resolvedRdvInfo.heure}` : ""}`
    : nc;

  const lines = [
    `Client : ${nom}`,
    `Téléphone : ${tel}`,
    `Ville : ${ville}`,
    `Permis : ${permis}`,
    ancienneEcole ? `Ancienne auto-école : ${ancienneEcole}` : null,
    `Formation recherchée : ${formation}`,
    `RDV : ${rdv}`,
  ].filter(Boolean);

  return lines.join(". ") + ".";
}

/** Mots à exclure des captures de prénom (faux positifs fréquents) */
const FAUX_PRENOMS = new Set([
  "beaucoup", "pour", "de", "votre", "bien", "donc", "alors",
  "d'avoir", "infiniment", "monsieur", "madame", "mademoiselle",
  "vous", "nous", "tout", "trop", "encore", "quand", "même",
  "monstre", "hamal", "amhal", "m", "mme", "mr",
  "précisions", "remercie", "plaisir", "confiance",
  "possible", "urgente", "urgence", "intervention",
  "demain", "aujourd", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche",
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
  "voici", "parfait", "entendu",
  "place", "places", "rue", "avenue", "boulevard", "impasse", "chemin", "route", "résidence", "villa",
]);

/**
 * Extrait le prénom/nom du client depuis une transcription.
 * Cherche dans les répliques du client ET dans les "Merci [Prénom]" du bot.
 */
function extractNameFromTranscript(transcript: string): string | undefined {
  // Patterns ordonnés par fiabilité décroissante
  const patterns: RegExp[] = [
    // PRIORITÉ ABSOLUE 1 — correction de nom : User dit "c'est [Prénom Nom]" ou "je m'appelle [Prénom Nom]"
    // Couvre le cas où l'IA a dit "Merci [mauvais prénom]" et le client corrige
    /User\s*:.*?c['']est\s+([A-ZÀ-Ÿ][a-zà-ÿ]+\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)/im,
    // PRIORITÉ ABSOLUE 2 — ligne "User:" contenant uniquement prénom + nom répété deux fois
    // Ex : "User: Thomas Dupont Thomas Dupont" → "Thomas Dupont"
    /^User\s*:\s*([A-ZÀ-Ÿ][a-zà-ÿ]{1,20}\s+[A-ZÀ-Ÿ][a-zà-ÿ]{1,20})\s+\1\s*[.!]?\s*$/m,
    // PRIORITÉ ABSOLUE 3 — ligne "User:" contenant uniquement prénom + nom (sans autre texte)
    // Ex : "User: Thomas Dupont" → "Thomas Dupont"
    /^User\s*:\s*([A-ZÀ-Ÿ][a-zà-ÿ]{1,20}\s+[A-ZÀ-Ÿ][a-zà-ÿ]{1,20})\s*[.!]?\s*$/m,
    // Déclarations explicites du client
    /(?:^|User\s*:\s*).*?je m['']appelle\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/im,
    /(?:^|User\s*:\s*).*?mon nom c['']est\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/im,
    /(?:^|User\s*:\s*).*?mon nom est\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/im,
    /je m['']appelle\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/i,
    /c['']est\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)\s+(?:à|de|qui)/i,
    /mon nom est\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/i,
    // "Merci [Prénom]" dans les réponses du bot (avec filtre faux positifs)
    /\bmerci\s+([A-ZÀ-Ÿ][a-zà-ÿ]+)(?:\s*[!,.])?/i,
    // "Au revoir [Prénom]", "Bonne journée [Prénom]"
    /(?:au revoir|bonne journée|à bientôt)\s*,?\s+([A-ZÀ-Ÿ][a-zà-ÿ]+)/i,
  ];

  for (const re of patterns) {
    const match = transcript.match(re);
    if (match) {
      const candidate = match[1].trim().toLowerCase();
      if (!FAUX_PRENOMS.has(candidate)) {
        // Capitalise la première lettre
        return match[1].trim().replace(/^\w/, (c) => c.toUpperCase());
      }
    }
  }
  return undefined;
}
