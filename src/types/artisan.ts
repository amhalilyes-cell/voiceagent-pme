export type MetierType =
  | "plombier"
  | "electricien"
  | "menuisier"
  | "maçon"
  | "peintre"
  | "carreleur"
  | "charpentier"
  | "couvreur"
  | "serrurier"
  | "chauffagiste"
  | "climaticien"
  | "autre";

export type ArtisanStatus = "pending" | "active" | "cancelled";

export interface Artisan {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  nomEntreprise: string;
  metier: MetierType;
  status: ArtisanStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  createdAt: string;
  // Auth & config
  passwordHash?: string;
  refreshToken?: string;
  vapiAssistantId?: string;
  twilioPhoneNumber?: string;
}
