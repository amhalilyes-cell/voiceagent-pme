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

      // Calcul de la durée en secondes
      let durationSeconds: number | undefined;
      if (call.startedAt && call.endedAt) {
        durationSeconds = Math.round(
          (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000
        );
      }

      // Date de l'appel en Europe/Paris
      const callDate = call.startedAt ?? call.endedAt;
      const callDateParis = callDate ? toParisTime(callDate) : undefined;

      // Détection RDV pour le SMS et la sauvegarde
      const rdvInfo = extractRdvFromText(report.summary + " " + report.transcript);
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
      if (rdvInfo && clientPhone) {
        const clientName = call.customer?.name ?? extractNameFromTranscript(report.transcript) ?? "Client";
        const companyName = process.env.ARTISAN_COMPANY_NAME ?? "votre artisan";
        try {
          await sendConfirmationSMS({
            clientName,
            clientPhone,
            rdvDate: rdvInfo.date,
            rdvHeure: rdvInfo.heure,
            companyName,
          });
          console.log(`[Vapi] SMS de confirmation envoyé à ${clientPhone}`);
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

/**
 * Extrait une date et une heure de RDV depuis un texte libre (résumé ou transcription).
 * Retourne null si aucun RDV n'est détecté.
 */
function extractRdvFromText(text: string): { date: string; heure?: string } | null {
  // Cherche "rendez-vous le <date>" ou "RDV le <date>"
  const rdvPattern = /(?:rendez-vous|rdv)[^.]*?(?:le|du|pour le)\s+([^,.]{4,40})/i;
  const rdvMatch = text.match(rdvPattern);
  if (!rdvMatch) return null;

  const raw = rdvMatch[1].trim();

  // Tente d'extraire une heure séparément depuis le même segment
  const heureMatch = raw.match(/[àa]\s*(\d{1,2}[h:]\d{0,2})/i) ??
    text.match(/[àa]\s*(\d{1,2}[h:]\d{0,2})/i);
  const heure = heureMatch ? heureMatch[1].replace(":", "h") : undefined;

  // Nettoie la date (retire l'heure si elle est collée)
  const date = raw.replace(/[àa]\s*\d{1,2}[h:]\d{0,2}/i, "").trim();

  return { date, heure };
}

/**
 * Extrait le prénom/nom du client depuis une transcription.
 */
function extractNameFromTranscript(transcript: string): string | undefined {
  const patterns = [
    /je m['']appelle\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/i,
    /c['']est\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)\s+(?:à|de|qui)/i,
    /mon nom est\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/i,
  ];
  for (const re of patterns) {
    const match = transcript.match(re);
    if (match) return match[1];
  }
  return undefined;
}
