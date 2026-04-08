import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import { updateArtisan, findArtisanById, findArtisanByStripeCustomerId } from "@/lib/storage";
import {
  createVapiAssistant,
  provisionPhoneNumber,
  sendWelcomeEmail,
  setVapiAssistantActive,
  sendReactivationEmail,
} from "@/lib/onboarding";
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

      // 2. Charge l'artisan
      const artisan = await findArtisanById(artisanId);
      if (!artisan) {
        console.error(`[Stripe Webhook] Artisan ${artisanId} introuvable en DB`);
        break;
      }

      // ── CAS A : assistant déjà créé à l'inscription (cas normal) ou réabonnement ──
      if (artisan.vapiAssistantId) {
        console.log(`[Stripe] ✓ Assistant existant détecté (${artisan.vapiAssistantId}) — pas de recréation`);

        // 3a. Réactive l'assistant Vapi
        try {
          await setVapiAssistantActive(artisan.vapiAssistantId, true);
          console.log(`[Stripe] ✓ Assistant Vapi ${artisan.vapiAssistantId} réactivé`);
        } catch (err) {
          console.error(`[Stripe] ✗ Réactivation Vapi échouée pour ${artisan.vapiAssistantId}:`, err);
        }

        // 3b. Achète un numéro Twilio si l'artisan n'en a pas encore
        let phoneNumber = artisan.twilioPhoneNumber;
        if (!phoneNumber) {
          try {
            console.log(`[Stripe] Provisionnement Twilio manquant pour ${artisanId}`);
            phoneNumber = await provisionPhoneNumber(artisan.vapiAssistantId);
            await updateArtisan(artisanId, { twilioPhoneNumber: phoneNumber });
            console.log(`[Stripe] ✓ Numéro Twilio provisionné: ${phoneNumber}`);
          } catch (err) {
            console.error(`[Stripe] ✗ Provisionnement Twilio échoué pour ${artisanId}:`, err);
          }
        } else {
          console.log(`[Stripe] ✓ Numéro Twilio existant: ${phoneNumber}`);
        }

        // 3c. Email de réactivation
        if (phoneNumber) {
          try {
            const updatedArtisan = await findArtisanById(artisanId);
            await sendReactivationEmail(updatedArtisan ?? artisan, phoneNumber);
          } catch (err) {
            console.error(`[Stripe] ✗ Email de réactivation échoué pour ${artisanId}:`, err);
          }
        }
      } else {
        // ── CAS B : onboarding non déclenché à l'inscription (fallback) ──
        console.log(`[Stripe] Aucun assistant Vapi trouvé pour ${artisanId} — onboarding complet`);

        // 3. Crée l'assistant Vapi
        let vapiAssistantId: string | undefined;
        try {
          console.log(`[Stripe] Création assistant Vapi pour ${artisan.nomEntreprise}`);
          vapiAssistantId = await createVapiAssistant(artisan);
          await updateArtisan(artisanId, { vapiAssistantId });
          console.log(`[Stripe] ✓ Assistant Vapi créé: ${vapiAssistantId}`);
        } catch (err) {
          console.error(`[Stripe] ✗ Création assistant Vapi échouée pour ${artisanId}:`, err);
        }

        // 4. Achète et connecte le numéro Twilio (seulement si Vapi a réussi)
        let phoneNumber: string | undefined;
        if (vapiAssistantId) {
          try {
            console.log(`[Stripe] Provisionnement Twilio pour assistant ${vapiAssistantId}`);
            phoneNumber = await provisionPhoneNumber(vapiAssistantId);
            await updateArtisan(artisanId, { twilioPhoneNumber: phoneNumber });
            console.log(`[Stripe] ✓ Numéro Twilio provisionné: ${phoneNumber}`);
          } catch (err) {
            console.error(`[Stripe] ✗ Provisionnement Twilio échoué pour ${artisanId}:`, err);
          }
        }

        // 5. Envoie l'email de bienvenue
        if (phoneNumber) {
          try {
            const updatedArtisan = await findArtisanById(artisanId);
            await sendWelcomeEmail(updatedArtisan ?? artisan, phoneNumber);
          } catch (err) {
            console.error(`[Stripe] ✗ Email de bienvenue échoué pour ${artisanId}:`, err);
          }
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
