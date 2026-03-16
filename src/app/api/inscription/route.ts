import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getStripe } from "@/lib/stripe";
import { saveArtisan, findArtisanByEmail } from "@/lib/storage";
import type { Artisan, MetierType } from "@/types/artisan";

export async function POST(req: NextRequest) {
  let body: {
    prenom: string;
    nom: string;
    email: string;
    telephone: string;
    nomEntreprise: string;
    metier: MetierType;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { prenom, nom, email, telephone, nomEntreprise, metier } = body;

  if (!prenom || !nom || !email || !telephone || !nomEntreprise || !metier) {
    return NextResponse.json(
      { error: "Tous les champs sont requis" },
      { status: 422 }
    );
  }

  try {
    // Vérifie si l'email est déjà utilisé
    const existing = findArtisanByEmail(email);
    if (existing && existing.status !== "cancelled") {
      return NextResponse.json(
        { error: "Un compte existe déjà avec cet email" },
        { status: 409 }
      );
    }

    if (!process.env.STRIPE_PRICE_ID) {
      throw new Error("STRIPE_PRICE_ID est manquante dans les variables d'environnement");
    }

    // Crée le client Stripe
    const stripe = getStripe();
    const customer = await stripe.customers.create({
      name: `${prenom} ${nom}`,
      email,
      phone: telephone,
      metadata: { nomEntreprise, metier },
    });

    // Sauvegarde l'artisan
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
    };
    saveArtisan(artisan);

    // Crée la session Stripe Checkout
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      customer: customer.id,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      metadata: { artisanId: artisan.id },
      success_url: `${appUrl}/inscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/inscription?cancelled=true`,
      locale: "fr",
    });

    return NextResponse.json({ checkoutUrl: session.url }, { status: 201 });
  } catch (err) {
    console.error("[api/inscription]", err);
    const message = err instanceof Error ? err.message : "Erreur interne";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
