import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY est manquante dans les variables d'environnement");
  _resend = new Resend(key);
  return _resend;
}

export interface CallReportData {
  callId: string;
  clientName?: string;
  clientPhone?: string;
  summary: string;
  transcript: string;
  durationSeconds?: number;
  recordingUrl?: string;
  rdv?: string | null;
}

/** Extrait le nom du client depuis la transcription (cherche des patterns courants) */
function extractClientName(transcript: string): string | undefined {
  const patterns = [
    /je m['']appelle\s+([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)?)/i,
    /c['']est\s+([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)?)\s+(?:à|de|qui)/i,
    /mon nom est\s+([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-Ÿ][a-zà-ÿ]+)?)/i,
  ];
  for (const re of patterns) {
    const match = transcript.match(re);
    if (match) return match[1];
  }
  return undefined;
}

/** Extrait un numéro de téléphone depuis la transcription */
function extractPhone(transcript: string): string | undefined {
  const match = transcript.match(/0[1-9](?:[\s.\-]?\d{2}){4}/);
  return match ? match[0].replace(/[\s.\-]/g, " ") : undefined;
}

/** Extrait un RDV mentionné dans le résumé ou la transcription */
function extractRdv(text: string): string | null {
  const patterns = [
    /rendez-vous[^.]*(?:le|du)\s+([^.]{5,60})/i,
    /rdv[^.]*(?:le|du)\s+([^.]{5,60})/i,
    /(?:fixé|confirmé|noté)[^.]*(?:le|du)\s+([^.]{5,60})/i,
  ];
  for (const re of patterns) {
    const match = text.match(re);
    if (match) return match[1].trim();
  }
  return null;
}

function formatDuration(seconds?: number): string {
  if (!seconds || seconds <= 0) return "–";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} min ${s} sec` : `${s} sec`;
}

function buildHtml(data: CallReportData): string {
  const clientName = data.clientName ?? extractClientName(data.transcript) ?? "Inconnu";
  const clientPhone = data.clientPhone ?? extractPhone(data.transcript) ?? "–";
  const rdv = data.rdv ?? extractRdv(data.summary + " " + data.transcript);
  const duration = formatDuration(data.durationSeconds);

  const rdvRow = rdv
    ? `<tr>
        <td style="padding:10px 16px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">RDV pris</td>
        <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#059669;border-bottom:1px solid #f3f4f6;">${rdv}</td>
       </tr>`
    : "";

  const recordingRow = data.recordingUrl
    ? `<p style="margin:16px 0 0;">
         <a href="${data.recordingUrl}" style="color:#2563eb;font-size:13px;">Écouter l'enregistrement</a>
       </p>`
    : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#2563eb;border-radius:12px 12px 0 0;padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td>
                  <div style="display:inline-flex;align-items:center;gap:8px;">
                    <div style="width:32px;height:32px;background:rgba(255,255,255,0.2);border-radius:8px;display:inline-block;text-align:center;line-height:32px;">
                      <span style="color:#fff;font-weight:700;font-size:14px;">V</span>
                    </div>
                    <span style="color:#fff;font-weight:600;font-size:15px;margin-left:8px;">VoiceAgent PME</span>
                  </div>
                  <p style="color:#bfdbfe;font-size:13px;margin:6px 0 0;">Rapport d'appel automatique</p>
                </td>
                <td align="right">
                  <span style="background:rgba(255,255,255,0.15);color:#fff;font-size:12px;padding:4px 12px;border-radius:20px;">Nouvel appel</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#fff;padding:32px;">

            <h2 style="margin:0 0 4px;font-size:20px;color:#111827;">Rapport de fin d'appel</h2>
            <p style="margin:0 0 24px;color:#6b7280;font-size:14px;">ID appel : <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:12px;">${data.callId}</code></p>

            <!-- Infos client -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:24px;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th colspan="2" style="padding:10px 16px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">
                    Informations client
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style="padding:10px 16px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Nom</td>
                  <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#111827;border-bottom:1px solid #f3f4f6;">${clientName}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Téléphone</td>
                  <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#111827;border-bottom:1px solid #f3f4f6;">${clientPhone}</td>
                </tr>
                <tr>
                  <td style="padding:10px 16px;color:#6b7280;font-size:14px;border-bottom:1px solid #f3f4f6;">Durée</td>
                  <td style="padding:10px 16px;font-size:14px;font-weight:600;color:#111827;border-bottom:1px solid #f3f4f6;">${duration}</td>
                </tr>
                ${rdvRow}
              </tbody>
            </table>

            <!-- Résumé -->
            <div style="background:#eff6ff;border-left:4px solid #2563eb;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:24px;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:600;color:#1d4ed8;text-transform:uppercase;letter-spacing:.05em;">Résumé de l'appel</p>
              <p style="margin:0;font-size:14px;color:#1e3a5f;line-height:1.6;">${data.summary || "Aucun résumé disponible."}</p>
            </div>

            <!-- Transcription -->
            <details style="margin-bottom:8px;">
              <summary style="cursor:pointer;font-size:13px;font-weight:600;color:#374151;padding:10px 0;user-select:none;">
                Voir la transcription complète
              </summary>
              <div style="margin-top:12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;max-height:300px;overflow-y:auto;">
                <pre style="margin:0;font-size:12px;color:#4b5563;white-space:pre-wrap;line-height:1.7;font-family:inherit;">${data.transcript || "–"}</pre>
              </div>
            </details>

            ${recordingRow}

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Cet email a été envoyé automatiquement par VoiceAgent PME.<br>
              Consultez votre <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard" style="color:#2563eb;text-decoration:none;">tableau de bord</a> pour l'historique complet.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendCallReport(data: CallReportData): Promise<void> {
  const resend = getResend();
  const from = process.env.RESEND_FROM_EMAIL ?? "notifications@voiceagentpme.fr";

  const clientName = data.clientName ?? extractClientName(data.transcript);
  const subject = clientName
    ? `Rapport d'appel — ${clientName}`
    : `Rapport d'appel — ${new Date().toLocaleDateString("fr-FR")}`;

  const { error } = await resend.emails.send({
    from,
    to: "amhalilyes@gmail.com",
    subject,
    html: buildHtml(data),
  });

  if (error) {
    throw new Error(`Resend error: ${JSON.stringify(error)}`);
  }
}
