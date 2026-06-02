import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabase } from '../lib/supabase';
import type { Env, Variables } from '../types';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

const clientSchema = z.object({
  name: z.string().min(1, 'Nome obrigatório'),
  company_name: z.string().optional(),
  email: z.string().email('E-mail inválido'),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

router.get('/', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db
    .from('clients')
    .select('*')
    .order('name');

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

router.get('/:id', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db
    .from('clients')
    .select('*')
    .eq('id', c.req.param('id'))
    .single();

  if (error) return c.json({ error: 'Cliente não encontrado' }, 404);
  return c.json(data);
});

router.post('/', async c => {
  const body = await c.req.json();
  const parsed = clientSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 422);

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db
    .from('clients')
    .insert(parsed.data)
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data, 201);
});

router.put('/:id', async c => {
  const body = await c.req.json();
  const parsed = clientSchema.partial().safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 422);

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db
    .from('clients')
    .update(parsed.data)
    .eq('id', c.req.param('id'))
    .select()
    .single();

  if (error) return c.json({ error: error.message }, 500);
  return c.json(data);
});

router.delete('/:id', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { error } = await db.from('clients').delete().eq('id', c.req.param('id'));
  if (error) return c.json({ error: error.message }, 500);
  return c.json({ success: true });
});

export { router as clientsRouter };
