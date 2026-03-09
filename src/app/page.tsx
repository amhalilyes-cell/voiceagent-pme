import ContactForm from "@/components/ContactForm";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 w-full bg-white/90 backdrop-blur-sm border-b border-gray-100 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">V</span>
            </div>
            <span className="font-semibold text-gray-900">VoiceAgent PME</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-600">
            <a href="#fonctionnalites" className="hover:text-blue-600 transition-colors">
              Fonctionnalités
            </a>
            <a href="#comment-ca-marche" className="hover:text-blue-600 transition-colors">
              Comment ça marche
            </a>
            <a href="#tarifs" className="hover:text-blue-600 transition-colors">
              Tarifs
            </a>
          </div>
          <a
            href="#contact"
            className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Essai gratuit
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
        <div className="text-center">
          <span className="inline-block bg-blue-50 text-blue-700 text-sm font-medium px-3 py-1 rounded-full mb-6">
            Conçu pour les artisans français
          </span>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
            Ne ratez plus jamais{" "}
            <span className="text-blue-600">un appel client</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10">
            VoiceAgent PME répond à vos clients 24h/24, 7j/7 — même quand vous
            êtes en chantier, en réunion ou le week-end. Un assistant vocal IA
            qui parle comme vous et connaît votre métier.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#contact"
              className="bg-blue-600 text-white font-semibold px-8 py-4 rounded-xl hover:bg-blue-700 transition-colors text-lg"
            >
              Démarrer gratuitement
            </a>
            <a
              href="#comment-ca-marche"
              className="border border-gray-200 text-gray-700 font-semibold px-8 py-4 rounded-xl hover:border-gray-300 hover:bg-gray-50 transition-colors text-lg"
            >
              Voir une démo
            </a>
          </div>
        </div>

        {/* Stats */}
        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8 border-t border-gray-100 pt-12">
          {[
            { value: "24h/24", label: "Disponibilité" },
            { value: "< 2s", label: "Temps de réponse" },
            { value: "98%", label: "Satisfaction client" },
            { value: "0 appel", label: "Manqué" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-bold text-blue-600">{stat.value}</div>
              <div className="text-sm text-gray-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Fonctionnalités */}
      <section id="fonctionnalites" className="py-20 bg-gray-50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
            Tout ce dont un artisan a besoin
          </h2>
          <p className="text-center text-gray-500 mb-14 max-w-xl mx-auto">
            Votre agent vocal gère les appels entrants à votre place, avec le
            vocabulaire et le professionnalisme de votre métier.
          </p>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: "📞",
                title: "Réception d'appels intelligente",
                desc: "L'agent répond, se présente en votre nom et comprend la demande du client en langage naturel.",
              },
              {
                icon: "📅",
                title: "Prise de rendez-vous",
                desc: "Il consulte votre agenda et fixe des créneaux directement avec vos clients, sans friction.",
              },
              {
                icon: "📋",
                title: "Qualification des devis",
                desc: "Il collecte les informations essentielles (type de travaux, surface, localisation) avant de vous transmettre le lead.",
              },
              {
                icon: "📲",
                title: "Notifications instantanées",
                desc: "Recevez un résumé par SMS ou email après chaque appel, avec les coordonnées et la demande du client.",
              },
              {
                icon: "🔁",
                title: "Transfert intelligent",
                desc: "Si la demande est urgente, l'agent vous transfère l'appel en temps réel sur votre mobile.",
              },
              {
                icon: "🇫🇷",
                title: "100 % en français",
                desc: "Voix naturelle, accents régionaux supportés, vocabulaire technique du bâtiment, plomberie, électricité…",
              },
            ].map((f) => (
              <div
                key={f.title}
                className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
              >
                <div className="text-3xl mb-4">{f.icon}</div>
                <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comment ça marche */}
      <section id="comment-ca-marche" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
            Opérationnel en 10 minutes
          </h2>
          <p className="text-center text-gray-500 mb-14">
            Pas besoin de compétences techniques. Nous configurons tout pour vous.
          </p>
          <div className="space-y-8">
            {[
              {
                step: "01",
                title: "Inscrivez-vous",
                desc: "Créez votre compte et renseignez les informations de base sur votre activité (nom, métier, zone géographique).",
              },
              {
                step: "02",
                title: "Personnalisez votre agent",
                desc: "Choisissez le nom, la voix et les informations que votre agent devra communiquer (tarifs, zones d'intervention, spécialités).",
              },
              {
                step: "03",
                title: "Redirigez votre ligne",
                desc: "Activez le renvoi d'appel sur votre numéro pro existant vers votre numéro VoiceAgent PME. C'est tout.",
              },
              {
                step: "04",
                title: "Votre agent prend le relais",
                desc: "Chaque appel manqué est désormais géré par votre assistant IA. Vous recevez un résumé et ne perdez plus aucun client.",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-sm">
                  {item.step}
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tarifs */}
      <section id="tarifs" className="py-20 bg-gray-50 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
            Tarifs simples et transparents
          </h2>
          <p className="text-center text-gray-500 mb-14">
            Sans engagement. Annulable à tout moment.
          </p>
          <div className="grid md:grid-cols-2 gap-8">
            {[
              {
                name: "Essentiel",
                price: "49",
                desc: "Idéal pour démarrer",
                features: [
                  "Jusqu'à 100 appels/mois",
                  "Prise de rendez-vous",
                  "Résumé par email",
                  "1 voix personnalisée",
                  "Support par email",
                ],
                cta: "Commencer",
                highlighted: false,
              },
              {
                name: "Pro",
                price: "99",
                desc: "Pour les artisans en croissance",
                features: [
                  "Appels illimités",
                  "Transfert d'appels en direct",
                  "Résumé SMS + email",
                  "Intégration agenda Google",
                  "3 voix personnalisées",
                  "Support prioritaire",
                ],
                cta: "Essayer 14 jours gratuit",
                highlighted: true,
              },
            ].map((plan) => (
              <div
                key={plan.name}
                className={`rounded-2xl p-8 ${
                  plan.highlighted
                    ? "bg-blue-600 text-white shadow-xl"
                    : "bg-white border border-gray-200 shadow-sm"
                }`}
              >
                <div
                  className={`text-sm font-medium mb-1 ${
                    plan.highlighted ? "text-blue-100" : "text-gray-500"
                  }`}
                >
                  {plan.desc}
                </div>
                <div className="text-2xl font-bold mb-1">{plan.name}</div>
                <div className="flex items-end gap-1 mb-6">
                  <span className="text-4xl font-bold">{plan.price}€</span>
                  <span
                    className={`text-sm mb-1 ${
                      plan.highlighted ? "text-blue-100" : "text-gray-500"
                    }`}
                  >
                    /mois
                  </span>
                </div>
                <ul className="space-y-3 mb-8">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <svg
                        className={`w-4 h-4 flex-shrink-0 ${
                          plan.highlighted ? "text-blue-200" : "text-blue-600"
                        }`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href="#contact"
                  className={`block text-center font-semibold py-3 rounded-xl transition-colors ${
                    plan.highlighted
                      ? "bg-white text-blue-600 hover:bg-blue-50"
                      : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                >
                  {plan.cta}
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact / CTA */}
      <section id="contact" className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Prêt à ne plus rater aucun client ?
          </h2>
          <p className="text-gray-500 mb-8">
            Laissez votre email, on vous configure votre agent en moins de 10 minutes.
          </p>
          <ContactForm />
          <p className="text-xs text-gray-400 mt-3">
            Pas de carte bancaire requise. Essai 14 jours gratuit.
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-400">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
              <span className="text-white font-bold text-xs">V</span>
            </div>
            <span>VoiceAgent PME</span>
          </div>
          <p>© {new Date().getFullYear()} VoiceAgent PME. Tous droits réservés.</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-gray-600 transition-colors">
              Mentions légales
            </a>
            <a href="#" className="hover:text-gray-600 transition-colors">
              Confidentialité
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
