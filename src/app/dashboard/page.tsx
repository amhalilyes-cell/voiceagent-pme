import { readArtisans } from "@/lib/storage";
import type { Artisan } from "@/types/artisan";
import type { VapiCall } from "@/types/vapi";

const VAPI_BASE_URL = "https://api.vapi.ai";

async function getRecentCalls(): Promise<VapiCall[]> {
  const apiKey = process.env.VAPI_API_KEY;
  if (!apiKey) return [];
  try {
    const res = await fetch(`${VAPI_BASE_URL}/call?limit=10`, {
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

function StatusBadge({ status }: { status: Artisan["status"] }) {
  const styles = {
    active: "bg-green-100 text-green-700",
    pending: "bg-amber-100 text-amber-700",
    cancelled: "bg-gray-100 text-gray-500",
  };
  const labels = { active: "Actif", pending: "En attente", cancelled: "Annulé" };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

function CallStatusBadge({ status }: { status: VapiCall["status"] }) {
  const styles: Record<string, string> = {
    ended: "bg-gray-100 text-gray-600",
    "in-progress": "bg-blue-100 text-blue-700",
    ringing: "bg-amber-100 text-amber-700",
    queued: "bg-purple-100 text-purple-700",
    forwarding: "bg-indigo-100 text-indigo-700",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

function formatDate(iso: string | undefined) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function DashboardPage() {
  const [artisans, calls] = await Promise.all([
    Promise.resolve(readArtisans()),
    getRecentCalls(),
  ]);

  const activeCount = artisans.filter((a) => a.status === "active").length;
  const pendingCount = artisans.filter((a) => a.status === "pending").length;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-100 px-4 sm:px-8 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-xs">V</span>
          </div>
          <span className="font-semibold text-gray-900 text-sm">VoiceAgent PME</span>
          <span className="text-gray-300 mx-2">|</span>
          <span className="text-sm text-gray-500">Dashboard</span>
        </div>
        <a
          href="/inscription"
          className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          + Nouvel artisan
        </a>
      </nav>

      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-8">
        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Artisans inscrits", value: artisans.length, color: "text-gray-900" },
            { label: "Abonnements actifs", value: activeCount, color: "text-green-600" },
            { label: "En attente", value: pendingCount, color: "text-amber-600" },
            { label: "Appels récents", value: calls.length, color: "text-blue-600" },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
              <div className={`text-3xl font-bold ${kpi.color}`}>{kpi.value}</div>
              <div className="text-xs text-gray-500 mt-1">{kpi.label}</div>
            </div>
          ))}
        </div>

        {/* Artisans */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Artisans inscrits</h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {artisans.length === 0 ? (
              <div className="text-center text-gray-400 py-12 text-sm">
                Aucun artisan inscrit pour le moment.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Artisan</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Entreprise</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden md:table-cell">Métier</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden md:table-cell">Téléphone</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Statut</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden lg:table-cell">Inscrit le</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {artisans.map((a) => (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{a.prenom} {a.nom}</div>
                        <div className="text-xs text-gray-400">{a.email}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{a.nomEntreprise}</td>
                      <td className="px-4 py-3 text-gray-500 capitalize hidden md:table-cell">{a.metier}</td>
                      <td className="px-4 py-3 text-gray-500 hidden md:table-cell">{a.telephone}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={a.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">
                        {formatDate(a.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* Appels récents */}
        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Appels récents</h2>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            {calls.length === 0 ? (
              <div className="text-center text-gray-400 py-12 text-sm">
                {process.env.VAPI_API_KEY
                  ? "Aucun appel récent."
                  : "VAPI_API_KEY non configurée — les appels apparaîtront ici."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">ID Appel</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden md:table-cell">Client</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Statut</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden lg:table-cell">Raison de fin</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 hidden md:table-cell">Démarré le</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {calls.map((call) => (
                    <tr key={call.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {call.id.slice(0, 8)}…
                      </td>
                      <td className="px-4 py-3 text-gray-700 hidden md:table-cell">
                        {call.customer?.phoneNumber ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <CallStatusBadge status={call.status} />
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs hidden lg:table-cell">
                        {call.endedReason ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">
                        {formatDate(call.startedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
