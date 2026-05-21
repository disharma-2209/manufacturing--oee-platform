import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, Lock, User, AlertCircle, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

export function SetupPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [plantName, setPlantName] = useState('Manufacturing Plant');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) { setError('Passwords do not match'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    setLoading(true);
    try {
      await api.post('/auth/setup', { username, password, plantName });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Setup failed');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-success mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-text-primary mb-2">Setup Complete!</h2>
          <p className="text-text-muted">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-primary rounded-2xl mb-4 shadow-lg">
            <Activity className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-text-primary">First-Run Setup</h1>
          <p className="text-text-muted mt-1">Create your administrator account</p>
        </div>

        <div className="card p-8">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 text-danger rounded-md mb-4 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block label-text mb-1.5">Plant Name</label>
              <input
                type="text"
                value={plantName}
                onChange={(e) => setPlantName(e.target.value)}
                placeholder="e.g. Enphase Manufacturing"
                required
                className="w-full h-9 px-3 text-sm border border-border-col rounded-md bg-bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-text-primary"
              />
            </div>

            <div>
              <label className="block label-text mb-1.5">Admin Username</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  className="w-full h-9 pl-9 pr-3 text-sm border border-border-col rounded-md bg-bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-text-primary"
                />
              </div>
            </div>

            <div>
              <label className="block label-text mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 8 characters"
                  required
                  className="w-full h-9 pl-9 pr-3 text-sm border border-border-col rounded-md bg-bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-text-primary"
                />
              </div>
            </div>

            <div>
              <label className="block label-text mb-1.5">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Repeat password"
                  required
                  className="w-full h-9 pl-9 pr-3 text-sm border border-border-col rounded-md bg-bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-text-primary"
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Admin Account'}
            </Button>
          </form>

          <p className="text-xs text-text-muted text-center mt-4">
            Already have an account?{' '}
            <button onClick={() => navigate('/login')} className="text-primary hover:underline font-medium">
              Sign in
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
