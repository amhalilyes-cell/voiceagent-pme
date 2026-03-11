export default function SuccessPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg
            className="w-8 h-8 text-green-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Bienvenue sur VoiceAgent PME !
        </h1>
        <p className="text-gray-500 mb-8 text-sm leading-relaxed">
          Votre compte est actif. Notre équipe vous contactera dans les prochaines
          heures pour configurer votre agent vocal personnalisé.
        </p>
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-8 text-left text-sm space-y-2">
          <p className="font-medium text-blue-900">Prochaines étapes :</p>
          <ol className="list-decimal list-inside space-y-1 text-blue-700">
            <li>Vous recevez un email de confirmation</li>
            <li>On configure votre agent vocal en 24h</li>
            <li>Vous activez le renvoi d&apos;appel sur votre mobile</li>
            <li>Votre agent prend le relais immédiatement</li>
          </ol>
        </div>
        <a
          href="/dashboard"
          className="inline-block bg-blue-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors text-sm"
        >
          Accéder à mon tableau de bord
        </a>
      </div>
    </main>
  );
}
