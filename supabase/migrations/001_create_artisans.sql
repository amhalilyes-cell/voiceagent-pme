-- Migration : création de la table artisans
-- À exécuter dans Supabase → SQL Editor

create table if not exists public.artisans (
  id                    uuid primary key default gen_random_uuid(),
  prenom                text not null,
  nom                   text not null,
  email                 text not null unique,
  telephone             text not null,
  nom_entreprise        text not null,
  metier                text not null,
  status                text not null default 'pending' check (status in ('pending', 'active', 'cancelled')),
  stripe_customer_id    text unique,
  stripe_subscription_id text unique,
  created_at            timestamptz not null default now()
);

-- Index utiles
create index if not exists artisans_email_idx            on public.artisans (email);
create index if not exists artisans_stripe_customer_idx  on public.artisans (stripe_customer_id);
create index if not exists artisans_status_idx           on public.artisans (status);

-- RLS : accès restreint au service role uniquement (les routes API utilisent l'anon key côté serveur)
alter table public.artisans enable row level security;

-- Politique : lecture/écriture autorisée depuis les fonctions serveur (service_role bypass RLS)
-- Si tu utilises l'anon key dans les routes Next.js, ajoute cette politique :
create policy "Service role full access"
  on public.artisans
  for all
  using (true)
  with check (true);
