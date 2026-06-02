export type ProviderType = 'maileroo_api' | 'smtp';

export interface Client {
  id: string;
  name: string;
  company_name: string | null;
  email: string;
  phone: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SendingServer {
  id: string;
  client_id: string;
  name: string;
  provider_type: ProviderType;
  credentials_encrypted: string;
  from_email: string;
  from_name: string;
  reply_to: string | null;
  daily_limit: number;
  hourly_limit: number;
  minute_limit: number;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface SendLog {
  id: string;
  sending_server_id: string | null;
  client_id: string | null;
  provider_type: string;
  status: 'success' | 'error';
  recipient_email: string;
  subject: string;
  provider_response: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
}

export interface MailerooCredentials {
  api_key: string;
}

export interface SmtpCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  encryption: 'none' | 'ssl' | 'tls';
}

export type RawCredentials = MailerooCredentials | SmtpCredentials;

export interface EmailPayload {
  from_email: string;
  from_name: string;
  reply_to?: string;
  to_email: string;
  to_name?: string;
  subject: string;
  plain_text: string;
  html?: string;
}

export interface SendResult {
  success: boolean;
  response?: Record<string, unknown>;
  error?: string;
}

export type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  SUPABASE_JWT_SECRET: string;
  ENCRYPTION_KEY: string;
  APP_URL: string;
  CRON_SECRET: string;
  MAILEROO_BODY_MODE?: string; // 'json' | 'formdata' | 'urlencoded' – default: 'formdata'
  WEBHOOK_SECRET?: string;
  // ─── AI Report ────────────────────────────────────────────────────────────
  /** 'openai' | 'claude' | 'gemini' | 'disabled' (default: disabled) */
  AI_PROVIDER?: string;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  GEMINI_API_KEY?: string;
  /** Override the default model for the selected provider */
  AI_MODEL?: string;
};

export type Variables = {
  userId: string;
};

// ─── Sprint 2 ────────────────────────────────────────────────────────────────

export type ContactStatus = 'active' | 'unsubscribed' | 'bounced' | 'complained' | 'suppressed';
export type ValidationStatus = 'unknown' | 'valid' | 'invalid' | 'risky' | 'disposable' | 'role' | 'catch_all';
export type SuppressionReason = 'unsubscribe' | 'hard_bounce' | 'complaint' | 'manual' | 'import' | 'validation_invalid' | 'validation_risky';
export type ImportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ContactList {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  client_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  custom_fields: Record<string, unknown>;
  status: ContactStatus;
  bounce_count: number;
  soft_bounce_count: number;
  last_bounce_at: string | null;
  last_sent_at: string | null;
  last_opened_at: string | null;
  last_clicked_at: string | null;
  validation_status: ValidationStatus;
  validation_checked_at: string | null;
  validation_provider: string | null;
  created_at: string;
  updated_at: string;
}

export interface Suppression {
  id: string;
  client_id: string;
  email: string;
  reason: SuppressionReason;
  source: string | null;
  created_at: string;
}

export interface ImportJob {
  id: string;
  client_id: string;
  list_id: string;
  file_name: string | null;
  status: ImportStatus;
  total_rows: number;
  imported_count: number;
  duplicate_count: number;
  invalid_count: number;
  suppressed_count: number;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

// ─── Sprint 3 ────────────────────────────────────────────────────────────────

export type CampaignStatus = 'draft' | 'scheduled' | 'queued' | 'sending' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type SendSpeedMode = 'safe' | 'normal' | 'fast' | 'custom';
export type RecipientStatus = 'pending' | 'queued' | 'sending' | 'sent' | 'failed' | 'skipped' | 'unsubscribed' | 'bounced' | 'complained';

export interface Campaign {
  id: string;
  client_id: string;
  sending_server_id: string;
  name: string;
  subject: string;
  preheader: string | null;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  html: string;
  plain_text: string | null;
  status: CampaignStatus;
  send_speed_mode: SendSpeedMode;
  batch_size: number | null;
  batch_interval_minutes: number | null;
  max_send_per_hour: number | null;
  max_send_per_day: number | null;
  total_recipients: number;
  eligible_recipients: number;
  queued_count: number;
  sent_count: number;
  failed_count: number;
  paused_reason: string | null;
  scheduled_at: string | null;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignRecipient {
  id: string;
  campaign_id: string;
  contact_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  status: RecipientStatus;
  unsubscribe_token: string;
  provider_message_id: string | null;
  error_message: string | null;
  queued_at: string | null;
  sent_at: string | null;
  failed_at: string | null;
  created_at: string;
}

export interface ListCleanup {
  id: string;
  client_id: string;
  list_id: string;
  total_analyzed: number;
  removed_bounced: number;
  removed_unsubscribed: number;
  removed_complained: number;
  removed_suppressed: number;
  removed_duplicates: number;
  created_at: string;
}
