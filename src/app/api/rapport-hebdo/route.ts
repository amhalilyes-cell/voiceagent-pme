import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const VAPI_BASE_URL = "https://api.vapi.ai";

interface VapiCall {
  id: string;
  customer?: { name?: string; phoneNumber?: string };
  summary?: string;
  transcript?: string;
  startedAt?: string;
  endedAt?: string;
  status?: string;
}

interface WeekStats {
  totalCalls: number;
  rdvCount: number;
  clients: { name: string; phone: string; demande: string }[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 = dimanche
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function hasRdv(text: string): boolean {
  return /rendez-vous|rdv\b/i.test(text);
}

function extractClientName(transcript: string): string {
  const patterns = [
    /je m['']appelle\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/i,
    /c['']est\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)\s+(?:à|de|qui)/i,
    /mon nom est\s+([A-ZÀ-Ÿa-zà-ÿ]+(?:\s+[A-ZÀ-Ÿa-zà-ÿ]+)?)/i,
  ];
  for (const re of patterns) {
    const m = transcript.match(re);
    if (m) return m[1];
  }
  return "Inconnu";
}

function summarizeDemande(summary: string): string {
  if (!summary) return "–";
  const sentence = summary.split(/[.!?]/)[0].trim();
  return sentence.length > 90 ? sentence.slice(0, 87) + "…" : sentence;
}

async function fetchCallsInRange(
  apiKey: string,
  from: Date,
  to: Date,
  limit = 100
): Promise<VapiCall[]> {
  const params = new URLSearchParams({
    limit: String(limit),
    createdAtGt: from.toISOString(),
    createdAtLt: to.toISOString(),
  });
  try {
    const res = await fetch(`${VAPI_BASE_URL}/call?${params}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.results ?? []);
  } catch {
    return [];
  }
}

function computeStats(calls: VapiCall[]): WeekStats {
  let rdvCount = 0;
  const clients: WeekStats["clients"] = [];

  for (const call of calls) {
    const text = [call.summary ?? "", call.transcript ?? ""].join(" ");
    if (hasRdv(text)) rdvCount++;

    const name = call.customer?.name ?? extractClientName(call.transcript ?? "");
    const phone = call.customer?.phoneNumber ?? "–";
    const demande = summarizeDemande(call.summary ?? "");
    clients.push({ name, phone, demande });
  }

  return { totalCalls: calls.length, rdvCount, clients };
}

// ── HTML Email ────────────────────────────────────────────────────────────────

function delta(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? `+${current}` : "–";
  const diff = current - previous;
  return diff >= 0 ? `+${diff}` : String(diff);
}

function deltaColor(current: number, previous: number): string {
  if (current >= previous) return "#059669";
  return "#dc2626";
}

function buildWeeklyHtml(
  thisWeek: WeekStats,
  lastWeek: WeekStats,
  weekLabel: string
): string {
  const clientRows = thisWeek.clients.length
    ? thisWeek.clients
        .map(
          (c) => `
      <tr>
        <td style="padding:10px 14px;font-size:13px;color:#111827;border-bottom:1px solid #f3f4f6;">${c.name}</td>
        <td style="padding:10px 14px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">${c.phone}</td>
        <td style="padding:10px 14px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;">${c.demande}</td>
      </tr>`
        )
        .join("")
    : `<tr><td colspan="3" style="padding:16px 14px;text-align:center;color:#9ca3af;font-size:13px;">Aucun appel cette semaine</td></tr>`;

  const statCard = (
    label: string,
    value: number,
    prev: number,
    icon: string
  ) => `
    <td style="width:50%;padding:0 8px;">
      <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px 24px;">
        <div style="font-size:24px;margin-bottom:8px;">${icon}</div>
        <div style="font-size:28px;font-weight:700;color:#111827;">${value}</div>
        <div style="font-size:13px;color:#6b7280;margin-top:2px;">${label}</div>
        <div style="font-size:12px;font-weight:600;color:${deltaColor(value, prev)};margin-top:6px;">
          ${delta(value, prev)} vs semaine précédente
        </div>
      </div>
    </td>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#2563eb;border-radius:12px 12px 0 0;padding:28px 32px;">
            <table width="100%" cellpadding="0" cellspacing="0"><tr>
              <td>
                <div style="display:inline-flex;align-items:center;">
                  <div style="width:32px;height:32px;background:rgba(255,255,255,0.2);border-radius:8px;display:inline-block;text-align:center;line-height:32px;">
                    <span style="color:#fff;font-weight:700;font-size:14px;">V</span>
                  </div>
                  <span style="color:#fff;font-weight:600;font-size:15px;margin-left:10px;">VoiceAgent PME</span>
                </div>
                <p style="color:#bfdbfe;font-size:13px;margin:6px 0 0;">Rapport hebdomadaire automatique</p>
              </td>
              <td align="right">
                <span style="background:rgba(255,255,255,0.15);color:#fff;font-size:12px;padding:4px 12px;border-radius:20px;">${weekLabel}</span>
              </td>
            </tr></table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#fff;padding:32px;">
            <h2 style="margin:0 0 6px;font-size:20px;color:#111827;">Bilan de la semaine</h2>
            <p style="margin:0 0 28px;color:#6b7280;font-size:14px;">Voici le résumé de l'activité de votre assistant vocal.</p>

            <!-- Stats -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
              <tr>
                ${statCard("Appels reçus", thisWeek.totalCalls, lastWeek.totalCalls, "📞")}
                ${statCard("RDV pris", thisWeek.rdvCount, lastWeek.rdvCount, "📅")}
              </tr>
            </table>

            <!-- Clients -->
            <h3 style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">Détail des appels</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;margin-bottom:28px;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">Client</th>
                  <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">Téléphone</th>
                  <th style="padding:10px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1px solid #e5e7eb;">Demande</th>
                </tr>
              </thead>
              <tbody>${clientRows}</tbody>
            </table>

            <!-- Comparaison semaine précédente -->
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:18px 20px;">
              <p style="margin:0 0 10px;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;">Semaine précédente</p>
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:13px;color:#374151;">Appels reçus</td>
                  <td align="right" style="font-size:13px;font-weight:600;color:#111827;">${lastWeek.totalCalls}</td>
                </tr>
                <tr>
                  <td style="font-size:13px;color:#374151;padding-top:6px;">RDV pris</td>
                  <td align="right" style="font-size:13px;font-weight:600;color:#111827;padding-top:6px;">${lastWeek.rdvCount}</td>
                </tr>
              </table>
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;border-radius:0 0 12px 12px;padding:20px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;">
              Rapport généré automatiquement chaque lundi à 8h par VoiceAgent PME.<br>
              <a href="${process.env.NEXT_PUBLIC_APP_URL ?? ""}/dashboard" style="color:#2563eb;text-decoration:none;">Voir le tableau de bord</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // Vérifie le secret Vercel Cron (header Authorization: Bearer <CRON_SECRET>)
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
  }

  const apiKey = process.env.VAPI_API_KEY;
  const resendKey = process.env.RESEND_API_KEY;

  if (!apiKey) return NextResponse.json({ error: "VAPI_API_KEY manquante" }, { status: 500 });
  if (!resendKey) return NextResponse.json({ error: "RESEND_API_KEY manquante" }, { status: 500 });

  // Plages de dates
  const now = new Date();
  const thisMonday = mondayOf(now);
  const lastMonday = new Date(thisMonday);
  lastMonday.setUTCDate(lastMonday.getUTCDate() - 7);
  const nextMonday = new Date(thisMonday);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);

  // Récupère les appels des deux semaines en parallèle
  const [thisCalls, lastCalls] = await Promise.all([
    fetchCallsInRange(apiKey, thisMonday, nextMonday),
    fetchCallsInRange(apiKey, lastMonday, thisMonday),
  ]);

  const thisWeek = computeStats(thisCalls);
  const lastWeek = computeStats(lastCalls);

  // Label semaine ex: "Semaine du 17 mars 2026"
  const weekLabel = `Semaine du ${thisMonday.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  })}`;

  const html = buildWeeklyHtml(thisWeek, lastWeek, weekLabel);

  const resend = new Resend(resendKey);
  const from = process.env.RESEND_FROM_EMAIL ?? "rapports@voiceagentpme.fr";

  const { error } = await resend.emails.send({
    from,
    to: "amhalilyes@gmail.com",
    subject: `Rapport hebdo VoiceAgent — ${weekLabel}`,
    html,
  });

  if (error) {
    console.error("[rapport-hebdo] Erreur Resend:", error);
    return NextResponse.json({ error: "Échec envoi email", details: error }, { status: 500 });
  }

  console.log(`[rapport-hebdo] Email envoyé — ${thisWeek.totalCalls} appels, ${thisWeek.rdvCount} RDV`);
  return NextResponse.json({
    ok: true,
    weekLabel,
    totalCalls: thisWeek.totalCalls,
    rdvCount: thisWeek.rdvCount,
  });
}
