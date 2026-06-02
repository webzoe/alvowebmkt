export interface AIReportInput {
  campaign: {
    name: string;
    subject: string;
    status: string;
    from_name: string;
    send_speed_mode: string;
    started_at: string | null;
    completed_at: string | null;
  };
  client: { name: string };
  metrics: {
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
  };
  rates: {
    delivery_rate: number;
    open_rate: number;
    click_rate: number;
    ctor: number;
    bounce_rate: number;
    soft_bounce_rate: number;
    rejection_rate: number;
    unsubscribe_rate: number;
    complaint_rate: number;
  };
  top_links: { original_url: string; total_clicks: number; unique_clicks: number }[];
  provider_summary: string;
  delivery_issues: string[];
  warnings: string[];
}

export interface AIReportTextResult {
  executive_summary: string;
  performance_analysis: string;
  technical_diagnosis: string[];
  recommendations: string[];
  final_notes: string;
  provider: string;
  model: string;
}

export interface AIReportProvider {
  getProviderName(): string;
  getModelName(): string;
  generateCampaignReportText(input: AIReportInput): Promise<AIReportTextResult>;
}
