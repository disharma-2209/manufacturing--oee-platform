import React, { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, BarChart3, AlertTriangle, GitBranch, Sparkles,
  CheckSquare, FileText, Upload, Settings, Activity, Users, Search,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

interface Command {
  label: string;
  icon: React.ElementType;
  action: () => void;
  group: 'Navigate' | 'Admin';
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const allCommands: Command[] = [
    { label: 'Dashboard',          icon: LayoutDashboard, action: () => navigate('/'),                    group: 'Navigate' },
    { label: 'OEE Explorer',       icon: BarChart3,       action: () => navigate('/oee-explorer'),        group: 'Navigate' },
    { label: 'Downtime',           icon: AlertTriangle,   action: () => navigate('/downtime-analysis'),   group: 'Navigate' },
    { label: 'Correlations',       icon: GitBranch,       action: () => navigate('/correlation'),         group: 'Navigate' },
    { label: 'AI Insights',        icon: Sparkles,        action: () => navigate('/ai-insights'),         group: 'Navigate' },
    { label: 'Action Plans',       icon: CheckSquare,     action: () => navigate('/action-plans'),        group: 'Navigate' },
    { label: 'Reports',            icon: FileText,        action: () => navigate('/reports'),             group: 'Navigate' },
    { label: 'Data Upload',        icon: Upload,          action: () => navigate('/upload'),              group: 'Navigate' },
    { label: 'Users',              icon: Users,           action: () => navigate('/user-management'),     group: 'Admin' },
    { label: 'Usage',              icon: Activity,        action: () => navigate('/usage-analytics'),     group: 'Admin' },
    { label: 'Settings',           icon: Settings,        action: () => navigate('/settings'),            group: 'Admin' },
  ];

  const isAdmin = user?.role === 'admin';
  const visibleCommands = allCommands.filter(c => c.group !== 'Admin' || isAdmin);

  const filtered = query.trim()
    ? visibleCommands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : visibleCommands;

  const groups = query.trim()
    ? [{ label: 'Results' as const, items: filtered }]
    : [
        { label: 'Navigate' as const, items: visibleCommands.filter(c => c.group === 'Navigate') },
        ...(isAdmin ? [{ label: 'Admin' as const, items: visibleCommands.filter(c => c.group === 'Admin') }] : []),
      ];

  const flatFiltered = groups.flatMap(g => g.items);

  useEffect(() => { setSelected(0); }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, flatFiltered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
    } else if (e.key === 'Enter') {
      if (flatFiltered[selected]) {
        flatFiltered[selected].action();
        onClose();
      }
    }
  };

  let globalIdx = 0;

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed z-50 left-1/2 -translate-x-1/2 w-full max-w-lg"
          style={{ top: '18vh' }}
          onKeyDown={handleKeyDown}
        >
          <div
            className="overflow-hidden"
            style={{
              background: '#FFFFFF',
              borderRadius: '24px',
              border: '1px solid #DCDCD6',
              boxShadow: '0 12px 32px rgba(60,60,60,0.10), 0 4px 8px rgba(60,60,60,0.06)',
            }}
          >
            {/* Search input row */}
            <div
              className="flex items-center gap-3 px-4"
              style={{ borderBottom: '1px solid #DCDCD6' }}
            >
              <Search className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} style={{ color: '#7D7D7D' }} />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pages and actions..."
                className="flex-1 py-3.5 bg-transparent outline-none"
                style={{
                  fontFamily: "'Enphase Visuelt', sans-serif",
                  fontSize: '14px',
                  color: '#3C3C3C',
                }}
              />
              <kbd
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '10px',
                  background: '#F4F3F0',
                  border: '1px solid #DCDCD6',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  color: '#7D7D7D',
                  flexShrink: 0,
                }}
              >
                ⌘K
              </kbd>
            </div>

            {/* Results */}
            <div className="max-h-64 overflow-y-auto">
              {flatFiltered.length === 0 ? (
                <p
                  className="px-4 py-6 text-center"
                  style={{ fontFamily: "'Enphase Visuelt', sans-serif", fontSize: '14px', color: '#7D7D7D' }}
                >
                  No results for "{query}"
                </p>
              ) : (
                groups.map((group) => (
                  <div key={group.label}>
                    <p
                      className="px-4 pt-3 pb-1 sticky top-0 bg-white"
                      style={{
                        fontFamily: "'DM Mono', monospace",
                        fontSize: '9px',
                        fontWeight: 500,
                        letterSpacing: '0.15em',
                        textTransform: 'uppercase',
                        color: '#7D7D7D',
                      }}
                    >
                      {group.label}
                    </p>
                    {group.items.map((cmd) => {
                      const idx = globalIdx++;
                      const isSelected = idx === selected;
                      const Icon = cmd.icon;
                      return (
                        <button
                          key={cmd.label}
                          onClick={() => { cmd.action(); onClose(); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                          style={{
                            background: isSelected ? '#F4F3F0' : '',
                          }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#F4F3F0')}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = isSelected ? '#F4F3F0' : '')}
                        >
                          <Icon
                            className="w-4 h-4 flex-shrink-0"
                            strokeWidth={1.5}
                            style={{ color: isSelected ? '#EA6100' : '#7D7D7D' }}
                          />
                          <span
                            style={{
                              fontFamily: "'Enphase Visuelt', sans-serif",
                              fontSize: '14px',
                              color: '#3C3C3C',
                            }}
                          >
                            {cmd.label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div
              className="px-4 py-2"
              style={{
                borderTop: '1px solid #DCDCD6',
                fontFamily: "'DM Mono', monospace",
                fontSize: '9px',
                fontWeight: 500,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
                color: '#7D7D7D',
              }}
            >
              ↵ Open · Esc Close
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
