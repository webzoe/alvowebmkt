import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabase } from '../lib/supabase';
import { isValidEmail } from '../lib/csv';
import type { Env, Variables } from '../types';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

const reasonToStatus: Record<string, string> = {
  unsubscribe: 'unsubscribed',
  hard_bounce: 'bounced',
  complaint: 'complained',
  manual: 'suppressed',
  import: 'suppressed',
  validation_invalid: 'suppressed',
  validation_risky: 'suppressed',
};

const suppressionSchema = z.object({
  client_id: z.string().uuid(),
  email: z.string().email('E-mail inválido'),
  reason: z.enum(['unsubscribe', 'hard_bounce', 'complaint', 'manual', 'import', 'validation_invalid', 'validation_risky']),
  source: z.string().optional(),
});

router.get('/', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const clientId = c.req.query('client_id');
  const search = c.req.query('search');

  let query = db.from('suppressions').select('*').order('created_at', { ascending: false });
  if (clientId) query = query.eq('client_id', clientId);
  if (search) query = query.ilike('email', `%${search}%`);

  const { data, error } = await query.limit(500);
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data ?? []);
});

router.post('/', async c => {
  const body = await c.req.json();
  const parsed = suppressionSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 422);

  const email = parsed.data.email.toLowerCase().trim();
  if (!isValidEmail(email)) return c.json({ error: 'E-mail inválido' }, 422);

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  // Upsert suppression
  const { data, error } = await db
    .from('suppressions')
    .upsert(
      { ...parsed.data, email },
      { onConflict: 'client_id,email' },
    )
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);

  // Update contact status if contact exists
  const newStatus = reasonToStatus[parsed.data.reason] ?? 'suppressed';
  await db
    .from('contacts')
    .update({ status: newStatus })
    .eq('client_id', parsed.data.client_id)
    .eq('email', email);

  return c.json(data, 201);
});

router.delete('/:id', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { error } = await db.from('suppressions').delete().eq('id', c.req.param('id'));
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

export { router as suppressionsRouter };
