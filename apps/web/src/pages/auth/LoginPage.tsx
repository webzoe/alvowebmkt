import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      setError('E-mail ou senha incorretos.');
      setLoading(false);
      return;
    }

    navigate('/dashboard');
  }

  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        {/* Brand mark */}
        <div className="flex flex-col items-center mb-8 gap-3">
          <div className="size-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <Zap size={20} className="text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-semibold text-ink tracking-tight">AlvoWebMkt</h1>
            <p className="text-sm text-muted mt-0.5">Área administrativa</p>
          </div>
        </div>

        {/* Form card */}
        <div className="bg-surface-card border border-hairline rounded-xl p-6 shadow-card">
          <form onSubmit={e => { void handleSubmit(e); }} className="space-y-4">
            <Input
              label="E-mail"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@exemplo.com"
              required
              autoFocus
              autoComplete="email"
            />
            <Input
              label="Senha"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />

            {error && (
              <p className="text-sm text-error bg-error/8 px-3 py-2.5 rounded-lg border border-error/20">
                {error}
              </p>
            )}

            <Button type="submit" className="w-full" loading={loading}>
              Entrar
            </Button>
          </form>
        </div>

      </div>
    </div>
  );
}
