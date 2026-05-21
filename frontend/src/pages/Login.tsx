import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api-client';

export function LoginPage() {
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await api.post<{ token: string; user: { id: number; username: string; role: 'admin' | 'analyst' | 'viewer'; created_at: string; is_active: number } }>('/auth/login', { username, password });
      setAuth(res.token, res.user);
      navigate('/');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to sign in. Check your credentials and try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex"
      style={{ background: '#FAF6EF' }}
    >
      {/* ── Left: brand panel (desktop) ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[420px] flex-shrink-0 p-12"
        style={{ background: '#000000' }}
      >
        <img src="/assets/enphase-logo-white.svg" alt="Enphase Energy" className="h-[20px]" />

        <div>
          <p
            className="mb-4"
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              fontWeight: 500,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#FF8B49',
            }}
          >
            Manufacturing Intelligence
          </p>
          <h1
            style={{
              fontFamily: "'Enphase Visuelt', sans-serif",
              fontSize: '36px',
              fontWeight: 400,
              lineHeight: 1.15,
              letterSpacing: '-0.01em',
              color: '#FFFFFF',
            }}
          >
            Real-time OEE for every line.
          </h1>
          <p
            className="mt-4"
            style={{
              fontFamily: "'Enphase Visuelt', sans-serif",
              fontSize: '15px',
              color: 'rgba(255,255,255,0.55)',
              lineHeight: 1.55,
            }}
          >
            Track downtime, surface root causes, and act before the next shift.
          </p>
        </div>

        <p
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '9px',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.25)',
          }}
        >
          © {new Date().getFullYear()} Enphase Energy, Inc.
        </p>
      </div>

      {/* ── Right: form panel ── */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-sm">

          {/* Mobile logo */}
          <div className="lg:hidden mb-10 flex justify-center">
            <img src="/assets/enphase-logo.svg" alt="Enphase Energy" className="h-[22px]" />
          </div>

          <p
            className="mb-1"
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              fontWeight: 500,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: '#EA6100',
            }}
          >
            OEE Platform
          </p>
          <h2
            className="mb-8"
            style={{
              fontFamily: "'Enphase Visuelt', sans-serif",
              fontSize: '28px',
              fontWeight: 400,
              letterSpacing: '-0.01em',
              color: '#3C3C3C',
            }}
          >
            Sign in
          </h2>

          {error && (
            <div
              className="flex items-start gap-2.5 p-3.5 rounded-sm mb-5"
              style={{ background: 'rgba(222,33,0,0.07)', border: '1px solid rgba(222,33,0,0.15)' }}
            >
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#DE2100' }} />
              <span
                style={{
                  fontFamily: "'Enphase Visuelt', sans-serif",
                  fontSize: '14px',
                  color: '#DE2100',
                }}
              >
                {error}
              </span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '10px',
                  fontWeight: 500,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: '#7D7D7D',
                  display: 'block',
                  marginBottom: '6px',
                }}
              >
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="your.name"
                required
                autoFocus
                className="w-full transition-all"
                style={{
                  fontFamily: "'Enphase Visuelt', sans-serif",
                  fontSize: '14px',
                  color: '#3C3C3C',
                  background: '#FFFFFF',
                  border: '1px solid #DCDCD6',
                  borderRadius: '10px',
                  padding: '11px 14px',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#EA6100';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(234,97,0,0.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#DCDCD6';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <div>
              <label
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '10px',
                  fontWeight: 500,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: '#7D7D7D',
                  display: 'block',
                  marginBottom: '6px',
                }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full transition-all"
                style={{
                  fontFamily: "'Enphase Visuelt', sans-serif",
                  fontSize: '14px',
                  color: '#3C3C3C',
                  background: '#FFFFFF',
                  border: '1px solid #DCDCD6',
                  borderRadius: '10px',
                  padding: '11px 14px',
                  outline: 'none',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = '#EA6100';
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(234,97,0,0.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = '#DCDCD6';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full transition-all"
              style={{
                fontFamily: "'Enphase Visuelt', sans-serif",
                fontSize: '14px',
                fontWeight: 400,
                background: loading ? '#7D7D7D' : '#3C3C3C',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '9999px',
                padding: '12px 24px',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
              onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#000000'; }}
              onMouseLeave={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.background = '#3C3C3C'; }}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="mt-8 space-y-3" style={{ borderTop: '1px solid #DCDCD6', paddingTop: '24px' }}>
            <p
              className="text-center"
              style={{ fontFamily: "'Enphase Visuelt', sans-serif", fontSize: '13px', color: '#7D7D7D' }}
            >
              First time?{' '}
              <button
                onClick={() => navigate('/setup')}
                style={{ color: '#EA6100', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.textDecoration = 'underline')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.textDecoration = 'none')}
              >
                Create admin account
              </button>
            </p>
            <p
              className="text-center"
              style={{ fontFamily: "'Enphase Visuelt', sans-serif", fontSize: '13px', color: '#7D7D7D' }}
            >
              Need access?{' '}
              <button
                onClick={() => navigate('/register')}
                style={{ color: '#EA6100', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.textDecoration = 'underline')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.textDecoration = 'none')}
              >
                Request it →
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
