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
        durationSeconds = report.durationSeconds;
      } else if (call.startedAt && call.endedAt) {
        durationSeconds = Math.round(
          (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
        );
      }

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

      const rdvInfo = extractRdvFromText(rdvCorpus);
      const rdvMentioned = /\b(?:rendez-vous|rdv)\b/i.test(rdvCorpus);
      const rdvText = rdvInfo
        ? `${rdvInfo.date}${rdvInfo.heure ? ` à ${rdvInfo.heure}` : ""}`
        : undefined;

      // Recherche de l'artisan pour lier l'appel
      let artisanId: string | undefined;
      try {
        const artisan = await findArtisanByVapiAssistantId(call.assistantId);
        artisanId = artisan?.id;
      } catch (err) {
        console.warn(`[Vapi] Artisan introuvable pour assistantId ${call.assistantId}:`, err);
      }

      // Sauvegarde dans Supabase
      try {
        await saveCall({
          artisanId,
          vapiCallId: call.id,
          clientName: call.customer?.name,
          clientPhone,
          durationSeconds,
          summary: report.summary,
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
          clientName: call.customer?.name,
          clientPhone,
          summary: report.summary,
          transcript: report.transcript,
          durationSeconds,
          recordingUrl: report.recordingUrl,
          rdv: rdvText,
          callDate: callDate,
        });
        console.log(`[Vapi] Email de rapport envoyé pour l'appel ${call.id} (${callDateParis})`);
      } catch (err) {
        console.error(`[Vapi] Échec envoi email pour l'appel ${call.id}:`, err);
      }

      // Envoi SMS de confirmation si un RDV est détecté
      if ((rdvInfo || rdvMentioned) && clientPhone) {
        const clientName = call.customer?.name ?? extractNameFromTranscript(report.transcript) ?? "Client";
        const companyName = process.env.ARTISAN_COMPANY_NAME ?? "votre artisan";
        try {
          await sendConfirmationSMS({
            clientName,
            clientPhone,
            rdvDate: rdvInfo?.date,
            rdvHeure: rdvInfo?.heure,
            companyName,
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
 * Extrait le prénom/nom du client depuis une transcription.
 * Cherche dans les répliques du client ET dans les "Merci [Prénom]" du bot.
 */
function extractNameFromTranscript(transcript: string): string | undefined {
  const patterns = [
    // Déclarations du client
    /je m['']appelle\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/i,
    /c['']est\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)\s+(?:à|de|qui)/i,
    /mon nom est\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/i,
    // "Merci [Prénom]" ou "Merci [Prénom] !" dans les réponses du bot
    /\bmerci\s+([A-ZÀ-Ÿ][a-zà-ÿ]+)(?:\s*[!,.])?/i,
    // "Au revoir [Prénom]", "Bonne journée [Prénom]"
    /(?:au revoir|bonne journée|à bientôt)\s*,?\s+([A-ZÀ-Ÿ][a-zà-ÿ]+)/i,
  ];
  for (const re of patterns) {
    const match = transcript.match(re);
    if (match) return match[1];
  }
  return undefined;
}
