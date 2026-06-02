import { Hono } from 'hono';
import { runScheduler } from '../lib/scheduler';
import type { Env, Variables } from '../types';

const router = new Hono<{ Bindings: Env; Variables: Variables }>();

router.post('/run', async c => {
  try {
    const result = await runScheduler(c.env);
    return c.json(result);
  } catch (err) {
    console.error('[scheduler:run]', err);
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

export { router as schedulerRouter };
