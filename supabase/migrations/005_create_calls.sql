-- Migration 005 : table des appels Vapi
CREATE TABLE IF NOT EXISTS calls (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  artisan_id      uuid        REFERENCES artisans(id) ON DELETE CASCADE,
  vapi_call_id    text        NOT NULL UNIQUE,
  client_name     text,
  client_phone    text,
  duration_seconds integer,
  summary         text,
  transcript      text,
  recording_url   text,
  rdv             text,
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calls_artisan_id_idx ON calls (artisan_id);
CREATE INDEX IF NOT EXISTS calls_started_at_idx ON calls (started_at DESC);
