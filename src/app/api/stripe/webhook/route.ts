import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { updateArtisan, findArtisanById, findArtisanByStripeCustomerId } from "@/lib/storage";
import { createVapiAssistant, provisionPhoneNumber, sendWelcomeEmail } from "@/lib/onboarding";
import type Stripe from "stripe";

/**
 * POST /api/stripe/webhook
 * Configurer dans Stripe Dashboard → Webhooks :
 *   Endpoint URL : https://voiceagent-pme.vercel.app/api/stripe/webhook
 *   Événements : checkout.session.completed, customer.subscription.deleted
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret || !signature) {
    return NextResponse.json({ error: "Configuration webhook manquante" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("[Stripe Webhook] Signature invalide :", err);
    return NextResponse.json({ error: "Signature invalide" }, { status: 401 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const artisanId = session.metadata?.artisanId;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      if (!artisanId) {
        console.warn("[Stripe Webhook] checkout.session.completed sans artisanId dans metadata");
        break;
      }

      // 1. Active l'abonnement
      await updateArtisan(artisanId, {
        status: "active",
        stripeSubscriptionId: subscriptionId,
      });
      console.log(`[Stripe] Artisan ${artisanId} activé — sub: ${subscriptionId}`);

      // 2. Charge l'artisan pour l'onboarding
      const artisan = await findArtisanById(artisanId);
      if (!artisan) {
        console.error(`[Stripe Webhook] Artisan ${artisanId} introuvable en DB`);
        break;
      }

      // 3. Crée l'assistant Vapi
      let vapiAssistantId: string | undefined;
      try {
        vapiAssistantId = await createVapiAssistant(artisan);
        await updateArtisan(artisanId, { vapiAssistantId });
        console.log(`[Onboarding] Vapi assistant ${vapiAssistantId} sauvegardé pour ${artisanId}`);
      } catch (err) {
        console.error("[Onboarding] Création assistant Vapi échouée:", err);
        // Non-bloquant : on continue l'onboarding
      }

      // 4. Achète et connecte le numéro Twilio
      let phoneNumber: string | undefined;
      try {
        phoneNumber = await provisionPhoneNumber(vapiAssistantId ?? "");
        await updateArtisan(artisanId, { twilioPhoneNumber: phoneNumber });
        console.log(`[Onboarding] Numéro ${phoneNumber} sauvegardé pour ${artisanId}`);
      } catch (err) {
        console.error("[Onboarding] Provisionnement Twilio échoué:", err);
        // Non-bloquant
      }

      // 5. Envoie l'email de bienvenue
      if (phoneNumber) {
        try {
          const updatedArtisan = await findArtisanById(artisanId);
          await sendWelcomeEmail(updatedArtisan ?? artisan, phoneNumber);
        } catch (err) {
          console.error("[Onboarding] Email de bienvenue échoué:", err);
          // Non-bloquant
        }
      }

      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;

      const artisan = await findArtisanByStripeCustomerId(customerId);
      if (artisan) {
        await updateArtisan(artisan.id, { status: "cancelled" });
        console.log(`[Stripe] Abonnement annulé pour client ${customerId}`);
      }
      break;
    }

    default:
      break;
  }

  return NextResponse.json({ received: true });
}
