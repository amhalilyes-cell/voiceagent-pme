import twilio from "twilio";

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN sont requises");
  }
  return twilio(accountSid, authToken);
}

export interface ConfirmationSMSData {
  clientName: string;
  clientPhone: string;
  rdvDate: string;
  rdvHeure?: string;
  companyName: string;
}

/**
 * Normalise un numéro français vers le format E.164 (+33…).
 * Passe les numéros déjà au format international sans modification.
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/[\s.\-()]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return "+33" + digits.slice(1);
  return "+" + digits;
}

export async function sendConfirmationSMS(data: ConfirmationSMSData): Promise<void> {
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!from) throw new Error("TWILIO_PHONE_NUMBER est manquante dans les variables d'environnement");

  const heureStr = data.rdvHeure ? ` à ${data.rdvHeure}` : "";
  const body =
    `Bonjour ${data.clientName},\n` +
    `Votre rendez-vous avec ${data.companyName} est confirmé le ${data.rdvDate}${heureStr}.\n` +
    `Pour toute question, contactez-nous directement.\n` +
    `— ${data.companyName}`;

  const client = getTwilioClient();
  await client.messages.create({
    body,
    from,
    to: normalizePhone(data.clientPhone),
  });
}
