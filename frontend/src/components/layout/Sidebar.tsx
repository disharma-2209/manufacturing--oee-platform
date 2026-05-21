import React, { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import * as Tooltip from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api-client';
import {
  LayoutDashboard, BarChart3, AlertTriangle, GitBranch, Sparkles,
  CheckSquare, FileText, Upload, Settings, Activity,
  ChevronLeft, ChevronRight, Users, LogOut,
} from 'lucide-react';

interface NavItem {
  path: string;
  label: string;
  icon: React.ElementType;
  badge?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
}

const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [
      { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { path: '/oee-explorer',      label: 'OEE Explorer',  icon: BarChart3 },
      { path: '/downtime-analysis', label: 'Downtime',      icon: AlertTriangle },
      { path: '/correlation',       label: 'Correlations',  icon: GitBranch },
    ],
  },
  {
    label: 'Intelligence',
    items: [
      { path: '/ai-insights',  label: 'AI Insights',  icon: Sparkles,   badge: 'AI' },
      { path: '/action-plans', label: 'Action Plans', icon: CheckSquare },
    ],
  },
  {
    label: 'Operations',
    items: [
      { path: '/upload',  label: 'Data Upload', icon: Upload },
      { path: '/reports', label: 'Reports',     icon: FileText },
    ],
  },
  {
    label: 'Admin',
    adminOnly: true,
    items: [
      { path: '/user-management', label: 'Users',    icon: Users },
      { path: '/usage-analytics', label: 'Usage',    icon: Activity },
      { path: '/settings',        label: 'Settings', icon: Settings },
    ],
  },
];

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, clearAuth } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    const fetchPending = async () => {
      try {
        const data = await api.get<{ id: number }[]>('/users/requests?status=pending');
        setPendingCount(Array.isArray(data) ? data.length : 0);
      } catch {
        /* ignore — silently fail */
      }
    };
    fetchPending();
    intervalRef.current = setInterval(fetchPending, 60_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isAdmin]);

  const handleLogout = async () => {
    try { await api.post('/auth/logout', {}); } catch { /* ignore */ }
    clearAuth();
    navigate('/login');
  };

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  return (
    <Tooltip.Provider delayDuration={300}>
      <aside
        style={{ borderRight: '1px solid #2A2A2A' }}
        className={cn(
          'fixed left-0 top-0 h-full flex flex-col z-30 transition-all duration-300',
          'bg-[#000000]',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        {/* ── Logo area ── */}
        <div
          style={{ borderBottom: '1px solid #2A2A2A' }}
          className={cn(
            'flex items-center h-16 flex-shrink-0',
            collapsed ? 'justify-center' : 'px-5'
          )}
        >
          {collapsed ? (
            <img src="/assets/enphase-mark.svg" alt="Enphase" className="w-7 h-7" />
          ) : (
            <img src="/assets/enphase-logo-white.svg" alt="Enphase Energy" className="h-[22px]" />
          )}
        </div>

        {/* ── Nav groups ── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {navGroups.map((group, gi) => {
            if (group.adminOnly && !isAdmin) return null;
            return (
              <div key={group.label}>
                {!collapsed && (
                  <p
                    className={cn('px-4 pb-1', gi === 0 ? 'pt-3' : 'pt-5')}
                    style={{
                      fontFamily: "'DM Mono', monospace",
                      fontSize: '9px',
                      fontWeight: 500,
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase',
                      color: 'rgba(220,220,214,0.35)',
                    }}
                  >
                    {group.label}
                  </p>
                )}
                {collapsed && gi > 0 && (
                  <div className="h-px mx-3 my-2" style={{ background: '#2A2A2A' }} />
                )}

                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.path);

                  const itemEl = (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={cn(
                        'flex items-center transition-colors duration-150 relative',
                        collapsed
                          ? 'justify-center w-10 h-10 mx-auto my-0.5 rounded-xs'
                          : 'mx-2 px-3 py-2.5 rounded-xs gap-3',
                        active
                          ? 'border-l-[2px] border-[#FF8B49]'
                          : ''
                      )}
                      style={
                        active
                          ? {
                              background: 'rgba(255,139,73,0.12)',
                              color: '#FFFFFF',
                              paddingLeft: collapsed ? undefined : '10px',
                            }
                          : { color: '#DCDCD6' }
                      }
                      onMouseEnter={(e) => {
                        if (!active) {
                          (e.currentTarget as HTMLElement).style.background = '#2A2A2A';
                          (e.currentTarget as HTMLElement).style.color = '#FFFFFF';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          (e.currentTarget as HTMLElement).style.background = '';
                          (e.currentTarget as HTMLElement).style.color = '#DCDCD6';
                        }
                      }}
                    >
                      <Icon
                        className="flex-shrink-0 w-4 h-4"
                        strokeWidth={1.5}
                        style={{ color: active ? '#FFFFFF' : '#DCDCD6' }}
                      />
                      {!collapsed && (
                        <>
                          <span
                            className="truncate flex-1"
                            style={{
                              fontFamily: "'Enphase Visuelt', sans-serif",
                              fontSize: '14px',
                              fontWeight: 400,
                            }}
                          >
                            {item.label}
                          </span>
                          {item.badge && (
                            <span
                              className="px-1.5 py-0.5 rounded-full leading-none"
                              style={{
                                fontFamily: "'DM Mono', monospace",
                                fontSize: '9px',
                                fontWeight: 500,
                                letterSpacing: '0.12em',
                                textTransform: 'uppercase',
                                background: 'rgba(255,139,73,0.18)',
                                color: '#FF8B49',
                              }}
                            >
                              {item.badge}
                            </span>
                          )}
                          {item.path === '/user-management' && pendingCount > 0 && (
                            <span
                              className="px-1.5 py-0.5 rounded-full leading-none text-black font-bold"
                              style={{
                                fontFamily: "'DM Mono', monospace",
                                fontSize: '9px',
                                background: '#FF8B49',
                              }}
                            >
                              {pendingCount}
                            </span>
                          )}
                        </>
                      )}
                      {collapsed && item.path === '/user-management' && pendingCount > 0 && (
                        <span
                          className="absolute top-0.5 right-0.5 w-4 h-4 text-black text-[8px] font-bold rounded-full flex items-center justify-center leading-none"
                          style={{ background: '#FF8B49' }}
                        >
                          {pendingCount}
                        </span>
                      )}
                    </NavLink>
                  );

                  if (collapsed) {
                    return (
                      <Tooltip.Root key={item.path}>
                        <Tooltip.Trigger asChild>{itemEl}</Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content
                            side="right"
                            sideOffset={8}
                            className="text-white text-xs px-2.5 py-1.5 rounded-xs shadow-card-lg z-50 animate-scale-in"
                            style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
                          >
                            {item.label}
                            {item.badge && (
                              <span
                                className="ml-1.5 px-1 rounded-full"
                                style={{
                                  fontFamily: "'DM Mono', monospace",
                                  fontSize: '9px',
                                  background: 'rgba(255,139,73,0.18)',
                                  color: '#FF8B49',
                                }}
                              >
                                {item.badge}
                              </span>
                            )}
                            <Tooltip.Arrow style={{ fill: '#1A1A1A' }} />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    );
                  }
                  return itemEl;
                })}
              </div>
            );
          })}
        </nav>

        {/* ── Bottom: user card + collapse ── */}
        <div className="flex-shrink-0">
          <div className="h-px mx-3 my-2" style={{ background: '#2A2A2A' }} />

          {!collapsed ? (
            <div className="flex items-center gap-2 px-3 py-2 mx-2 rounded-xs transition-colors" style={{ cursor: 'default' }}>
              <div
                className="w-[30px] h-[30px] rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: '#3C3C3C' }}
              >
                <span
                  className="text-white"
                  style={{ fontFamily: "'Enphase Visuelt', sans-serif", fontSize: '12px', fontWeight: 500 }}
                >
                  {user?.username?.[0]?.toUpperCase() ?? '?'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p
                  className="text-white leading-tight truncate"
                  style={{ fontFamily: "'Enphase Visuelt', sans-serif", fontSize: '13px', fontWeight: 500 }}
                >
                  {user?.username}
                </p>
                <span
                  className="px-2 py-0.5 rounded-full capitalize"
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '9px',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    background: '#2A2A2A',
                    color: '#DCDCD6',
                  }}
                >
                  {user?.role}
                </span>
              </div>
              <button
                onClick={handleLogout}
                title="Sign out"
                className="flex-shrink-0 transition-colors"
                style={{ color: '#DCDCD6' }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#FFFFFF')}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#DCDCD6')}
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center w-10 h-10 mx-auto rounded-xs transition-colors"
                  style={{ color: '#DCDCD6' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = '#FFFFFF'; (e.currentTarget as HTMLElement).style.background = '#2A2A2A'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = '#DCDCD6'; (e.currentTarget as HTMLElement).style.background = ''; }}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="right"
                  sideOffset={8}
                  className="text-white text-xs px-2.5 py-1.5 rounded-xs shadow-card-lg z-50"
                  style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
                >
                  Sign out
                  <Tooltip.Arrow style={{ fill: '#1A1A1A' }} />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          )}

          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'flex items-center justify-center h-9 w-full transition-colors mb-2',
              !collapsed && 'gap-2'
            )}
            style={{ color: '#DCDCD6', fontFamily: "'Enphase Visuelt', sans-serif", fontSize: '12px' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#FFFFFF')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#DCDCD6')}
          >
            {collapsed
              ? <ChevronRight className="w-4 h-4" />
              : <><ChevronLeft className="w-4 h-4" /><span>Collapse</span></>
            }
          </button>
        </div>
      </aside>
    </Tooltip.Provider>
  );
}
