-- AlvoWebMkt – Sprint 5 – AI Report Texts

CREATE TABLE campaign_report_texts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id       UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  provider          TEXT NOT NULL,
  model             TEXT NOT NULL,
  executive_summary TEXT NOT NULL,
  performance_analysis TEXT,
  technical_diagnosis  JSONB NOT NULL DEFAULT '[]'::JSONB,
  recommendations      JSONB NOT NULL DEFAULT '[]'::JSONB,
  final_notes          TEXT,
  input_snapshot       JSONB NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX campaign_report_texts_campaign_id_idx ON campaign_report_texts(campaign_id);
CREATE INDEX campaign_report_texts_created_at_idx  ON campaign_report_texts(campaign_id, created_at DESC);

ALTER TABLE campaign_report_texts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_full_access" ON campaign_report_texts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
