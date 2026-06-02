import { Hono } from 'hono';
import { getSupabase } from '../lib/supabase';
import type { Env, Variables } from '../types';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.get('/', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartIso = monthStart.toISOString();

  const [
    clientsRes, serversRes, listsRes, contactsRes,
    activeContactsRes, suppressedContactsRes,
    campaignsDraftRes, campaignsQueuedRes, campaignsSendingRes, campaignsPausedRes,
    sentThisMonthRes, opensThisMonthRes, clicksThisMonthRes, bouncesThisMonthRes, unsubsThisMonthRes,
    logsRes, importsRes, cleanupsRes,
    serversUsageRes,
  ] = await Promise.all([
    db.from('clients').select('id', { count: 'exact', head: true }),
    db.from('sending_servers').select('id', { count: 'exact', head: true }),
    db.from('contact_lists').select('id', { count: 'exact', head: true }),
    db.from('contacts').select('id', { count: 'exact', head: true }),
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('contacts').select('id', { count: 'exact', head: true }).eq('status', 'suppressed'),
    db.from('campaigns').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    db.from('campaigns').select('id', { count: 'exact', head: true }).eq('status', 'queued'),
    db.from('campaigns').select('id', { count: 'exact', head: true }).eq('status', 'sending'),
    db.from('campaigns').select('id', { count: 'exact', head: true }).eq('status', 'paused'),
    db.from('campaign_recipients').select('id', { count: 'exact', head: true })
      .eq('status', 'sent').gte('sent_at', monthStartIso),
    db.from('open_events').select('id', { count: 'exact', head: true }).gte('opened_at', monthStartIso),
    db.from('click_events').select('id', { count: 'exact', head: true }).gte('clicked_at', monthStartIso),
    db.from('campaign_recipients').select('id', { count: 'exact', head: true }).eq('status', 'bounced').gte('bounced_at', monthStartIso),
    db.from('unsubscribe_events').select('id', { count: 'exact', head: true }).gte('created_at', monthStartIso),
    db.from('send_logs')
      .select('id, status, recipient_email, subject, provider_type, created_at, sending_servers(name)')
      .order('created_at', { ascending: false })
      .limit(10),
    db.from('import_jobs')
      .select('id, status, file_name, total_rows, imported_count, created_at, contact_lists(name), clients(name)')
      .order('created_at', { ascending: false })
      .limit(5),
    db.from('list_cleanups')
      .select('id, total_analyzed, removed_bounced, removed_unsubscribed, removed_complained, removed_suppressed, created_at, contact_lists(name)')
      .order('created_at', { ascending: false })
      .limit(5),
    db.from('sending_servers')
      .select('id, name, monthly_used, monthly_limit, daily_used, daily_limit')
      .eq('status', 'active')
      .order('name'),
  ]);

  return c.json({
    clients_count: clientsRes.count ?? 0,
    servers_count: serversRes.count ?? 0,
    lists_count: listsRes.count ?? 0,
    contacts_count: contactsRes.count ?? 0,
    active_contacts_count: activeContactsRes.count ?? 0,
    suppressed_contacts_count: suppressedContactsRes.count ?? 0,
    opens_this_month: opensThisMonthRes.count ?? 0,
    clicks_this_month: clicksThisMonthRes.count ?? 0,
    bounces_this_month: bouncesThisMonthRes.count ?? 0,
    unsubs_this_month: unsubsThisMonthRes.count ?? 0,
    campaigns_draft: campaignsDraftRes.count ?? 0,
    campaigns_queued: campaignsQueuedRes.count ?? 0,
    campaigns_sending: campaignsSendingRes.count ?? 0,
    campaigns_paused: campaignsPausedRes.count ?? 0,
    sent_this_month: sentThisMonthRes.count ?? 0,
    recent_logs: logsRes.data ?? [],
    recent_imports: importsRes.data ?? [],
    recent_cleanups: cleanupsRes.data ?? [],
    servers_usage: serversUsageRes.data ?? [],
  });
});

export { router as dashboardRouter };
