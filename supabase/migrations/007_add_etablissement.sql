-- Migration 007 : Informations de l'établissement (auto-école, artisan, autre)
ALTER TABLE artisans
  ADD COLUMN IF NOT EXISTS type_etablissement text,
  ADD COLUMN IF NOT EXISTS permis_proposes text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS tarif_heure_conduite integer,
  ADD COLUMN IF NOT EXISTS forfaits text,
  ADD COLUMN IF NOT EXISTS financement_cpf boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS conduite_accompagnee boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS permis_accelere boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS horaires_ouverture text,
  ADD COLUMN IF NOT EXISTS adresse_etablissement text;
