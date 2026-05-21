import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Bell, ChevronRight, Search, Settings, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';

const routeLabels: Record<string, { section: string; label: string }> = {
  '/':                  { section: 'Overview',      label: 'Production overview' },
  '/oee-explorer':      { section: 'Analytics',     label: 'OEE explorer' },
  '/downtime-analysis': { section: 'Analytics',     label: 'Downtime analysis' },
  '/correlation':       { section: 'Analytics',     label: 'Correlation engine' },
  '/ai-insights':       { section: 'Intelligence',  label: 'AI insights' },
  '/action-plans':      { section: 'Intelligence',  label: 'Action plans' },
  '/upload':            { section: 'Operations',    label: 'Data upload' },
  '/reports':           { section: 'Operations',    label: 'Reports' },
  '/user-management':   { section: 'Admin',         label: 'User management' },
  '/usage-analytics':   { section: 'Admin',         label: 'Usage analytics' },
  '/settings':          { section: 'Admin',         label: 'Settings' },
  '/architecture':      { section: 'Admin',         label: 'Architecture' },
};

interface HeaderProps {
  onSearchOpen?: () => void;
}

export function Header({ onSearchOpen }: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();
  const route = routeLabels[location.pathname] ?? { section: 'Platform', label: 'OEE Intelligence' };
  const initials = user?.username?.[0]?.toUpperCase() ?? '?';

  const handleLogout = async () => {
    try { await api.post('/auth/logout', {}); } catch { /* ignore */ }
    clearAuth();
    navigate('/login');
  };

  return (
    <header
      className="fixed top-0 right-0 left-60 h-14 flex items-center justify-between px-5 z-20 transition-all duration-300"
      style={{
        background: '#FFFFFF',
        borderBottom: '1px solid #DCDCD6',
        boxShadow: '0 1px 3px rgba(60,60,60,0.06)',
      }}
    >
      {/* ── Left: breadcrumb ── */}
      <div className="flex items-center gap-1.5 min-w-0">
        <button
          onClick={() => navigate('/')}
          className="transition-colors flex-shrink-0 hover:opacity-70"
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '10px',
            fontWeight: 500,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: '#7D7D7D',
          }}
        >
          {route.section}
        </button>
        <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: '#DCDCD6' }} />
        <span
          className="truncate"
          style={{
            fontFamily: "'Enphase Visuelt', sans-serif",
            fontSize: '14px',
            fontWeight: 500,
            color: '#3C3C3C',
          }}
        >
          {route.label}
        </span>
      </div>

      {/* ── Middle: command palette trigger ── */}
      <button
        onClick={onSearchOpen}
        className="hidden md:flex items-center gap-2 transition-colors"
        style={{
          width: '220px',
          background: '#F4F3F0',
          border: '1px solid #DCDCD6',
          borderRadius: '9999px',
          padding: '6px 16px',
          color: '#7D7D7D',
          fontFamily: "'Enphase Visuelt', sans-serif",
          fontSize: '14px',
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = 'rgba(234,97,0,0.5)')}
        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#DCDCD6')}
      >
        <Search className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
        <span className="flex-1 text-left truncate">Search or jump to...</span>
        <kbd
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '10px',
            background: '#FFFFFF',
            border: '1px solid #DCDCD6',
            borderRadius: '4px',
            padding: '1px 5px',
            color: '#7D7D7D',
          }}
        >
          ⌘K
        </kbd>
      </button>

      {/* ── Right: bell + avatar dropdown ── */}
      <div className="flex items-center gap-1">
        <button
          className="relative p-2 rounded-xs transition-colors"
          style={{ color: '#7D7D7D' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#3C3C3C'; (e.currentTarget as HTMLElement).style.background = '#F4F3F0'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#7D7D7D'; (e.currentTarget as HTMLElement).style.background = ''; }}
        >
          <Bell className="w-[18px] h-[18px]" strokeWidth={1.5} />
          <span
            className="absolute rounded-full"
            style={{ top: '6px', right: '6px', width: '6px', height: '6px', background: '#DE2100' }}
          />
        </button>

        <div className="w-px h-5 mx-1" style={{ background: '#DCDCD6' }} />

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="flex items-center gap-2 rounded-xs px-2 py-1.5 transition-colors outline-none"
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#F4F3F0')}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = '')}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #EA6100, #F45270)' }}
              >
                <span
                  className="text-white"
                  style={{ fontFamily: "'Enphase Visuelt', sans-serif", fontSize: '12px', fontWeight: 500 }}
                >
                  {initials}
                </span>
              </div>
              <span
                className="hidden sm:block"
                style={{ fontFamily: "'Enphase Visuelt', sans-serif", fontSize: '14px', fontWeight: 500, color: '#3C3C3C' }}
              >
                {user?.username}
              </span>
            </button>
          </DropdownMenu.Trigger>

          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className={cn('min-w-[200px] rounded-lg p-1 z-50 animate-scale-in origin-top-right')}
              style={{
                background: '#FFFFFF',
                border: '1px solid #DCDCD6',
                boxShadow: '0 12px 32px rgba(60,60,60,0.10), 0 4px 8px rgba(60,60,60,0.06)',
              }}
            >
              <div className="px-3 py-2.5 mb-1" style={{ borderBottom: '1px solid #DCDCD6' }}>
                <p style={{ fontFamily: "'Enphase Visuelt', sans-serif", fontSize: '14px', fontWeight: 500, color: '#3C3C3C' }}>
                  {user?.username}
                </p>
                <p
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '10px',
                    fontWeight: 500,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: '#7D7D7D',
                    marginTop: '2px',
                  }}
                >
                  {user?.role}
                </p>
              </div>

              <DropdownMenu.Item
                onSelect={() => navigate('/settings')}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xs cursor-pointer outline-none transition-colors"
                style={{ fontFamily: "'Enphase Visuelt', sans-serif", fontSize: '14px', color: '#7D7D7D' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#F4F3F0'; (e.currentTarget as HTMLElement).style.color = '#3C3C3C'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = '#7D7D7D'; }}
              >
                <Settings className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
                Profile and settings
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="h-px my-1" style={{ background: '#DCDCD6' }} />

              <DropdownMenu.Item
                onSelect={handleLogout}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xs cursor-pointer outline-none transition-colors"
                style={{ fontFamily: "'Enphase Visuelt', sans-serif", fontSize: '14px', color: '#DE2100' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = 'rgba(222,33,0,0.06)')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = '')}
              >
                <LogOut className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
                Sign out
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
