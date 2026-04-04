export default function AbonnementExpirePage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-lg text-center">
        {/* Logo */}
        <a href="/" className="inline-flex items-center gap-2 mb-8">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center">
            <span className="text-white font-bold text-sm">V</span>
          </div>
          <span className="font-semibold text-gray-900 text-lg">VoiceAgent PME</span>
        </a>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-6">
            ⏳
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Votre essai gratuit est terminé
          </h1>
          <p className="text-gray-500 text-sm leading-relaxed mb-8">
            Votre période d&apos;essai de 7 jours est arrivée à son terme.
            Pour continuer à utiliser VoiceAgent PME et ne plus rater aucun appel client,
            souscrivez à notre offre.
          </p>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-5 mb-8 text-left">
            <div className="text-sm font-semibold text-blue-900 mb-3">Offre VoiceAgent PME</div>
            <div className="flex items-end gap-1 mb-3">
              <span className="text-3xl font-bold text-blue-600">500 €</span>
              <span className="text-gray-500 text-sm pb-1">/mois</span>
            </div>
            <ul className="space-y-2 text-sm text-gray-700">
              {[
                "Assistant vocal disponible 24h/24, 7j/7",
                "Numéro de téléphone dédié",
                "Prise de rendez-vous automatique",
                "Rapports d'appels par email",
                "Connexion Google Calendar",
              ].map((feat) => (
                <li key={feat} className="flex items-center gap-2">
                  <span className="text-green-500 font-bold">✓</span>
                  {feat}
                </li>
              ))}
            </ul>
          </div>

          <a
            href="/inscription"
            className="block w-full bg-blue-600 text-white font-semibold py-3.5 rounded-xl hover:bg-blue-700 transition-colors text-sm"
          >
            Continuer avec 500 €/mois →
          </a>

          <p className="text-xs text-gray-400 mt-4">
            Vos données et configuration sont conservées.
          </p>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          Une question ?{" "}
          <a href="mailto:support@voiceagentpme.fr" className="text-blue-600 hover:underline">
            Contactez le support
          </a>
        </p>
      </div>
    </main>
  );
}
