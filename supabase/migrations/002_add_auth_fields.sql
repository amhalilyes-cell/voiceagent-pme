-- Migration 002 : ajout des colonnes auth et configuration artisan
-- À exécuter dans Supabase → SQL Editor

ALTER TABLE public.artisans
  ADD COLUMN IF NOT EXISTS password_hash        text,
  ADD COLUMN IF NOT EXISTS refresh_token        text,
  ADD COLUMN IF NOT EXISTS vapi_assistant_id    text,
  ADD COLUMN IF NOT EXISTS twilio_phone_number  text;
