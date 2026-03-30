import { getSupabase } from "@/lib/supabase";
import type { Artisan, ArtisanStatus, MetierType } from "@/types/artisan";

// Représentation en base (snake_case)
interface ArtisanRow {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  telephone: string;
  nom_entreprise: string;
  metier: MetierType;
  status: ArtisanStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  created_at: string;
}

function toArtisan(row: ArtisanRow): Artisan {
  return {
    id: row.id,
    prenom: row.prenom,
    nom: row.nom,
    email: row.email,
    telephone: row.telephone,
    nomEntreprise: row.nom_entreprise,
    metier: row.metier,
    status: row.status,
    stripeCustomerId: row.stripe_customer_id ?? undefined,
    stripeSubscriptionId: row.stripe_subscription_id ?? undefined,
    createdAt: row.created_at,
  };
}

function toRow(artisan: Artisan): ArtisanRow {
  return {
    id: artisan.id,
    prenom: artisan.prenom,
    nom: artisan.nom,
    email: artisan.email,
    telephone: artisan.telephone,
    nom_entreprise: artisan.nomEntreprise,
    metier: artisan.metier,
    status: artisan.status,
    stripe_customer_id: artisan.stripeCustomerId ?? null,
    stripe_subscription_id: artisan.stripeSubscriptionId ?? null,
    created_at: artisan.createdAt,
  };
}

/**
 * Formate une erreur Supabase en incluant la cause réseau si présente.
 * Supabase SDK lève une TypeError pour les erreurs réseau (fetch failed),
 * qui ne passent pas par le champ `error` du résultat.
 */
function formatError(context: string, err: unknown): Error {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    const causeMsg = cause instanceof Error ? ` | cause: ${cause.message}` : "";
    return new Error(`Supabase ${context}: ${err.message}${causeMsg}`);
  }
  return new Error(`Supabase ${context}: ${String(err)}`);
}

export async function readArtisans(): Promise<Artisan[]> {
  try {
    const { data, error } = await getSupabase()
      .from("artisans")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data as ArtisanRow[]).map(toArtisan);
  } catch (err) {
    throw formatError("readArtisans", err);
  }
}

export async function saveArtisan(artisan: Artisan): Promise<void> {
  try {
    const { error } = await getSupabase()
      .from("artisans")
      .upsert(toRow(artisan), { onConflict: "id" });

    if (error) throw new Error(error.message);
  } catch (err) {
    throw formatError("saveArtisan", err);
  }
}

export async function findArtisanByEmail(email: string): Promise<Artisan | undefined> {
  try {
    const { data, error } = await getSupabase()
      .from("artisans")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toArtisan(data as ArtisanRow) : undefined;
  } catch (err) {
    throw formatError("findArtisanByEmail", err);
  }
}

export async function findArtisanById(id: string): Promise<Artisan | undefined> {
  try {
    const { data, error } = await getSupabase()
      .from("artisans")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toArtisan(data as ArtisanRow) : undefined;
  } catch (err) {
    throw formatError("findArtisanById", err);
  }
}

export async function findArtisanByStripeCustomerId(customerId: string): Promise<Artisan | undefined> {
  try {
    const { data, error } = await getSupabase()
      .from("artisans")
      .select("*")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toArtisan(data as ArtisanRow) : undefined;
  } catch (err) {
    throw formatError("findArtisanByStripeCustomerId", err);
  }
}

export async function updateArtisan(
  id: string,
  patch: Partial<Artisan>
): Promise<Artisan | null> {
  const rowPatch: Partial<ArtisanRow> = {};
  if (patch.prenom !== undefined) rowPatch.prenom = patch.prenom;
  if (patch.nom !== undefined) rowPatch.nom = patch.nom;
  if (patch.email !== undefined) rowPatch.email = patch.email;
  if (patch.telephone !== undefined) rowPatch.telephone = patch.telephone;
  if (patch.nomEntreprise !== undefined) rowPatch.nom_entreprise = patch.nomEntreprise;
  if (patch.metier !== undefined) rowPatch.metier = patch.metier;
  if (patch.status !== undefined) rowPatch.status = patch.status;
  if (patch.stripeCustomerId !== undefined) rowPatch.stripe_customer_id = patch.stripeCustomerId;
  if (patch.stripeSubscriptionId !== undefined) rowPatch.stripe_subscription_id = patch.stripeSubscriptionId;

  try {
    const { data, error } = await getSupabase()
      .from("artisans")
      .update(rowPatch)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) throw new Error(error.message);
    return data ? toArtisan(data as ArtisanRow) : null;
  } catch (err) {
    throw formatError("updateArtisan", err);
  }
}
