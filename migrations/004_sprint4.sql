-- AlvoWebMkt – Sprint 4 – Tracking, Unsubscribe, Webhooks, Bounce Classification

-- ─── Alter campaign_recipients ───────────────────────────────────────────────
ALTER TABLE campaign_recipients
  ADD COLUMN IF NOT EXISTS delivered_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opened_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clicked_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS complained_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unsubscribed_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS open_count        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS click_count       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounce_type       TEXT,
  ADD COLUMN IF NOT EXISTS rejection_reason  TEXT;

-- Expand status constraint
ALTER TABLE campaign_recipients DROP CONSTRAINT IF EXISTS campaign_recipients_status_check;
ALTER TABLE campaign_recipients ADD CONSTRAINT campaign_recipients_status_check
  CHECK (status IN (
    'pending','queued','sending','sent','failed','skipped',
    'unsubscribed','bounced','complained',
    'delivered','opened','clicked',
    'soft_bounced','blocked_policy','rejected'
  ));

-- ─── Alter campaigns ─────────────────────────────────────────────────────────
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS delivered_count      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opened_count         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicked_count        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bounced_count        INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unsubscribed_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS complained_count     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rejected_count       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS soft_bounced_count   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blocked_policy_count INTEGER NOT NULL DEFAULT 0;

-- ─── open_events ─────────────────────────────────────────────────────────────
CREATE TABLE open_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  campaign_recipient_id UUID NOT NULL REFERENCES campaign_recipients(id) ON DELETE CASCADE,
  contact_id            UUID REFERENCES contacts(id) ON DELETE SET NULL,
  ip                    TEXT,
  user_agent            TEXT,
  opened_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX open_events_campaign_id_idx           ON open_events(campaign_id);
CREATE INDEX open_events_campaign_recipient_id_idx ON open_events(campaign_recipient_id);

-- ─── click_events ────────────────────────────────────────────────────────────
CREATE TABLE click_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  campaign_recipient_id UUID NOT NULL REFERENCES campaign_recipients(id) ON DELETE CASCADE,
  contact_id            UUID REFERENCES contacts(id) ON DELETE SET NULL,
  tracked_link_id       UUID NOT NULL REFERENCES tracked_links(id) ON DELETE CASCADE,
  original_url          TEXT NOT NULL,
  ip                    TEXT,
  user_agent            TEXT,
  clicked_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX click_events_campaign_id_idx           ON click_events(campaign_id);
CREATE INDEX click_events_campaign_recipient_id_idx ON click_events(campaign_recipient_id);
CREATE INDEX click_events_tracked_link_id_idx       ON click_events(tracked_link_id);

-- ─── unsubscribe_events ───────────────────────────────────────────────────────
CREATE TABLE unsubscribe_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id           UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_recipient_id UUID REFERENCES campaign_recipients(id) ON DELETE SET NULL,
  contact_id            UUID REFERENCES contacts(id) ON DELETE SET NULL,
  client_id             UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email                 TEXT NOT NULL,
  reason                TEXT NOT NULL DEFAULT 'unsubscribe',
  ip                    TEXT,
  user_agent            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX unsubscribe_events_client_id_idx ON unsubscribe_events(client_id);
CREATE INDEX unsubscribe_events_email_idx     ON unsubscribe_events(email);

-- ─── webhook_events ───────────────────────────────────────────────────────────
CREATE TABLE webhook_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_type         TEXT NOT NULL,
  event_type            TEXT,
  provider_message_id   TEXT,
  provider_reference_id TEXT,
  campaign_id           UUID,
  campaign_recipient_id UUID,
  payload               JSONB NOT NULL,
  processed             BOOLEAN NOT NULL DEFAULT FALSE,
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at          TIMESTAMPTZ
);

CREATE INDEX webhook_events_provider_type_idx          ON webhook_events(provider_type);
CREATE INDEX webhook_events_provider_message_id_idx    ON webhook_events(provider_message_id);
CREATE INDEX webhook_events_provider_reference_id_idx  ON webhook_events(provider_reference_id);
CREATE INDEX webhook_events_processed_idx              ON webhook_events(processed);

-- ─── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE open_events         ENABLE ROW LEVEL SECURITY;
ALTER TABLE click_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE unsubscribe_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events      ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_full_access" ON open_events        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON click_events       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON unsubscribe_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_full_access" ON webhook_events     FOR ALL TO authenticated USING (true) WITH CHECK (true);
