import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStripe } from "@/lib/stripe";
import { saveArtisan, findArtisanByEmail, updateArtisan } from "@/lib/storage";
import { hashPassword } from "@/lib/auth";
import { createVapiAssistant, provisionPhoneNumber, sendTrialWelcomeEmail } from "@/lib/onboarding";
import type { Artisan, MetierType } from "@/types/artisan";

export async function POST(req: NextRequest) {
  let body: {
    prenom: string;
    nom: string;
    email: string;
    telephone: string;
    nomEntreprise: string;
    metier: MetierType;
    motDePasse?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { prenom, nom, email, telephone, nomEntreprise, metier, motDePasse } = body;

  if (!prenom || !nom || !email || !telephone || !nomEntreprise || !metier) {
    return NextResponse.json(
      { error: "Tous les champs sont requis" },
      { status: 422 }
    );
  }

  const PRICE_ID = process.env.STRIPE_PRICE_ID ?? "price_1TLNT9RztdaAmv8eB0cLqqLl";

  try {
    // Vérifie si l'email est déjà utilisé — non-bloquant si Supabase est injoignable
    try {
      const existing = await findArtisanByEmail(email);
      if (existing && existing.status !== "cancelled") {
        return NextResponse.json(
          { error: "Un compte existe déjà avec cet email" },
          { status: 409 }
        );
      }
    } catch (dbErr) {
      console.warn("[api/inscription] Vérification doublon ignorée (Supabase injoignable):", dbErr);
    }

    // Hash du mot de passe
    const passwordHash = motDePasse ? await hashPassword(motDePasse) : undefined;

    // Crée le client Stripe
    const stripe = getStripe();
    const customer = await stripe.customers.create({
      name: `${prenom} ${nom}`,
      email,
      phone: telephone,
      metadata: { nomEntreprise, metier },
    });

    // Sauvegarde l'artisan — non-bloquant si Supabase est injoignable
    const trialEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const artisan: Artisan = {
      id: randomUUID(),
      prenom,
      nom,
      email,
      telephone,
      nomEntreprise,
      metier,
      status: "pending",
      stripeCustomerId: customer.id,
      createdAt: new Date().toISOString(),
      passwordHash,
      trialEndsAt,
    };
    try {
      await saveArtisan(artisan);
      console.log(`[api/inscription] Artisan ${artisan.id} sauvegardé en base`);
    } catch (dbErr) {
      console.error("[api/inscription] Sauvegarde artisan échouée (Supabase injoignable):", dbErr);
    }

    // Onboarding Vapi + Twilio — awaité pour éviter que Vercel tue la fonction avant la fin
    // 1. Création de l'assistant Vapi
    let vapiAssistantId: string | undefined;
    try {
      console.log(`[Onboarding] Création assistant Vapi pour ${artisan.nomEntreprise} (${artisan.id})`);
      vapiAssistantId = await createVapiAssistant(artisan);
      await updateArtisan(artisan.id, { vapiAssistantId });
      console.log(`[Onboarding] ✓ Assistant Vapi créé: ${vapiAssistantId} — sauvegardé pour ${artisan.id}`);
    } catch (vapiErr) {
      console.error(`[Onboarding] ✗ Échec création assistant Vapi pour ${artisan.id}:`, vapiErr);
    }

    // 2. Provisionnement numéro Twilio (seulement si Vapi a réussi)
    if (vapiAssistantId) {
      try {
        console.log(`[Onboarding] Provisionnement numéro Twilio pour assistant ${vapiAssistantId}`);
        const twilioPhoneNumber = await provisionPhoneNumber(vapiAssistantId);
        await updateArtisan(artisan.id, { twilioPhoneNumber });
        console.log(`[Onboarding] ✓ Numéro Twilio provisionné: ${twilioPhoneNumber} — sauvegardé pour ${artisan.id}`);
      } catch (twilioErr) {
        console.error(`[Onboarding] ✗ Échec provisionnement Twilio pour ${artisan.id}:`, twilioErr);
      }
    }

    // Envoie l'email d'essai (non-bloquant — ne doit pas retarder la réponse)
    sendTrialWelcomeEmail(artisan).catch((err) =>
      console.error("[api/inscription] Email d'essai échoué (non-bloquant):", err)
    );

    // Crée la session Stripe Checkout
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    console.log("[Inscription] PRICE_ID utilisé:", PRICE_ID);
    console.log("[Inscription] STRIPE_KEY mode:", process.env.STRIPE_SECRET_KEY?.startsWith("sk_live") ? "live" : "test");

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        customer: customer.id,
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: PRICE_ID, quantity: 1 }],
        metadata: { artisanId: artisan.id },
        success_url: `${appUrl}/inscription/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/inscription?cancelled=true`,
        locale: "fr",
      });
    } catch (err) {
      console.error("[Inscription] Erreur Stripe checkout:", err);
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }

    return NextResponse.json({ checkoutUrl: session.url }, { status: 201 });
  } catch (err) {
    console.error("[api/inscription]", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
