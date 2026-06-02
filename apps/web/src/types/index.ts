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
  from_email: string;
  from_name: string;
  reply_to: string | null;
  daily_limit: number;
  hourly_limit: number;
  minute_limit: number;
  status: 'active' | 'inactive';
  has_credentials: boolean;
  created_at: string;
  updated_at: string;
  clients?: { name: string; company_name: string | null };
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
  sending_servers?: { name: string } | null;
}

export interface DashboardStats {
  clients_count: number;
  servers_count: number;
  lists_count: number;
  contacts_count: number;
  active_contacts_count: number;
  suppressed_contacts_count: number;
  campaigns_draft: number;
  campaigns_queued: number;
  campaigns_sending: number;
  campaigns_paused: number;
  sent_this_month: number;
  opens_this_month: number;
  clicks_this_month: number;
  bounces_this_month: number;
  unsubs_this_month: number;
  recent_logs: SendLog[];
  recent_imports: ImportJob[];
  recent_cleanups: ListCleanup[];
  servers_usage: ServerUsage[];
}

export interface ServerUsage {
  id: string;
  name: string;
  monthly_used: number;
  monthly_limit: number;
  daily_used: number;
  daily_limit: number;
}

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
  contact_count: number;
  created_at: string;
  updated_at: string;
  clients?: { name: string };
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
  validation_status: ValidationStatus;
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
  contact_lists?: { name: string } | null;
  clients?: { name: string } | null;
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
  contact_lists?: { name: string } | null;
}

export interface ContactsPaginated {
  data: Contact[];
  total: number;
  page: number;
  limit: number;
}

// ─── Sprint 3 ────────────────────────────────────────────────────────────────

export type CampaignStatus = 'draft' | 'scheduled' | 'queued' | 'sending' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type SendSpeedMode = 'safe' | 'normal' | 'fast' | 'custom';
export type RecipientStatus = 'pending' | 'queued' | 'sending' | 'sent' | 'failed' | 'skipped' | 'unsubscribed' | 'bounced' | 'complained' | 'delivered' | 'opened' | 'clicked' | 'soft_bounced' | 'blocked_policy' | 'rejected';

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
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  soft_bounced_count: number;
  blocked_policy_count: number;
  rejected_count: number;
  unsubscribed_count: number;
  complained_count: number;
  paused_reason: string | null;
  scheduled_at: string | null;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  clients?: { name: string } | null;
  sending_servers?: { name: string; provider_type: string; verified_domain: string | null } | null;
  campaign_lists?: { list_id: string; contact_lists: { name: string } | null }[];
}

export interface CampaignEvent {
  id: string;
  campaign_id: string;
  recipient_id: string | null;
  contact_id: string | null;
  event_type: string;
  event_time: string;
  provider_type: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface TrackedLink {
  id: string;
  campaign_id: string;
  original_url: string;
  label: string | null;
  created_at: string;
  total_clicks: number;
  unique_clicks: number;
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
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  unsubscribed_at: string | null;
  open_count: number;
  click_count: number;
  bounce_type: string | null;
  rejection_reason: string | null;
  created_at: string;
}

export interface RecipientsPaginated {
  data: CampaignRecipient[];
  total: number;
  page: number;
  limit: number;
}

export interface QueueStats {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  skipped: number;
}

export interface ProcessQueueResult {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

export interface SchedulerResult {
  campaigns_scheduled_processed: number;
  queued_created: number;
  queue_processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

// ─── Sprint 5: Campaign Report ────────────────────────────────────────────────

export interface CampaignReportMetrics {
  total_recipients: number;
  eligible_recipients: number;
  sent_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  soft_bounced_count: number;
  blocked_policy_count: number;
  rejected_count: number;
  unsubscribed_count: number;
  complained_count: number;
  failed_count: number;
  total_open_events: number;
  total_click_events: number;
}

export interface CampaignReportRates {
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  ctor: number;
  bounce_rate: number;
  soft_bounce_rate: number;
  rejection_rate: number;
  unsubscribe_rate: number;
  complaint_rate: number;
}

export interface CampaignReport {
  campaign: Campaign;
  client: { id: string; name: string; company_name: string | null } | null;
  sending_server: { name: string; provider_type: string } | null;
  lists_used: { name: string }[];
  metrics: CampaignReportMetrics;
  rates: CampaignReportRates;
  top_links: { original_url: string; label: string | null; total_clicks: number; unique_clicks: number; percentage: number }[];
  opens_by_hour: { hour: string; count: number }[];
  clicks_by_hour: { hour: string; count: number }[];
  summary_text: string;
  technical_diagnosis: string[];
  recommendations: string[];
  generated_at: string;
}

export const SPEED_PRESETS = {
  safe:   { batch_size: 150, batch_interval_minutes: 20, max_send_per_hour: 450,  max_send_per_day: 1000 },
  normal: { batch_size: 250, batch_interval_minutes: 15, max_send_per_hour: 1000, max_send_per_day: 2000 },
  fast:   { batch_size: 500, batch_interval_minutes: 10, max_send_per_hour: 2000, max_send_per_day: 4000 },
} as const;

// ─── AI Report ────────────────────────────────────────────────────────────────

export interface CampaignReportAIText {
  id: string;
  campaign_id: string;
  provider: string;
  model: string;
  executive_summary: string;
  performance_analysis: string;
  technical_diagnosis: string[];
  recommendations: string[];
  final_notes: string;
  created_at: string;
  saved?: boolean;
}
