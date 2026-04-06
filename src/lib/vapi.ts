// Version 3 - 05/04/2026
import crypto from "crypto";
import type { VapiWebhookEvent, VapiFunctionCallResponse } from "@/types/vapi";
import { sendCallReport } from "@/lib/email";
import { sendConfirmationSMS } from "@/lib/sms";
import { saveCall, findArtisanByVapiAssistantId } from "@/lib/storage";

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
      const clientNameFromGcal = extractNameFromCalendarArgs(report.messages ?? []);
      const clientName =
        call.customer?.name ??
        clientNameFromGcal ??
        extractNameFromTranscript(report.transcript);

      // ── Debug ──────────────────────────────────────────
      console.log("[Debug] clientPhone:", clientPhone);
      console.log("[Debug] clientName:", call.customer?.name);
      console.log("[Debug] clientNameFromGcal:", clientNameFromGcal);
      console.log("[Debug] durationSeconds:", report.durationSeconds, durationSeconds);
      console.log("[Debug] extractedName:", extractNameFromTranscript(report.transcript));
      // ───────────────────────────────────────────────────

      // Date de l'appel en Europe/Paris
      const callDate = call.startedAt ?? call.endedAt;
      const callDateParis = callDate ? toParisTime(callDate) : undefined;

      // Corpus élargi pour la détection RDV : summary + transcript + messages du bot
      const botMessagesText = (report.messages ?? [])
        .filter((m) => m.role === "assistant")
        .map((m) => m.content)
        .join(" ");
      const rdvCorpus = [report.summary, report.transcript, botMessagesText]
        .filter(Boolean)
        .join(" ");

      // Recherche d'un événement Google Calendar confirmé dans les tool results
      const calendarEvent = extractCalendarEvent(report.messages ?? []);
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

      // Résumé : utilise report.summary si disponible, sinon génère depuis la transcription
      const summary =
        report.summary?.trim() ||
        generateSummary(report.transcript, rdvInfo, clientName);
      console.log("[Debug] summary utilisé:", summary);

      // Adresse extraite de la transcription
      const clientAddress = extractAddressFromTranscript(report.transcript);

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
          transcript: report.transcript,
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
          transcript: report.transcript,
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

      // "Intervention urgente - Amal" ou "RDV plomberie – Amal"
      const dashMatch = summary.match(/[-–]\s*([A-ZÀ-Ÿa-zà-ÿ]+)\s*$/i);
      console.log("[Debug] dashMatch result:", dashMatch);
      if (dashMatch) return dashMatch[1].trim();

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
function extractAddressFromTranscript(transcript: string): string | undefined {
  // 1. Numéro + type de voie élargi (cité, résidence, hameau, lieu-dit…)
  const voieNumMatch = transcript.match(
    /(\d{1,4}\s+(?:rue|avenue|boulevard|place|impasse|allée|chemin|route|voie|cité|résidence|hameau|lieu-dit)[^,\n]{0,60})/i
  );
  if (voieNumMatch) return voieNumMatch[1].trim();

  // 2. Type de voie sans numéro : "rue des Lilas", "place Saint-Michel"
  const voieSansNumMatch = transcript.match(
    /(?:place|rue|avenue|boulevard|impasse|allée|chemin|résidence)\s+(?:des?|du|la|les|saint|sainte)?\s*[A-ZÀ-Ÿa-zà-ÿ][^,\n]{0,50}/i
  );
  if (voieSansNumMatch) return voieSansNumMatch[0].trim();

  // 3. Code postal + ville : "75001 Paris", "69003 Lyon"
  const cpVilleMatch = transcript.match(
    /\b(\d{5})\s+([A-ZÀ-Ÿa-zà-ÿ][a-zà-ÿ\-]{2,})\b/
  );
  if (cpVilleMatch) return `${cpVilleMatch[1]} ${cpVilleMatch[2]}`;

  // 4. Code postal seul en dernier recours
  const cpMatch = transcript.match(/\b(\d{5})\b/);
  if (cpMatch) return cpMatch[1];

  return undefined;
}

/**
 * Génère un résumé court de l'appel quand report.summary est vide.
 * Exemple : "Client : Amhal. Demande : Intervention urgente pour fuite d'eau. RDV confirmé le lundi 6 avril à 9h."
 */
function generateSummary(
  transcript: string,
  rdvInfo: { date: string; heure?: string } | null,
  clientName: string | undefined
): string {
  const parts: string[] = [];

  // Ligne client
  if (clientName) parts.push(`Client : ${clientName}.`);

  // Nature de la demande : cherche la première phrase significative du client
  const demandePatterns = [
    /User\s*:\s*([^.\n]{10,120})/i,
    /(?:j'ai|j'aurais|je voudrais|il y a|c'est pour|c'est urgent|fuite|panne|problème|besoin)[^.\n]{0,100}/i,
  ];
  let demande: string | undefined;
  for (const re of demandePatterns) {
    const m = transcript.match(re);
    if (m) {
      demande = (m[1] ?? m[0]).trim().replace(/^User\s*:\s*/i, "");
      // Tronque à 100 chars
      if (demande.length > 100) demande = demande.slice(0, 97) + "...";
      break;
    }
  }
  if (demande) parts.push(`Demande : ${demande}.`);

  // Adresse
  const adresse = extractAddressFromTranscript(transcript);
  if (adresse) parts.push(`Adresse : ${adresse}.`);

  // RDV
  if (rdvInfo) {
    const heureStr = rdvInfo.heure ? ` à ${rdvInfo.heure}` : "";
    parts.push(`RDV confirmé le ${rdvInfo.date}${heureStr}.`);
  }

  return parts.length > 0 ? parts.join(" ") : "Appel traité par l'assistant vocal.";
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
]);

/**
 * Extrait le prénom/nom du client depuis une transcription.
 * Cherche dans les répliques du client ET dans les "Merci [Prénom]" du bot.
 */
function extractNameFromTranscript(transcript: string): string | undefined {
  // Patterns ordonnés par fiabilité décroissante
  const patterns: RegExp[] = [
    // Déclarations explicites du client (lignes "User:" ou texte brut)
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
