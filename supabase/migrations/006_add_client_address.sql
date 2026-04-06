-- Migration 006 : ajout de l'adresse client dans la table calls
ALTER TABLE calls ADD COLUMN IF NOT EXISTS client_address text;
