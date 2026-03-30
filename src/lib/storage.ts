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

export async function readArtisans(): Promise<Artisan[]> {
  const { data, error } = await getSupabase()
    .from("artisans")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Supabase readArtisans: ${error.message}`);
  return (data as ArtisanRow[]).map(toArtisan);
}

export async function saveArtisan(artisan: Artisan): Promise<void> {
  const { error } = await getSupabase()
    .from("artisans")
    .upsert(toRow(artisan), { onConflict: "id" });

  if (error) throw new Error(`Supabase saveArtisan: ${error.message}`);
}

export async function findArtisanByEmail(email: string): Promise<Artisan | undefined> {
  const { data, error } = await getSupabase()
    .from("artisans")
    .select("*")
    .eq("email", email)
    .maybeSingle();

  if (error) throw new Error(`Supabase findArtisanByEmail: ${error.message}`);
  return data ? toArtisan(data as ArtisanRow) : undefined;
}

export async function findArtisanById(id: string): Promise<Artisan | undefined> {
  const { data, error } = await getSupabase()
    .from("artisans")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Supabase findArtisanById: ${error.message}`);
  return data ? toArtisan(data as ArtisanRow) : undefined;
}

export async function findArtisanByStripeCustomerId(customerId: string): Promise<Artisan | undefined> {
  const { data, error } = await getSupabase()
    .from("artisans")
    .select("*")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) throw new Error(`Supabase findArtisanByStripeCustomerId: ${error.message}`);
  return data ? toArtisan(data as ArtisanRow) : undefined;
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

  const { data, error } = await getSupabase()
    .from("artisans")
    .update(rowPatch)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) throw new Error(`Supabase updateArtisan: ${error.message}`);
  return data ? toArtisan(data as ArtisanRow) : null;
}
