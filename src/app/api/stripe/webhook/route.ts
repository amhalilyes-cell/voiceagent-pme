import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { updateArtisan, findArtisanByStripeCustomerId } from "@/lib/storage";
import type Stripe from "stripe";

/**
 * POST /api/stripe/webhook
 * Configurer dans Stripe Dashboard → Webhooks :
 *   Endpoint URL : https://votre-domaine.com/api/stripe/webhook
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

      if (artisanId) {
        await updateArtisan(artisanId, {
          status: "active",
          stripeSubscriptionId: subscriptionId,
        });
        console.log(`[Stripe] Artisan ${artisanId} activé — sub: ${subscriptionId}`);
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
