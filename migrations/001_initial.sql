-- AlvoWebMkt – Sprint 1 – Initial schema

CREATE TABLE clients (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  company_name  TEXT,
  email         TEXT NOT NULL,
  phone         TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sending_servers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id             UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  provider_type         TEXT NOT NULL CHECK (provider_type IN ('maileroo_api', 'smtp')),
  credentials_encrypted TEXT NOT NULL,
  from_email            TEXT NOT NULL,
  from_name             TEXT NOT NULL,
  reply_to              TEXT,
  daily_limit           INTEGER NOT NULL DEFAULT 1000,
  hourly_limit          INTEGER NOT NULL DEFAULT 100,
  minute_limit          INTEGER NOT NULL DEFAULT 10,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE send_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sending_server_id UUID REFERENCES sending_servers(id) ON DELETE SET NULL,
  client_id         UUID REFERENCES clients(id) ON DELETE SET NULL,
  provider_type     TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('success', 'error')),
  recipient_email   TEXT NOT NULL,
  subject           TEXT NOT NULL,
  provider_response JSONB,
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE campaign_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID REFERENCES clients(id) ON DELETE SET NULL,
  campaign_id      UUID,
  recipient_id     UUID,
  contact_id       UUID,
  event_type       TEXT NOT NULL,
  event_time       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider_type    TEXT,
  provider_payload JSONB,
  metadata         JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER sending_servers_updated_at
  BEFORE UPDATE ON sending_servers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Row Level Security (single-admin platform – authenticated users have full access)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sending_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE send_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON clients
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON sending_servers
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON send_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "authenticated_full_access" ON campaign_events
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
