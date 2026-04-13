import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findArtisanById, getCallsByArtisan } from "@/lib/storage";
import type { CallRow } from "@/lib/storage";
import { CallRow as CallRowComponent } from "./CallRow";

export const dynamic = "force-dynamic";

function formatDate(iso?: string | null) {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
}

function formatDuration(seconds?: number | null): string {
  if (!seconds) return "–";
  const m = Math.floor(seconds / 60);
  return m > 0 ? `${m} min ${seconds % 60} s` : `${seconds} s`;
}

function firstSentence(text?: string | null): string {
  if (!text) return "–";
  const s = text.split(/[.!?]/)[0].trim();
  return s.length > 100 ? s.slice(0, 97) + "…" : s;
}

export default async function AppelsPage() {
  const session = await getServerSession(authOptions);
  const artisan = session?.user?.id
    ? await findArtisanById(session.user.id).catch(() => null)
    : null;

  const calls: CallRow[] = artisan?.id
    ? await getCallsByArtisan(artisan.id).catch(() => [])
    : [];

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
            Aucun appel enregistré pour le moment.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Date</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Durée</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Résumé</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">RDV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {calls.map((call) => (
                  <CallRowComponent
                    key={call.id}
                    name={call.client_name ?? "Inconnu"}
                    phone={call.client_phone ?? ""}
                    date={formatDate(call.started_at)}
                    duration={formatDuration(call.duration_seconds)}
                    summary={firstSentence(call.summary)}
                    transcript={call.transcript ?? undefined}
                    hasRdv={!!call.rdv}
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
