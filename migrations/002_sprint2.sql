-- AlvoWebMkt – Sprint 2 – Listas, Contatos, Supressões, Importação

-- contact_lists
CREATE TABLE contact_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX contact_lists_client_name_idx ON contact_lists(client_id, name);
CREATE INDEX contact_lists_client_id_idx ON contact_lists(client_id);

CREATE TRIGGER contact_lists_updated_at
  BEFORE UPDATE ON contact_lists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- contacts
CREATE TABLE contacts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email                TEXT NOT NULL,
  first_name           TEXT,
  last_name            TEXT,
  phone                TEXT,
  custom_fields        JSONB NOT NULL DEFAULT '{}'::JSONB,
  status               TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','unsubscribed','bounced','complained','suppressed')),
  bounce_count         INTEGER NOT NULL DEFAULT 0,
  soft_bounce_count    INTEGER NOT NULL DEFAULT 0,
  last_bounce_at       TIMESTAMPTZ,
  last_sent_at         TIMESTAMPTZ,
  last_opened_at       TIMESTAMPTZ,
  last_clicked_at      TIMESTAMPTZ,
  validation_status    TEXT NOT NULL DEFAULT 'unknown'
                         CHECK (validation_status IN ('unknown','valid','invalid','risky','disposable','role','catch_all')),
  validation_checked_at TIMESTAMPTZ,
  validation_provider  TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX contacts_client_email_idx ON contacts(client_id, email);
CREATE INDEX contacts_client_id_idx ON contacts(client_id);
CREATE INDEX contacts_email_idx ON contacts(email);
CREATE INDEX contacts_status_idx ON contacts(status);
CREATE INDEX contacts_validation_status_idx ON contacts(validation_status);

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- list_contacts  (pivô)
CREATE TABLE list_contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id      UUID NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  contact_id   UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX list_contacts_list_contact_idx ON list_contacts(list_id, contact_id);
CREATE INDEX list_contacts_list_id_idx ON list_contacts(list_id);
CREATE INDEX list_contacts_contact_id_idx ON list_contacts(contact_id);

-- suppressions
CREATE TABLE suppressions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  reason     TEXT NOT NULL
               CHECK (reason IN ('unsubscribe','hard_bounce','complaint','manual','import','validation_invalid','validation_risky')),
  source     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX suppressions_client_email_idx ON suppressions(client_id, email);
CREATE INDEX suppressions_client_id_idx ON suppressions(client_id);
CREATE INDEX suppressions_email_idx ON suppressions(email);
CREATE INDEX suppressions_reason_idx ON suppressions(reason);

-- import_jobs
CREATE TABLE import_jobs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  list_id          UUID NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  file_name        TEXT,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','processing','completed','failed')),
  total_rows       INTEGER NOT NULL DEFAULT 0,
  imported_count   INTEGER NOT NULL DEFAULT 0,
  duplicate_count  INTEGER NOT NULL DEFAULT 0,
  invalid_count    INTEGER NOT NULL DEFAULT 0,
  suppressed_count INTEGER NOT NULL DEFAULT 0,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

-- list_cleanups
CREATE TABLE list_cleanups (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id            UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  list_id              UUID NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  total_analyzed       INTEGER NOT NULL DEFAULT 0,
  removed_bounced      INTEGER NOT NULL DEFAULT 0,
  removed_unsubscribed INTEGER NOT NULL DEFAULT 0,
  removed_complained   INTEGER NOT NULL DEFAULT 0,
  removed_suppressed   INTEGER NOT NULL DEFAULT 0,
  removed_duplicates   INTEGER NOT NULL DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS – mesma política de admin total para usuários autenticados
ALTER TABLE contact_lists  ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_contacts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppressions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_cleanups   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON contact_lists  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON contacts        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON list_contacts   FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON suppressions    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON import_jobs     FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON list_cleanups   FOR ALL TO authenticated USING (true) WITH CHECK (true);
