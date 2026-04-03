"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAssistantStatus } from "@/providers/AssistantStatusContext";

interface Artisan {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  nomEntreprise: string;
  metier: string;
  status: string;
  stripeSubscriptionId?: string;
  twilioPhoneNumber?: string;
  refreshToken?: string;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Actif", color: "bg-green-100 text-green-700" },
  pending: { label: "En attente", color: "bg-amber-100 text-amber-700" },
  cancelled: { label: "Annulé", color: "bg-gray-100 text-gray-500" },
};

function ParametresContent() {
  const searchParams = useSearchParams();
  const calendarStatus = searchParams.get("calendar"); // "success" | "error" | null
  const { active: assistantActive, toggle: toggleAssistant } = useAssistantStatus();

  const [artisan, setArtisan] = useState<Artisan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nomEntreprise, setNomEntreprise] = useState("");

  useEffect(() => {
    fetch("/api/artisan/me")
      .then((r) => r.json())
      .then((data) => {
        setArtisan(data);
        setNomEntreprise(data.nomEntreprise ?? "");
      })
      .catch(() => setError("Impossible de charger vos informations."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch("/api/artisan/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nomEntreprise }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setArtisan(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Erreur lors de la sauvegarde.");
    } finally {
      setSaving(false);
    }
  }

  const status = artisan ? (STATUS_LABELS[artisan.status] ?? STATUS_LABELS.pending) : null;

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Paramètres</h1>
        <p className="text-gray-500 text-sm mt-1">Gérez votre compte et votre configuration.</p>
      </div>

      {/* Toggle assistant vocal */}
      <section
        className={`rounded-2xl border shadow-sm p-5 flex items-center gap-4 transition-colors ${
          assistantActive
            ? "bg-gradient-to-br from-green-50 to-emerald-50 border-green-200"
            : "bg-gray-50 border-gray-200"
        }`}
      >
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
          assistantActive ? "bg-green-100" : "bg-gray-200"
        }`}>
          🤖
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-sm font-semibold ${assistantActive ? "text-green-900" : "text-gray-600"}`}>
            Assistant vocal
          </div>
          <div className={`text-xs mt-0.5 ${assistantActive ? "text-green-700" : "text-gray-400"}`}>
            {assistantActive
              ? "Actif — répond aux appels entrants 24h/24"
              : "Désactivé — les appels ne sont pas traités"}
          </div>
        </div>
        <button
          onClick={toggleAssistant}
          aria-label={assistantActive ? "Désactiver l'assistant" : "Activer l'assistant"}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${
            assistantActive ? "bg-green-500" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-white shadow-md transform transition-transform ${
              assistantActive ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </section>

      {loading ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 text-sm">
          Chargement…
        </div>
      ) : (
        <>
          {/* Infos entreprise */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
            <h2 className="font-semibold text-gray-900 text-base">Informations entreprise</h2>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">Prénom</div>
                <div className="text-gray-900">{artisan?.prenom}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">Nom</div>
                <div className="text-gray-900">{artisan?.nom}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">Email</div>
                <div className="text-gray-900">{artisan?.email}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">Téléphone</div>
                <div className="text-gray-900">{artisan?.telephone}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 mb-1">Métier</div>
                <div className="text-gray-900 capitalize">{artisan?.metier}</div>
              </div>
            </div>

            <form onSubmit={handleSave} className="space-y-3 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom de l&apos;entreprise
                </label>
                <input
                  type="text"
                  value={nomEntreprise}
                  onChange={(e) => setNomEntreprise(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}
              {saved && (
                <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  Modifications enregistrées.
                </div>
              )}

              <button
                type="submit"
                disabled={saving}
                className="bg-blue-600 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60"
              >
                {saving ? "Sauvegarde…" : "Enregistrer"}
              </button>
            </form>
          </section>

          {/* Numéro dédié */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 text-base mb-4">Numéro dédié</h2>
            {artisan?.twilioPhoneNumber ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-lg">📞</div>
                <div>
                  <div className="font-semibold text-gray-900">{artisan.twilioPhoneNumber}</div>
                  <div className="text-xs text-gray-500">Votre numéro VoiceAgent dédié</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 flex items-center gap-2">
                <span className="text-gray-300 text-lg">📞</span>
                Numéro en cours d&apos;attribution — notre équipe vous contacte sous 24h.
              </div>
            )}
          </section>

          {/* Google Calendar */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 text-base mb-2">Google Calendar</h2>
            <p className="text-sm text-gray-500 mb-4">
              Connectez votre agenda pour que l&apos;agent prenne des RDV automatiquement.
            </p>

            {calendarStatus === "error" && (
              <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                La connexion a échoué. Réessayez ou contactez le support.
              </div>
            )}

            {artisan?.refreshToken || calendarStatus === "success" ? (
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                <span className="text-green-600 text-xl">✅</span>
                <div>
                  <div className="text-sm font-semibold text-green-800">Google Calendar connecté</div>
                  <div className="text-xs text-green-600 mt-0.5">Votre agenda est synchronisé avec l&apos;assistant vocal.</div>
                </div>
                <a
                  href="/api/auth/google/redirect"
                  className="ml-auto text-xs text-green-700 underline hover:no-underline flex-shrink-0"
                >
                  Reconnecter
                </a>
              </div>
            ) : (
              <a
                href="/api/auth/google/redirect"
                className="inline-flex items-center gap-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.5 3h-2.25V1.5h-1.5V3h-7.5V1.5h-1.5V3H4.5A1.5 1.5 0 003 4.5v15A1.5 1.5 0 004.5 21h15a1.5 1.5 0 001.5-1.5v-15A1.5 1.5 0 0019.5 3zm0 16.5h-15V9h15v10.5zm0-12h-15V4.5h2.25V6h1.5V4.5h7.5V6h1.5V4.5h2.25V7.5z" />
                </svg>
                Connecter Google Calendar
              </a>
            )}
          </section>

          {/* Abonnement Stripe */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <h2 className="font-semibold text-gray-900 text-base mb-4">Abonnement</h2>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-lg">💳</div>
                <div>
                  <div className="font-semibold text-gray-900">Offre unique — 500 €/mois</div>
                  {artisan?.stripeSubscriptionId && (
                    <div className="text-xs text-gray-400 font-mono mt-0.5">{artisan.stripeSubscriptionId.slice(0, 20)}…</div>
                  )}
                </div>
              </div>
              {status && (
                <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${status.color}`}>
                  {status.label}
                </span>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

export default function ParametresPage() {
  return (
    <Suspense fallback={
      <div className="p-6 max-w-2xl">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center text-gray-400 text-sm">
          Chargement…
        </div>
      </div>
    }>
      <ParametresContent />
    </Suspense>
  );
}
