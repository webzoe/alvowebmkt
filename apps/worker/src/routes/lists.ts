import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabase } from '../lib/supabase';
import type { Env, Variables } from '../types';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

const listSchema = z.object({
  client_id: z.string().uuid('client_id inválido'),
  name: z.string().min(1, 'Nome obrigatório'),
  description: z.string().optional(),
});

router.get('/', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const clientId = c.req.query('client_id');

  let query = db
    .from('contact_lists')
    .select('*, clients(name), list_contacts(count)')
    .order('name');

  if (clientId) query = query.eq('client_id', clientId);

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500);

  const result = (data ?? []).map(row => {
    const r = row as Record<string, unknown>;
    const lc = r.list_contacts as { count: number }[] | null;
    return { ...r, contact_count: lc?.[0]?.count ?? 0, list_contacts: undefined };
  });

  return c.json(result);
});

router.get('/:id', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db
    .from('contact_lists')
    .select('*, clients(name, company_name), list_contacts(count)')
    .eq('id', c.req.param('id'))
    .single();

  if (error) return c.json({ error: 'Lista não encontrada' }, 404);

  const r = data as Record<string, unknown>;
  const lc = r.list_contacts as { count: number }[] | null;
  return c.json({ ...r, contact_count: lc?.[0]?.count ?? 0, list_contacts: undefined });
});

router.post('/', async c => {
  const body = await c.req.json();
  const parsed = listSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 422);

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db
    .from('contact_lists')
    .insert(parsed.data)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') return c.json({ error: 'Já existe uma lista com esse nome para este cliente' }, 409);
    return c.json({ error: error.message }, 500);
  }

  return c.json({ ...(data as Record<string, unknown>), contact_count: 0 }, 201);
});

router.put('/:id', async c => {
  const body = await c.req.json();
  const parsed = listSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 422);

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db
    .from('contact_lists')
    .update(parsed.data)
    .eq('id', c.req.param('id'))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

router.delete('/:id', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { error } = await db.from('contact_lists').delete().eq('id', c.req.param('id'));
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────

router.post('/:id/cleanup', async c => {
  const listId = c.req.param('id');
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  const { data: list } = await db
    .from('contact_lists')
    .select('client_id')
    .eq('id', listId)
    .single();

  if (!list) return c.json({ error: 'Lista não encontrada' }, 404);
  const clientId = (list as { client_id: string }).client_id;

  // Contacts in list with their status
  const { data: lcData } = await db
    .from('list_contacts')
    .select('id, contact_id, contacts(status, email)')
    .eq('list_id', listId);

  type LcEntry = { id: string; contact_id: string; contacts: { status: string; email: string }[] | null };
  const entries = (lcData ?? []) as unknown as LcEntry[];

  // Suppressions for client (for the email check)
  const { data: suppData } = await db
    .from('suppressions')
    .select('email')
    .eq('client_id', clientId);

  const suppressedEmails = new Set((suppData ?? []).map(s => (s as { email: string }).email));

  const toRemove: string[] = [];
  let removedBounced = 0;
  let removedUnsubscribed = 0;
  let removedComplained = 0;
  let removedSuppressed = 0;

  for (const entry of entries) {
    const contact = Array.isArray(entry.contacts) ? entry.contacts[0] : entry.contacts;
    const status = contact?.status ?? '';
    const email = contact?.email ?? '';
    const inSuppression = suppressedEmails.has(email);

    if (status === 'bounced') { toRemove.push(entry.id); removedBounced++; }
    else if (status === 'unsubscribed') { toRemove.push(entry.id); removedUnsubscribed++; }
    else if (status === 'complained') { toRemove.push(entry.id); removedComplained++; }
    else if (status === 'suppressed' || inSuppression) { toRemove.push(entry.id); removedSuppressed++; }
  }

  if (toRemove.length > 0) {
    await db.from('list_contacts').delete().in('id', toRemove);
  }

  const stats = {
    total_analyzed: entries.length,
    removed_bounced: removedBounced,
    removed_unsubscribed: removedUnsubscribed,
    removed_complained: removedComplained,
    removed_suppressed: removedSuppressed,
    removed_duplicates: 0,
  };

  const { data: cleanup } = await db
    .from('list_cleanups')
    .insert({ client_id: clientId, list_id: listId, ...stats })
    .select()
    .single();

  return c.json({ ...stats, cleanup_id: (cleanup as { id: string } | null)?.id });
});

router.get('/:id/cleanups', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db
    .from('list_cleanups')
    .select('*')
    .eq('list_id', c.req.param('id'))
    .order('created_at', { ascending: false });

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data ?? []);
});

export { router as listsRouter };
