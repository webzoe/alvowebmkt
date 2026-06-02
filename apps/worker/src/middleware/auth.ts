import { createMiddleware } from 'hono/factory';
import { createClient } from '@supabase/supabase-js';
import type { Env, Variables } from '../types';

export const authMiddleware = createMiddleware<{ Bindings: Env; Variables: Variables }>(
  async (c, next) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    const token = authHeader.slice(7);

    // Delegate verification to Supabase Auth server — no JWT secret needed locally
    const client = createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: { user }, error } = await client.auth.getUser(token);

    if (error || !user) {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }

    c.set('userId', user.id);
    return next();
  },
);
