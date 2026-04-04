-- Migration 003 : ajout de l'essai gratuit et de la réinitialisation de mot de passe
-- À exécuter dans Supabase → SQL Editor

ALTER TABLE public.artisans
  ADD COLUMN IF NOT EXISTS trial_ends_at        timestamptz,
  ADD COLUMN IF NOT EXISTS reset_token          text,
  ADD COLUMN IF NOT EXISTS reset_token_expires  timestamptz;
