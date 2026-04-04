-- Migration 004 : ajout du statut trial_expired
-- À exécuter dans Supabase → SQL Editor

ALTER TABLE public.artisans
  DROP CONSTRAINT IF EXISTS artisans_status_check;

ALTER TABLE public.artisans
  ADD CONSTRAINT artisans_status_check
  CHECK (status IN ('pending', 'active', 'cancelled', 'trial_expired'));
