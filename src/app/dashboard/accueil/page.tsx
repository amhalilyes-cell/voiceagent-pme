import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findArtisanById } from "@/lib/storage";
import { AssistantCard } from "./AssistantCard";

export const dynamic = "force-dynamic";

const VAPI_BASE_URL = "https://api.vapi.ai";

interface VapiCall {
  id: string;
  customer?: { name?: string; phoneNumber?: string };
  summary?: string;
  startedAt?: string;
  endedAt?: string;
  status?: string;
}

async function fetchWeekCalls(assistantId?: string): Promise<VapiCall[]> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) return [];
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const params = new URLSearchParams({ limit: "100", createdAtGt: since.toISOString() });
  if (assistantId) params.set("assistantId", assistantId);
  try {
    const res = await fetch(
      `${VAPI_BASE_URL}/call?${params.toString()}`,
      { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.results ?? []);
  } catch {
    return [];
  }
}

function hasRdv(text?: string): boolean {
  return /rendez-vous|rdv\b/i.test(text ?? "");
}

function formatDate(iso?: string) {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

function firstSentence(text?: string): string {
  if (!text) return "–";
  const s = text.split(/[.!?]/)[0].trim();
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}

export default async function AccueilPage() {
  const session = await getServerSession(authOptions);
  const artisan = session?.user?.id ? await findArtisanById(session.user.id).catch(() => null) : null;
  const calls = await fetchWeekCalls(artisan?.vapiAssistantId);

  const rdvCount = calls.filter((c) => hasRdv(c.summary)).length;
  const sansSuite = calls.length - rdvCount;

  // Données graphique 7 jours
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const callsByDay = days.map((day) => {
    const dayCalls = calls.filter((c) => {
      if (!c.startedAt) return false;
      return new Date(c.startedAt).toDateString() === day.toDateString();
    });
    return {
      label: day.toLocaleDateString("fr-FR", { weekday: "short" }),
      count: dayCalls.length,
      rdv: dayCalls.filter((c) => hasRdv(c.summary)).length,
    };
  });
  const maxCount = Math.max(...callsByDay.map((d) => d.count), 1);

  const recentCalls = calls.slice(0, 5);
  const prenom = session?.user?.name?.split(" ")[0] ?? "Artisan";

  const kpis = [
    { label: "Appels reçus", value: calls.length, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-100", icon: "📞" },
    { label: "RDV pris", value: rdvCount, color: "text-green-600", bg: "bg-green-50", border: "border-green-100", icon: "📅" },
    { label: "Sans suite", value: sansSuite, color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-100", icon: "🚫" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bonjour, {prenom} 👋</h1>
        <p className="text-gray-500 text-sm mt-1">Voici votre activité des 7 derniers jours.</p>
      </div>

      {/* Assistant status + KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <AssistantCard />
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className={`bg-white rounded-2xl border ${kpi.border} shadow-sm p-5 flex items-center gap-4`}
          >
            <div className={`w-12 h-12 ${kpi.bg} rounded-xl flex items-center justify-center text-xl flex-shrink-0`}>
              {kpi.icon}
            </div>
            <div>
              <div className={`text-3xl font-bold ${kpi.color}`}>{kpi.value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{kpi.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-semibold text-gray-900">Activité sur 7 jours</h2>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
              Appels
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-green-400 inline-block" />
              RDV
            </span>
          </div>
        </div>
        <div className="flex items-end gap-3 h-36">
          {callsByDay.map(({ label, count, rdv }) => {
            const barH = Math.max((count / maxCount) * 112, count > 0 ? 8 : 3);
            const rdvH = count > 0 ? Math.round((rdv / count) * barH) : 0;
            const nonRdvH = barH - rdvH;
            return (
              <div key={label} className="flex-1 flex flex-col items-center gap-1.5">
                <span className="text-xs font-semibold text-gray-600 h-4">
                  {count > 0 ? count : ""}
                </span>
                <div className="w-full flex flex-col items-center justify-end" style={{ height: "112px" }}>
                  {count === 0 ? (
                    <div className="w-full bg-gray-100 rounded-md" style={{ height: "3px" }} />
                  ) : (
                    <div className="w-full rounded-t-lg overflow-hidden flex flex-col-reverse" style={{ height: `${barH}px` }}>
                      {rdvH > 0 && (
                        <div className="w-full bg-green-400" style={{ height: `${rdvH}px` }} />
                      )}
                      {nonRdvH > 0 && (
                        <div className="w-full bg-blue-500" style={{ height: `${nonRdvH}px` }} />
                      )}
                    </div>
                  )}
                </div>
                <span className="text-xs text-gray-400 capitalize">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent calls */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">5 derniers appels</h2>
          <a href="/dashboard/appels" className="text-xs text-blue-600 hover:underline font-medium">
            Voir tout →
          </a>
        </div>
        {recentCalls.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">
            {process.env.VAPI_API_KEY ? "Aucun appel cette semaine." : "VAPI_API_KEY non configurée."}
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {recentCalls.map((call) => (
              <div key={call.id} className="px-6 py-4 flex items-start gap-4 hover:bg-gray-50 transition-colors">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  hasRdv(call.summary) ? "bg-green-100" : "bg-blue-50"
                }`}>
                  <span className="text-sm">{hasRdv(call.summary) ? "📅" : "📞"}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">
                      {call.customer?.name ?? call.customer?.phoneNumber ?? "Client inconnu"}
                    </span>
                    {hasRdv(call.summary) ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">✅ RDV</span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full font-medium">Pas de RDV</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{firstSentence(call.summary)}</p>
                </div>
                <div className="text-xs text-gray-400 flex-shrink-0">{formatDate(call.startedAt)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
