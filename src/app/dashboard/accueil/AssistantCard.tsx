"use client";

import { useAssistantStatus } from "@/providers/AssistantStatusContext";

export function AssistantCard() {
  const { active, toggle } = useAssistantStatus();

  return (
    <div
      className={`rounded-2xl border shadow-sm p-5 flex items-center gap-4 transition-colors ${
        active
          ? "bg-gradient-to-br from-green-50 to-emerald-50 border-green-200"
          : "bg-gray-50 border-gray-200"
      }`}
    >
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${
          active ? "bg-green-100" : "bg-gray-200"
        }`}
      >
        🤖
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${active ? "text-green-900" : "text-gray-500"}`}>
          Assistant vocal
        </div>
        <div className={`text-xs mt-0.5 ${active ? "text-green-700" : "text-gray-400"}`}>
          {active ? "Actif — répond aux appels entrants" : "Désactivé — les appels ne sont pas traités"}
        </div>
      </div>
      <button
        onClick={toggle}
        aria-label={active ? "Désactiver l'assistant" : "Activer l'assistant"}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 ${
          active ? "bg-green-500" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow-md transform transition-transform ${
            active ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
