import { CallRow } from "./CallRow";

export const dynamic = "force-dynamic";

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

async function fetchAllCalls(): Promise<VapiCall[]> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch(`${VAPI_BASE_URL}/call?limit=100`, {
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

function hasRdv(text?: string): boolean {
  return /rendez-vous|rdv\b/i.test(text ?? "");
}

function formatDate(iso?: string) {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
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
  return s.length > 100 ? s.slice(0, 97) + "…" : s;
}

export default async function AppelsPage() {
  const calls = await fetchAllCalls();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Historique des appels</h1>
          <p className="text-gray-500 text-sm mt-1">
            {calls.length} appel{calls.length > 1 ? "s" : ""} enregistré{calls.length > 1 ? "s" : ""}
            {calls.length > 0 && " — cliquez sur une ligne pour voir la transcription"}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        {calls.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            {process.env.VAPI_API_KEY ? "Aucun appel enregistré pour le moment." : "VAPI_API_KEY non configurée."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Durée</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Demande</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {calls.map((call) => (
                  <CallRow
                    key={call.id}
                    name={call.customer?.name ?? "Inconnu"}
                    phone={call.customer?.phoneNumber ?? ""}
                    date={formatDate(call.startedAt)}
                    duration={formatDuration(call.startedAt, call.endedAt)}
                    summary={firstSentence(call.summary)}
                    transcript={call.transcript}
                    hasRdv={hasRdv(call.summary)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
