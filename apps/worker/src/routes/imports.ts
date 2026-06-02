import { Hono } from 'hono';
import { z } from 'zod';
import { getSupabase } from '../lib/supabase';
import { parseCsv, buildContacts, autoDetectMapping, isValidEmail } from '../lib/csv';
import type { Env, Variables } from '../types';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

// ─── Preview ─────────────────────────────────────────────────────────────────

router.post('/preview', async c => {
  const body = (await c.req.json()) as { csv_content?: string };
  if (!body.csv_content?.trim()) return c.json({ error: 'csv_content obrigatório' }, 422);

  try {
    const { headers, rows, separator, rowCount } = parseCsv(body.csv_content);
    const sample = rows.slice(0, 5);
    const { mapping: detected_mapping, extra_columns } = autoDetectMapping(headers);
    return c.json({ headers, sample, separator, rowCount, detected_mapping, extra_columns });
  } catch (e) {
    return c.json({ error: `Erro ao parsear CSV: ${e instanceof Error ? e.message : String(e)}` }, 422);
  }
});

// ─── Import ───────────────────────────────────────────────────────────────────

const importSchema = z.object({
  client_id: z.string().uuid(),
  list_id: z.string().uuid(),
  file_name: z.string().optional(),
  csv_content: z.string().min(1, 'CSV obrigatório'),
  column_mapping: z.object({
    email: z.string().nullable(),
    first_name: z.string().nullable().optional(),
    last_name: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    full_name: z.string().nullable().optional(),
  }),
});

router.post('/', async c => {
  const body = await c.req.json();
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 422);

  const { client_id, list_id, file_name, csv_content, column_mapping } = parsed.data;

  if (!column_mapping.email) return c.json({ error: 'Mapeamento de email obrigatório' }, 422);

  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  // Verify list belongs to client
  const { data: listRow } = await db
    .from('contact_lists')
    .select('id')
    .eq('id', list_id)
    .eq('client_id', client_id)
    .single();

  if (!listRow) return c.json({ error: 'Lista não encontrada para este cliente' }, 404);

  // Create import_job
  const { data: job } = await db
    .from('import_jobs')
    .insert({ client_id, list_id, file_name: file_name ?? null, status: 'processing' })
    .select()
    .single();

  const jobId = (job as { id: string } | null)?.id;

  // Parse CSV
  let parseResult;
  try {
    parseResult = parseCsv(csv_content);
  } catch (e) {
    if (jobId) await db.from('import_jobs').update({ status: 'failed', error_message: 'Erro ao parsear CSV', completed_at: new Date().toISOString() }).eq('id', jobId);
    return c.json({ error: 'Erro ao parsear CSV' }, 422);
  }

  const { headers, rows } = parseResult;
  const totalRows = rows.length;

  // Load suppressions, existing contacts, existing list_contacts in parallel
  const [suppRes, existingRes, lcRes] = await Promise.all([
    db.from('suppressions').select('email').eq('client_id', client_id),
    db.from('contacts').select('id, email, first_name, last_name, phone').eq('client_id', client_id),
    db.from('list_contacts').select('contact_id').eq('list_id', list_id),
  ]);

  const suppressedEmails = new Set((suppRes.data ?? []).map(s => (s as { email: string }).email));
  const existingByEmail = new Map(
    (existingRes.data ?? []).map(c => [(c as { email: string }).email, c as { id: string; email: string; first_name: string | null; last_name: string | null; phone: string | null }]),
  );
  const alreadyInList = new Set((lcRes.data ?? []).map(r => (r as { contact_id: string }).contact_id));

  // Build mapped contacts
  const mapped = buildContacts(headers, rows, {
    email: column_mapping.email,
    first_name: column_mapping.first_name ?? null,
    last_name: column_mapping.last_name ?? null,
    phone: column_mapping.phone ?? null,
    full_name: column_mapping.full_name ?? null,
  });

  let importedCount = 0;
  let duplicateCount = 0;
  let invalidCount = totalRows - mapped.length; // rows that failed basic email validation
  let suppressedCount = 0;

  const toInsert: { client_id: string; email: string; first_name: string | null; last_name: string | null; phone: string | null; custom_fields: Record<string, string> }[] = [];
  const lcInserts: { list_id: string; contact_id: string }[] = [];
  const toUpdate: { id: string; patch: Record<string, unknown> }[] = [];

  for (const row of mapped) {
    if (!isValidEmail(row.email)) { invalidCount++; continue; }

    if (suppressedEmails.has(row.email)) { suppressedCount++; continue; }

    const existing = existingByEmail.get(row.email);

    if (existing) {
      // Update only empty fields
      const patch: Record<string, unknown> = {};
      if (!existing.first_name && row.first_name) patch.first_name = row.first_name;
      if (!existing.last_name && row.last_name) patch.last_name = row.last_name;
      if (!existing.phone && row.phone) patch.phone = row.phone;
      if (Object.keys(patch).length > 0) toUpdate.push({ id: existing.id, patch });

      if (alreadyInList.has(existing.id)) {
        duplicateCount++;
      } else {
        lcInserts.push({ list_id, contact_id: existing.id });
        importedCount++;
      }
    } else {
      toInsert.push({
        client_id,
        email: row.email,
        first_name: row.first_name,
        last_name: row.last_name,
        phone: row.phone,
        custom_fields: row.custom_fields,
      });
    }
  }

  // Batch insert new contacts (chunks of 500)
  const chunkSize = 500;
  const insertedIds: string[] = [];

  for (let i = 0; i < toInsert.length; i += chunkSize) {
    const chunk = toInsert.slice(i, i + chunkSize);
    const { data: ins } = await db.from('contacts').insert(chunk).select('id, email');
    const rows2 = (ins ?? []) as { id: string; email: string }[];
    rows2.forEach(r => insertedIds.push(r.id));
    rows2.forEach(r => lcInserts.push({ list_id, contact_id: r.id }));
    importedCount += rows2.length;
  }

  // Batch update existing contacts (sparse, just fire-and-forget in parallel)
  await Promise.allSettled(
    toUpdate.map(u => db.from('contacts').update(u.patch).eq('id', u.id)),
  );

  // Batch insert list_contacts (upsert to be safe)
  for (let i = 0; i < lcInserts.length; i += chunkSize) {
    const chunk = lcInserts.slice(i, i + chunkSize);
    await db.from('list_contacts').upsert(chunk, { onConflict: 'list_id,contact_id' });
  }

  const completedAt = new Date().toISOString();
  const finalStats = {
    status: 'completed',
    total_rows: totalRows,
    imported_count: importedCount,
    duplicate_count: duplicateCount,
    invalid_count: invalidCount,
    suppressed_count: suppressedCount,
    completed_at: completedAt,
  };

  if (jobId) await db.from('import_jobs').update(finalStats).eq('id', jobId);

  return c.json({ job_id: jobId, ...finalStats });
});

// ─── List jobs ────────────────────────────────────────────────────────────────

router.get('/', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const clientId = c.req.query('client_id');
  const listId = c.req.query('list_id');

  let query = db
    .from('import_jobs')
    .select('*, contact_lists(name), clients(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  if (clientId) query = query.eq('client_id', clientId);
  if (listId) query = query.eq('list_id', listId);

  const { data, error } = await query;
  if (error) return c.json({ error: error.message }, 500);
  return c.json(data ?? []);
});

router.get('/:id', async c => {
  const db = getSupabase(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const { data, error } = await db
    .from('import_jobs')
    .select('*, contact_lists(name), clients(name)')
    .eq('id', c.req.param('id'))
    .single();

  if (error) return c.json({ error: 'Importação não encontrada' }, 404);
  return c.json(data);
});

export { router as importsRouter };
