-- AlvoWebMkt – Sprint 3 – Campanhas, Fila de Envio, Limites

-- ─── Alter sending_servers ──────────────────────────────────────────────────
ALTER TABLE sending_servers
  ADD COLUMN IF NOT EXISTS verified_domain          TEXT,
  ADD COLUMN IF NOT EXISTS monthly_limit            INTEGER NOT NULL DEFAULT 15000,
  ADD COLUMN IF NOT EXISTS batch_size               INTEGER NOT NULL DEFAULT 250,
  ADD COLUMN IF NOT EXISTS batch_interval_minutes   INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS monthly_used             INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_used               INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hourly_used              INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_monthly_reset_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_daily_reset_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_hourly_reset_at     TIMESTAMPTZ;

-- Update defaults for existing columns
ALTER TABLE sending_servers
  ALTER COLUMN daily_limit  SET DEFAULT 1500,
  ALTER COLUMN hourly_limit SET DEFAULT 600,
  ALTER COLUMN minute_limit SET DEFAULT 20;

-- ─── campaigns ──────────────────────────────────────────────────────────────
CREATE TABLE campaigns (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id              UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  sending_server_id      UUID NOT NULL REFERENCES sending_servers(id),
  name                   TEXT NOT NULL,
  subject                TEXT NOT NULL,
  preheader              TEXT,
  from_name              TEXT NOT NULL,
  from_email             TEXT NOT NULL,
  reply_to               TEXT,
  html                   TEXT NOT NULL,
  plain_text             TEXT,
  status                 TEXT NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','scheduled','queued','sending','paused','completed','failed','cancelled')),
  send_speed_mode        TEXT NOT NULL DEFAULT 'normal'
                           CHECK (send_speed_mode IN ('safe','normal','fast','custom')),
  batch_size             INTEGER,
  batch_interval_minutes INTEGER,
  max_send_per_hour      INTEGER,
  max_send_per_day       INTEGER,
  total_recipients       INTEGER NOT NULL DEFAULT 0,
  eligible_recipients    INTEGER NOT NULL DEFAULT 0,
  queued_count           INTEGER NOT NULL DEFAULT 0,
  sent_count             INTEGER NOT NULL DEFAULT 0,
  failed_count           INTEGER NOT NULL DEFAULT 0,
  paused_reason          TEXT,
  scheduled_at           TIMESTAMPTZ,
  queued_at              TIMESTAMPTZ,
  started_at             TIMESTAMPTZ,
  completed_at           TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX campaigns_client_id_idx ON campaigns(client_id);
CREATE INDEX campaigns_status_idx    ON campaigns(status);

CREATE TRIGGER campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── campaign_lists ──────────────────────────────────────────────────────────
CREATE TABLE campaign_lists (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  list_id     UUID NOT NULL REFERENCES contact_lists(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX campaign_lists_unique_idx ON campaign_lists(campaign_id, list_id);
CREATE INDEX campaign_lists_campaign_id_idx   ON campaign_lists(campaign_id);

-- ─── campaign_recipients ────────────────────────────────────────────────────
CREATE TABLE campaign_recipients (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id            UUID NOT NULL REFERENCES contacts(id),
  email                 TEXT NOT NULL,
  first_name            TEXT,
  last_name             TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','queued','sending','sent','failed','skipped','unsubscribed','bounced','complained')),
  unsubscribe_token     TEXT NOT NULL UNIQUE,
  provider_message_id   TEXT,
  provider_reference_id TEXT,
  error_message         TEXT,
  queued_at             TIMESTAMPTZ,
  sent_at               TIMESTAMPTZ,
  failed_at             TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX campaign_recipients_unique_idx ON campaign_recipients(campaign_id, contact_id);
CREATE INDEX campaign_recipients_campaign_id_idx   ON campaign_recipients(campaign_id);
CREATE INDEX campaign_recipients_status_idx        ON campaign_recipients(status);

CREATE TRIGGER campaign_recipients_updated_at
  BEFORE UPDATE ON campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── send_queue ──────────────────────────────────────────────────────────────
CREATE TABLE send_queue (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  campaign_recipient_id UUID NOT NULL REFERENCES campaign_recipients(id) ON DELETE CASCADE,
  sending_server_id     UUID NOT NULL REFERENCES sending_servers(id),
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','processing','sent','failed','skipped')),
  attempts              INTEGER NOT NULL DEFAULT 0,
  scheduled_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at             TIMESTAMPTZ,
  processed_at          TIMESTAMPTZ,
  last_error            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX send_queue_pending_idx     ON send_queue(status, scheduled_at) WHERE status = 'pending';
CREATE INDEX send_queue_campaign_id_idx ON send_queue(campaign_id);

-- ─── tracked_links ───────────────────────────────────────────────────────────
CREATE TABLE tracked_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  original_url TEXT NOT NULL,
  label        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX tracked_links_campaign_id_idx ON tracked_links(campaign_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_lists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE send_queue          ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_links       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON campaigns           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON campaign_lists      FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON campaign_recipients FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON send_queue          FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON tracked_links       FOR ALL TO authenticated USING (true) WITH CHECK (true);
