import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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

async function fetchWeekCalls(): Promise<VapiCall[]> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) return [];
  const since = new Date();
  since.setDate(since.getDate() - 7);
  try {
    const res = await fetch(
      `${VAPI_BASE_URL}/call?limit=100&createdAtGt=${since.toISOString()}`,
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

function formatDuration(start?: string, end?: string): string {
  if (!start || !end) return "–";
  const s = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

function firstSentence(text?: string): string {
  if (!text) return "–";
  const s = text.split(/[.!?]/)[0].trim();
  return s.length > 80 ? s.slice(0, 77) + "…" : s;
}

export default async function AccueilPage() {
  const session = await getServerSession(authOptions);
  const calls = await fetchWeekCalls();

  const rdvCount = calls.filter((c) => hasRdv(c.summary)).length;
  const sansSuite = calls.length - rdvCount;

  // Données graphique 7 jours
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  const callsByDay = days.map((day) => ({
    label: day.toLocaleDateString("fr-FR", { weekday: "short" }),
    count: calls.filter((c) => {
      if (!c.startedAt) return false;
      const cd = new Date(c.startedAt);
      return cd.toDateString() === day.toDateString();
    }).length,
  }));
  const maxCount = Math.max(...callsByDay.map((d) => d.count), 1);

  const recentCalls = calls.slice(0, 5);

  const prenom = session?.user?.name?.split(" ")[0] ?? "Artisan";

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Bonjour, {prenom} 👋</h1>
        <p className="text-gray-500 text-sm mt-1">Voici votre activité des 7 derniers jours.</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Appels reçus", value: calls.length, color: "text-blue-600", bg: "bg-blue-50", icon: "📞" },
          { label: "RDV pris", value: rdvCount, color: "text-green-600", bg: "bg-green-50", icon: "📅" },
          { label: "Sans suite", value: sansSuite, color: "text-amber-600", bg: "bg-amber-50", icon: "🚫" },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4">
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
        <h2 className="text-sm font-semibold text-gray-900 mb-5">Activité sur 7 jours</h2>
        <div className="flex items-end gap-2 h-28">
          {callsByDay.map(({ label, count }) => (
            <div key={label} className="flex-1 flex flex-col items-center gap-1.5">
              <span className="text-xs font-medium text-gray-600">{count > 0 ? count : ""}</span>
              <div className="w-full flex items-end justify-center" style={{ height: "80px" }}>
                <div
                  className="w-full bg-blue-600 rounded-t-md transition-all duration-300"
                  style={{ height: `${Math.max((count / maxCount) * 80, count > 0 ? 6 : 2)}px` }}
                />
              </div>
              <span className="text-xs text-gray-400 capitalize">{label}</span>
            </div>
          ))}
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
              <div key={call.id} className="px-6 py-4 flex items-start gap-4">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-blue-600 text-xs">📞</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {call.customer?.name ?? call.customer?.phoneNumber ?? "Client inconnu"}
                    </span>
                    {hasRdv(call.summary) && (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">RDV</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{firstSentence(call.summary)}</p>
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
