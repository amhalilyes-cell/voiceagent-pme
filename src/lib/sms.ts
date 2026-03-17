import { BrevoClient, BrevoEnvironment } from "@getbrevo/brevo";

function getBrevoClient(): BrevoClient {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error("BREVO_API_KEY est manquante dans les variables d'environnement");
  return new BrevoClient({ apiKey, environment: BrevoEnvironment.Default });
}

export interface ConfirmationSMSData {
  clientName: string;
  clientPhone: string;
  rdvDate: string;
  rdvHeure?: string;
  companyName: string;
}

/**
 * Normalise un numéro vers le format Brevo (sans +, avec indicatif pays).
 * Ex: "06 12 34 56 78" → "33612345678"
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/[\s.\-()]/g, "");
  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("0")) return "33" + digits.slice(1);
  return digits;
}

export async function sendConfirmationSMS(data: ConfirmationSMSData): Promise<void> {
  const heureStr = data.rdvHeure ? ` à ${data.rdvHeure}` : "";
  const content =
    `Bonjour ${data.clientName},\n` +
    `Votre RDV avec ${data.companyName} est confirmé le ${data.rdvDate}${heureStr}.\n` +
    `Pour toute question, contactez-nous directement.`;

  const client = getBrevoClient();
  await client.transactionalSms.sendAsyncTransactionalSms({
    recipient: normalizePhone(data.clientPhone),
    sender: data.companyName.slice(0, 11),
    content,
    type: "transactional",
  });
}
