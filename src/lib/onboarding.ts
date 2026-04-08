import { Resend } from "resend";
import type { Artisan } from "@/types/artisan";

const VAPI_BASE_URL = "https://api.vapi.ai";
const APP_URL = "https://voiceagent-pme.vercel.app";

// ─────────────────────────────────────────────
// 1. VAPI — Création de l'assistant
// ─────────────────────────────────────────────

export async function createVapiAssistant(artisan: Artisan): Promise<string> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) throw new Error("[Onboarding] VAPI_API_KEY manquante");

  const now = new Date();
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

  const systemPrompt = `IMPORTANT : Nous sommes le ${dateParis} et il est ${heureParis} heure de Paris. Tu DOIS utiliser cette date et cette heure. Ne propose jamais un créneau avant ${heureParis}.

Tu es l'assistant vocal de ${artisan.nomEntreprise}, une entreprise de ${artisan.metier} basée en France.
Tu réponds aux appels des clients de manière professionnelle, chaleureuse et efficace.

Quand tu accueilles le client dis exactement : "Bonjour, vous avez bien joint ${artisan.nomEntreprise}, je suis l'assistant vocal de ${artisan.prenom}, comment puis-je vous aider ?"

Tes objectifs :
1. Accueillir le client et identifier sa demande
2. Prendre des rendez-vous si le client le souhaite (demande ses disponibilités et coordonnées)
3. Répondre aux questions courantes sur les services proposés
4. Collecter le nom, numéro de téléphone et adresse du client pour que l'artisan le rappelle si nécessaire

Informations importantes :
- Entreprise : ${artisan.nomEntreprise}
- Secteur : ${artisan.metier}
- Responsable : ${artisan.prenom} ${artisan.nom}
- Téléphone de l'entreprise : ${artisan.telephone}

Règles :
- Parle TOUJOURS en français, avec un accent naturel et professionnel
- Sois concis : les appels doivent durer moins de 5 minutes
- Si tu prends un RDV, confirme la date, l'heure et le lieu, puis utilise l'outil google_calendar_tool pour l'enregistrer
- Quand tu crées un événement dans le calendrier, mets dans le champ summary : "Intervention ${artisan.metier} - [Nom client], [téléphone], [adresse]"
- Termine toujours par "Merci et à bientôt !"`;

  const calendarServerUrl = `${APP_URL}/api/calendar`;
  const artisanRefreshToken = artisan.refreshToken ?? process.env.GOOGLE_REFRESH_TOKEN ?? "";

  const body = {
    name: `Assistant ${artisan.nomEntreprise}`,
    model: {
      provider: "openai",
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }],
      temperature: 0.7,
    },
    voice: {
      provider: "azure",
      voiceId: "fr-FR-DeniseNeural",
    },
    transcriber: {
      provider: "deepgram",
      language: "fr",
      model: "nova-2",
    },
    tools: [
      {
        type: "function",
        function: {
          name: "google_calendar_tool",
          description: "Crée un rendez-vous dans l'agenda Google Calendar de l'artisan. Utilise cet outil dès qu'un RDV est confirmé avec le client.",
          parameters: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                description: "Titre de l'événement. Format : 'Intervention [métier] - [Nom], [téléphone], [adresse]'",
              },
              date: {
                type: "string",
                description: "Date du RDV au format YYYY-MM-DD (ex: 2025-04-15)",
              },
              time: {
                type: "string",
                description: "Heure du RDV au format HH:MM (ex: 14:00)",
              },
              duration: {
                type: "number",
                description: "Durée en minutes (défaut: 60)",
              },
              clientName: {
                type: "string",
                description: "Prénom et nom du client",
              },
              clientPhone: {
                type: "string",
                description: "Numéro de téléphone du client",
              },
              serviceType: {
                type: "string",
                description: "Type d'intervention ou de service demandé",
              },
            },
            required: ["summary", "date", "time", "clientName"],
          },
        },
        server: {
          url: calendarServerUrl,
          headers: {
            "x-google-refresh-token": artisanRefreshToken,
          },
        },
      },
    ],
    firstMessage: `Bonjour, vous avez bien joint ${artisan.nomEntreprise}, je suis l'assistant vocal de ${artisan.prenom}, comment puis-je vous aider ?`,
    endCallMessage: "Merci de votre appel et à bientôt !",
    serverUrl: `${APP_URL}/api/vapi/webhook`,
    serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET,
  };

  const res = await fetch(`${VAPI_BASE_URL}/assistant`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[Onboarding] Vapi createAssistant échoué: ${err}`);
  }

  const data = await res.json();
  console.log(`[Onboarding] Assistant Vapi créé: ${data.id} pour ${artisan.nomEntreprise}`);
  return data.id as string;
}

// ─────────────────────────────────────────────
// 2. TWILIO — Achat et liaison du numéro
// ─────────────────────────────────────────────

async function searchAvailableNumber(
  accountSid: string,
  auth: string,
  country: "FR" | "US"
): Promise<string | null> {
  const type = country === "FR" ? "Local" : "Local";
  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/AvailablePhoneNumbers/${country}/${type}.json?VoiceEnabled=true&Limit=1`;
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` } });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.available_phone_numbers?.[0]?.phone_number as string) ?? null;
}

async function purchaseNumber(
  accountSid: string,
  auth: string,
  phoneNumber: string
): Promise<void> {
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ PhoneNumber: phoneNumber }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[Onboarding] Twilio achat échoué pour ${phoneNumber}: ${err}`);
  }
}

async function importNumberToVapi(
  accountSid: string,
  authToken: string,
  phoneNumber: string,
  vapiAssistantId: string
): Promise<void> {
  const vapiKey = process.env.VAPI_API_KEY;
  if (!vapiKey) return;

  const res = await fetch(`${VAPI_BASE_URL}/phone-number`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${vapiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      provider: "twilio",
      number: phoneNumber,
      twilioAccountSid: accountSid,
      twilioAuthToken: authToken,
      assistantId: vapiAssistantId,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    // Non-bloquant : le numéro est acheté mais pas encore relié à Vapi
    console.error(`[Onboarding] Vapi phone-number import échoué (non-bloquant): ${err}`);
  } else {
    console.log(`[Onboarding] Numéro ${phoneNumber} importé dans Vapi et relié à l'assistant ${vapiAssistantId}`);
  }
}

export async function provisionPhoneNumber(vapiAssistantId: string): Promise<string> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!accountSid || !authToken) {
    throw new Error("[Onboarding] TWILIO_ACCOUNT_SID ou TWILIO_AUTH_TOKEN manquant");
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  // Cherche d'abord en France
  let phoneNumber = await searchAvailableNumber(accountSid, auth, "FR");
  if (!phoneNumber) {
    console.warn("[Onboarding] Aucun numéro FR disponible, bascule sur US");
    phoneNumber = await searchAvailableNumber(accountSid, auth, "US");
  }
  if (!phoneNumber) {
    throw new Error("[Onboarding] Aucun numéro disponible (FR ou US)");
  }

  await purchaseNumber(accountSid, auth, phoneNumber);
  console.log(`[Onboarding] Numéro Twilio acheté: ${phoneNumber}`);

  await importNumberToVapi(accountSid, authToken, phoneNumber, vapiAssistantId);

  return phoneNumber;
}

// ─────────────────────────────────────────────
// 3. EMAIL — Bienvenue avec guide d'activation
// ─────────────────────────────────────────────

function buildWelcomeHtml(artisan: Artisan, phoneNumber: string): string {
  const dashboardUrl = `${APP_URL}/dashboard/accueil`;
  const callForwardCode = `**21*${phoneNumber}#`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
</head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%);border-radius:16px 16px 0 0;padding:32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="display:inline-flex;align-items:center;gap:10px;">
                    <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:10px;display:inline-block;text-align:center;line-height:36px;">
                      <span style="color:#fff;font-weight:700;font-size:16px;">V</span>
                    </div>
                    <span style="color:#fff;font-weight:700;font-size:16px;margin-left:8px;">VoiceAgent PME</span>
                  </div>
                  <p style="color:#bfdbfe;font-size:13px;margin:8px 0 0;">Votre assistant vocal est prêt !</p>
                </td>
                <td align="right">
                  <span style="background:rgba(255,255,255,0.15);color:#fff;font-size:12px;padding:5px 14px;border-radius:20px;font-weight:600;">✅ Activé</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#fff;padding:36px 32px;">

            <h2 style="margin:0 0 8px;font-size:22px;color:#111827;font-weight:700;">
              Bienvenue, ${artisan.prenom} ! 🎉
            </h2>
            <p style="margin:0 0 28px;color:#6b7280;font-size:15px;line-height:1.6;">
              Votre assistant vocal <strong>${artisan.nomEntreprise}</strong> est maintenant configuré et prêt à répondre à vos clients.
            </p>

            <!-- Numéro dédié -->
            <div style="background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);border:2px solid #bfdbfe;border-radius:14px;padding:24px;margin-bottom:28px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#1d4ed8;text-transform:uppercase;letter-spacing:.08em;">Votre numéro dédié</p>
              <p style="margin:0;font-size:32px;font-weight:800;color:#1e3a8a;letter-spacing:.02em;">${phoneNumber}</p>
              <p style="margin:8px 0 0;font-size:13px;color:#3b82f6;">Ce numéro est relié à votre assistant vocal VoiceAgent</p>
            </div>

            <!-- Guide de renvoi d'appel -->
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:24px;margin-bottom:28px;">
              <h3 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#14532d;">
                📱 Activer le renvoi d'appel sur votre téléphone
              </h3>
              <p style="margin:0 0 16px;color:#166534;font-size:14px;line-height:1.6;">
                Pour que votre assistant reçoive vos appels manqués, activez le renvoi depuis votre mobile en tapant ce code :
              </p>

              <div style="background:#fff;border:2px solid #86efac;border-radius:10px;padding:16px 20px;text-align:center;margin-bottom:16px;">
                <p style="margin:0 0 4px;font-size:12px;color:#6b7280;font-weight:600;">CODE À COMPOSER</p>
                <p style="margin:0;font-size:24px;font-weight:800;color:#15803d;font-family:monospace;letter-spacing:.05em;">${callForwardCode}</p>
              </div>

              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;">
                    <span style="display:inline-block;width:22px;height:22px;background:#22c55e;border-radius:50%;text-align:center;line-height:22px;color:#fff;font-size:12px;font-weight:700;margin-right:8px;">1</span>
                    <span style="color:#166534;font-size:14px;">Ouvrez le clavier de votre téléphone</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;">
                    <span style="display:inline-block;width:22px;height:22px;background:#22c55e;border-radius:50%;text-align:center;line-height:22px;color:#fff;font-size:12px;font-weight:700;margin-right:8px;">2</span>
                    <span style="color:#166534;font-size:14px;">Composez <strong>${callForwardCode}</strong></span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;">
                    <span style="display:inline-block;width:22px;height:22px;background:#22c55e;border-radius:50%;text-align:center;line-height:22px;color:#fff;font-size:12px;font-weight:700;margin-right:8px;">3</span>
                    <span style="color:#166534;font-size:14px;">Appuyez sur "Appel" — une confirmation apparaît</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:6px 0;">
                    <span style="display:inline-block;width:22px;height:22px;background:#22c55e;border-radius:50%;text-align:center;line-height:22px;color:#fff;font-size:12px;font-weight:700;margin-right:8px;">4</span>
                    <span style="color:#166534;font-size:14px;">C'est tout ! Vos appels manqués seront pris en charge</span>
                  </td>
                </tr>
              </table>

              <p style="margin:14px 0 0;font-size:12px;color:#4ade80;background:#14532d;padding:8px 12px;border-radius:6px;display:inline-block;">
                💡 Pour désactiver : composez <strong>##21#</strong>
              </p>
            </div>

            <!-- Ce qui va se passer -->
            <div style="margin-bottom:28px;">
              <h3 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#111827;">🤖 Ce que fait votre assistant</h3>
              <table width="100%" cellpadding="0" cellspacing="0">
                ${[
                  ["📞", "Répond à vos appels manqués en français, 24h/24"],
                  ["📅", "Prend des rendez-vous directement dans votre agenda Google"],
                  ["📝", "Vous envoie un rapport d'appel après chaque conversation"],
                  ["💬", "Collecte les coordonnées de vos clients potentiels"],
                ].map(([icon, text]) => `
                <tr>
                  <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
                    <span style="font-size:16px;margin-right:10px;">${icon}</span>
                    <span style="color:#374151;font-size:14px;">${text}</span>
                  </td>
                </tr>`).join("")}
              </table>
            </div>

            <!-- CTA -->
            <div style="text-align:center;margin-bottom:8px;">
              <a href="${dashboardUrl}"
                style="display:inline-block;background:#2563eb;color:#fff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;letter-spacing:.01em;">
                Accéder à mon tableau de bord →
              </a>
            </div>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
              Une question ? Répondez directement à cet email.<br>
              <strong style="color:#6b7280;">${artisan.nomEntreprise}</strong> — abonnement VoiceAgent PME actif
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendWelcomeEmail(artisan: Artisan, phoneNumber: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("[Onboarding] RESEND_API_KEY manquante");

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL ?? "notifications@voiceagentpme.fr";

  const { error } = await resend.emails.send({
    from,
    to: artisan.email,
    subject: `✅ Votre assistant vocal ${artisan.nomEntreprise} est prêt — numéro : ${phoneNumber}`,
    html: buildWelcomeHtml(artisan, phoneNumber),
  });

  if (error) {
    throw new Error(`[Onboarding] Resend error: ${JSON.stringify(error)}`);
  }

  console.log(`[Onboarding] Email de bienvenue envoyé à ${artisan.email}`);
}

// ─────────────────────────────────────────────
// 4. VAPI — Pause / Réactivation
// ─────────────────────────────────────────────

export async function setVapiAssistantActive(assistantId: string, active: boolean): Promise<void> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) throw new Error("[Vapi] VAPI_API_KEY manquante");

  const res = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ isActive: active }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`[Vapi] setAssistantActive(${active}) échoué pour ${assistantId}: ${err}`);
  }

  console.log(`[Vapi] Assistant ${assistantId} ${active ? "réactivé" : "mis en pause"}`);
}

// ─────────────────────────────────────────────
// 5. EMAIL — Essai gratuit (au moment de l'inscription)
// ─────────────────────────────────────────────

const TEST_PHONE = "+1 501 512 2960";
const TEST_PHONE_RAW = "+15015122960";

function buildTrialWelcomeHtml(artisan: Artisan): string {
  const dashboardUrl = `${APP_URL}/dashboard/accueil`;
  const callForwardCode = `**21*${TEST_PHONE_RAW}#`;

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed 0%,#6d28d9 100%);border-radius:16px 16px 0 0;padding:32px;">
            <div style="display:inline-flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:10px;display:inline-block;text-align:center;line-height:36px;">
                <span style="color:#fff;font-weight:700;font-size:16px;">V</span>
              </div>
              <span style="color:#fff;font-weight:700;font-size:16px;margin-left:8px;">VoiceAgent PME</span>
            </div>
            <p style="color:#ddd6fe;font-size:13px;margin:8px 0 0;">Votre essai gratuit de 7 jours commence maintenant</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#fff;padding:36px 32px;">
            <h2 style="margin:0 0 8px;font-size:22px;color:#111827;font-weight:700;">
              Bienvenue, ${artisan.prenom} ! 🎉
            </h2>
            <p style="margin:0 0 28px;color:#6b7280;font-size:15px;line-height:1.6;">
              Votre assistant vocal de test est configuré. Testez-le dès maintenant en l'appelant ou en activant le renvoi d'appel sur votre téléphone.
            </p>

            <!-- Numéro de test -->
            <div style="background:linear-gradient(135deg,#f5f3ff 0%,#ede9fe 100%);border:2px solid #c4b5fd;border-radius:14px;padding:24px;margin-bottom:28px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:.08em;">Numéro de test</p>
              <p style="margin:0;font-size:28px;font-weight:800;color:#4c1d95;letter-spacing:.02em;">${TEST_PHONE}</p>
              <p style="margin:8px 0 0;font-size:13px;color:#6d28d9;">Appelez ce numéro pour tester votre assistant vocal</p>
            </div>

            <!-- Guide de renvoi d'appel -->
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:24px;margin-bottom:28px;">
              <h3 style="margin:0 0 14px;font-size:15px;font-weight:700;color:#14532d;">
                📱 Activer le renvoi d'appel maintenant
              </h3>
              <p style="margin:0 0 16px;color:#166534;font-size:14px;line-height:1.6;">
                Pour que l'assistant réponde à vos vrais clients pendant l'essai, activez le renvoi d'appel :
              </p>
              <div style="background:#fff;border:2px solid #86efac;border-radius:10px;padding:16px 20px;text-align:center;margin-bottom:14px;">
                <p style="margin:0 0 4px;font-size:12px;color:#6b7280;font-weight:600;">CODE À COMPOSER</p>
                <p style="margin:0;font-size:22px;font-weight:800;color:#15803d;font-family:monospace;">${callForwardCode}</p>
              </div>
              <p style="margin:0;font-size:12px;color:#166534;">
                Pour désactiver : <strong>##21#</strong>
              </p>
            </div>

            <!-- Après l'essai -->
            <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:12px;padding:20px;margin-bottom:28px;">
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#92400e;">📦 Après votre essai gratuit</p>
              <p style="margin:0;font-size:13px;color:#92400e;line-height:1.6;">
                En souscrivant à l'offre VoiceAgent PME (500 €/mois), vous recevrez un <strong>numéro français dédié</strong> (+33) configuré exclusivement pour votre entreprise.
              </p>
            </div>

            <!-- CTA -->
            <div style="text-align:center;">
              <a href="${dashboardUrl}"
                style="display:inline-block;background:#7c3aed;color:#fff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;">
                Accéder à mon tableau de bord →
              </a>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 16px 16px;padding:20px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6;">
              Essai gratuit de 7 jours — VoiceAgent PME<br>
              Une question ? Répondez directement à cet email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendTrialWelcomeEmail(artisan: Artisan): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("[Onboarding] RESEND_API_KEY manquante");

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL ?? "notifications@voiceagentpme.fr";

  const { error } = await resend.emails.send({
    from,
    to: artisan.email,
    subject: `🎉 Votre assistant de test VoiceAgent est prêt — Appelez le ${TEST_PHONE}`,
    html: buildTrialWelcomeHtml(artisan),
  });

  if (error) {
    throw new Error(`[Onboarding] sendTrialWelcomeEmail Resend error: ${JSON.stringify(error)}`);
  }

  console.log(`[Onboarding] Email d'essai envoyé à ${artisan.email}`);
}

// ─────────────────────────────────────────────
// 6. EMAIL — Réactivation après paiement
// ─────────────────────────────────────────────

export async function sendReactivationEmail(artisan: Artisan, phoneNumber: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("[Onboarding] RESEND_API_KEY manquante");

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM_EMAIL ?? "notifications@voiceagentpme.fr";
  const dashboardUrl = `${APP_URL}/dashboard/accueil`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background:linear-gradient(135deg,#059669 0%,#047857 100%);border-radius:16px 16px 0 0;padding:32px;">
            <div style="display:inline-flex;align-items:center;gap:10px;">
              <div style="width:36px;height:36px;background:rgba(255,255,255,0.2);border-radius:10px;text-align:center;line-height:36px;display:inline-block;">
                <span style="color:#fff;font-weight:700;font-size:16px;">V</span>
              </div>
              <span style="color:#fff;font-weight:700;font-size:16px;margin-left:8px;">VoiceAgent PME</span>
            </div>
            <p style="color:#a7f3d0;font-size:13px;margin:8px 0 0;">Votre assistant est de retour !</p>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;padding:36px 32px;">
            <h2 style="margin:0 0 8px;font-size:22px;color:#111827;font-weight:700;">
              Votre assistant est réactivé ! 🎉
            </h2>
            <p style="margin:0 0 24px;color:#6b7280;font-size:15px;line-height:1.6;">
              Bonjour ${artisan.prenom}, votre abonnement VoiceAgent PME est actif.
              Votre assistant <strong>${artisan.nomEntreprise}</strong> répond à nouveau à vos clients.
            </p>
            <div style="background:linear-gradient(135deg,#ecfdf5 0%,#d1fae5 100%);border:2px solid #6ee7b7;border-radius:14px;padding:24px;margin-bottom:28px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:.08em;">Votre numéro dédié</p>
              <p style="margin:0;font-size:28px;font-weight:800;color:#065f46;">${phoneNumber}</p>
            </div>
            <div style="text-align:center;">
              <a href="${dashboardUrl}"
                style="display:inline-block;background:#059669;color:#fff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:12px;text-decoration:none;">
                Accéder à mon tableau de bord →
              </a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 16px 16px;padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">VoiceAgent PME — abonnement actif</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const { error } = await resend.emails.send({
    from,
    to: artisan.email,
    subject: `✅ Votre assistant vocal ${artisan.nomEntreprise} est réactivé !`,
    html,
  });

  if (error) {
    throw new Error(`[Onboarding] sendReactivationEmail Resend error: ${JSON.stringify(error)}`);
  }

  console.log(`[Onboarding] Email de réactivation envoyé à ${artisan.email}`);
}
