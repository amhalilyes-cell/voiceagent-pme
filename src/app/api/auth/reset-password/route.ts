import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { Resend } from "resend";
import { findArtisanByEmail, updateArtisan } from "@/lib/storage";

const APP_URL = "https://voiceagent-pme.vercel.app";

function buildResetEmail(prenom: string, resetLink: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="background:#2563eb;border-radius:12px 12px 0 0;padding:28px 32px;">
            <div style="display:inline-flex;align-items:center;gap:8px;">
              <div style="width:32px;height:32px;background:rgba(255,255,255,0.2);border-radius:8px;display:inline-block;text-align:center;line-height:32px;">
                <span style="color:#fff;font-weight:700;font-size:14px;">V</span>
              </div>
              <span style="color:#fff;font-weight:600;font-size:15px;margin-left:8px;">VoiceAgent PME</span>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#fff;padding:36px 32px;">
            <h2 style="margin:0 0 8px;font-size:20px;color:#111827;font-weight:700;">Réinitialisation de mot de passe</h2>
            <p style="margin:0 0 24px;color:#6b7280;font-size:14px;line-height:1.6;">
              Bonjour ${prenom},<br><br>
              Vous avez demandé la réinitialisation de votre mot de passe VoiceAgent PME.
              Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.
            </p>
            <div style="text-align:center;margin-bottom:24px;">
              <a href="${resetLink}"
                style="display:inline-block;background:#2563eb;color:#fff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:12px;text-decoration:none;">
                Réinitialiser mon mot de passe
              </a>
            </div>
            <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;line-height:1.6;">
              Ce lien est valable <strong>1 heure</strong>. Si vous n'avez pas fait cette demande, ignorez cet email.<br>
              <a href="${resetLink}" style="color:#6b7280;word-break:break-all;">${resetLink}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">VoiceAgent PME — email de sécurité automatique</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function POST(req: NextRequest) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const { email } = body;
  if (!email) {
    return NextResponse.json({ error: "Email requis" }, { status: 422 });
  }

  // Toujours répondre 200 pour ne pas divulguer l'existence du compte
  try {
    const artisan = await findArtisanByEmail(email);
    if (!artisan) {
      // Ne pas révéler que le compte n'existe pas
      return NextResponse.json({ ok: true });
    }

    const token = randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1h

    await updateArtisan(artisan.id, {
      resetToken: token,
      resetTokenExpires: expires,
    });

    const resetLink = `${APP_URL}/nouveau-mot-de-passe?token=${token}`;
    const apiKey = process.env.RESEND_API_KEY;
    if (apiKey) {
      const resend = new Resend(apiKey);
      const from = process.env.RESEND_FROM_EMAIL ?? "notifications@voiceagentpme.fr";
      await resend.emails.send({
        from,
        to: artisan.email,
        subject: "Réinitialisation de votre mot de passe VoiceAgent PME",
        html: buildResetEmail(artisan.prenom, resetLink),
      });
    }
  } catch (err) {
    console.error("[api/auth/reset-password]", err);
    // Répondre 200 quand même pour ne pas divulguer d'infos
  }

  return NextResponse.json({ ok: true });
}
