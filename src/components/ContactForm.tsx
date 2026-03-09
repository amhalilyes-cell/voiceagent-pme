"use client";

import { useState } from "react";

export default function ContactForm() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: appel API pour enregistrer l'email
    console.log("Email soumis :", email);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-6 py-4 text-sm font-medium">
        Merci ! Nous vous contacterons très prochainement.
      </div>
    );
  }

  return (
    <form
      className="flex flex-col sm:flex-row gap-3"
      onSubmit={handleSubmit}
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="votre@email.fr"
        className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        required
      />
      <button
        type="submit"
        className="bg-blue-600 text-white font-semibold px-6 py-3 rounded-xl hover:bg-blue-700 transition-colors text-sm whitespace-nowrap"
      >
        Démarrer gratuitement
      </button>
    </form>
  );
}
