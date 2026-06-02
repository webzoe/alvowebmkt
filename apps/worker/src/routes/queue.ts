import { Hono } from 'hono';
import { processQueueBatch } from '../lib/queue-processor';
import type { Env, Variables } from '../types';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.post('/process', async c => {
  try {
    const result = await processQueueBatch(c.env);
    return c.json(result);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

export { router as queueRouter };
