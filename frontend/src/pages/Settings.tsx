import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Plus, Trash2, Shield, Target, Users, Clock } from 'lucide-react';
import { api } from '@/lib/api-client';
import { OEESettings } from '@/types';
import { Button } from '@/components/ui/button';

type Tab = 'oee' | 'users' | 'audit';

export function Settings() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>('oee');
  const [saved, setSaved] = useState(false);

  const { data: settings, isLoading } = useQuery<OEESettings>({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings'),
  });

  const { data: users } = useQuery<Array<{ id: number; username: string; full_name: string; role: string; created_at: string; last_login: string }>>({
    queryKey: ['users'],
    queryFn: () => api.get('/settings/users'),
    enabled: activeTab === 'users',
  });

  const { data: auditLogs } = useQuery<Array<{ id: number; username: string; action: string; details: string; created_at: string; ip_address: string }>>({
    queryKey: ['audit-logs'],
    queryFn: () => api.get('/settings/audit'),
    enabled: activeTab === 'audit',
  });

  const [form, setForm] = useState<Partial<OEESettings>>({});

  const saveMutation = useMutation({
    mutationFn: (body: Partial<OEESettings>) => api.put('/settings', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/settings/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const current = { ...settings, ...form };

  const inputCls = 'w-full h-9 px-3 text-sm border border-border-col rounded-md bg-bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-text-primary';

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'oee', label: 'OEE Goals', icon: <Target className="w-4 h-4" /> },
    { id: 'users', label: 'Users', icon: <Users className="w-4 h-4" /> },
    { id: 'audit', label: 'Audit Log', icon: <Clock className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-primary rounded-lg flex items-center justify-center">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <h1 className="text-xl font-bold text-text-primary">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border-col">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* OEE Goals */}
      {activeTab === 'oee' && (
        <div className="card p-6 max-w-2xl">
          <h3 className="section-title mb-5">OEE Goals & Thresholds</h3>
          {isLoading ? (
            <div className="space-y-4">{[...Array(6)].map((_, i) => <div key={i} className="skeleton h-10 w-full" />)}</div>
          ) : (
            <div className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="label-text mb-1.5 block">OEE Goal (%)</label>
                  <input type="number" min="0" max="100" step="0.1" className={inputCls}
                    value={current.oee_goal ?? ''}
                    onChange={(e) => setForm({ ...form, oee_goal: parseFloat(e.target.value) })} />
                </div>
                <div>
                  <label className="label-text mb-1.5 block">Availability Goal (%)</label>
                  <input type="number" min="0" max="100" step="0.1" className={inputCls}
                    value={current.availability_goal ?? ''}
                    onChange={(e) => setForm({ ...form, availability_goal: parseFloat(e.target.value) })} />
                </div>
                <div>
                  <label className="label-text mb-1.5 block">Performance Goal (%)</label>
                  <input type="number" min="0" max="100" step="0.1" className={inputCls}
                    value={current.performance_goal ?? ''}
                    onChange={(e) => setForm({ ...form, performance_goal: parseFloat(e.target.value) })} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="label-text mb-1.5 block">Quality Goal (%)</label>
                  <input type="number" min="0" max="100" step="0.1" className={inputCls}
                    value={current.quality_goal ?? ''}
                    onChange={(e) => setForm({ ...form, quality_goal: parseFloat(e.target.value) })} />
                </div>
                <div>
                  <label className="label-text mb-1.5 block">MTTR Target (min)</label>
                  <input type="number" min="0" className={inputCls}
                    value={current.mttr_target ?? ''}
                    onChange={(e) => setForm({ ...form, mttr_target: parseFloat(e.target.value) })} />
                </div>
                <div>
                  <label className="label-text mb-1.5 block">MTBF Target (hrs)</label>
                  <input type="number" min="0" className={inputCls}
                    value={current.mtbf_target ?? ''}
                    onChange={(e) => setForm({ ...form, mtbf_target: parseFloat(e.target.value) })} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label-text mb-1.5 block">Downtime Warning Threshold (hrs/week)</label>
                  <input type="number" min="0" className={inputCls}
                    value={current.downtime_threshold_warning ?? ''}
                    onChange={(e) => setForm({ ...form, downtime_threshold_warning: parseFloat(e.target.value) })} />
                </div>
                <div>
                  <label className="label-text mb-1.5 block">Downtime Critical Threshold (hrs/week)</label>
                  <input type="number" min="0" className={inputCls}
                    value={current.downtime_threshold_critical ?? ''}
                    onChange={(e) => setForm({ ...form, downtime_threshold_critical: parseFloat(e.target.value) })} />
                </div>
              </div>

              <div>
                <label className="label-text mb-1.5 block">Plant Name</label>
                <input className={inputCls}
                  value={current.plant_name ?? ''}
                  onChange={(e) => setForm({ ...form, plant_name: e.target.value })} />
              </div>

              {saved && (
                <p className="text-sm text-success bg-green-50 rounded-md p-3">Settings saved successfully.</p>
              )}

              <Button
                onClick={() => saveMutation.mutate(form)}
                disabled={saveMutation.isPending || Object.keys(form).length === 0}
                className="gap-2"
              >
                <Save className="w-4 h-4" />
                {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Users */}
      {activeTab === 'users' && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">User Management</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-col">
                  {['Username', 'Full Name', 'Role', 'Last Login', 'Created', ''].map((h) => (
                    <th key={h} className="text-left py-2 pr-4 label-text font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(users || []).map((user) => (
                  <tr key={user.id} className="border-b border-border-col/50 hover:bg-bg-muted/50">
                    <td className="py-2.5 pr-4 font-medium text-text-primary">{user.username}</td>
                    <td className="py-2.5 pr-4 text-text-secondary">{user.full_name || '—'}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        user.role === 'admin' ? 'bg-primary-light text-primary' : 'bg-bg-muted text-text-secondary'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-text-muted text-xs">
                      {user.last_login ? new Date(user.last_login).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="py-2.5 pr-4 text-text-muted text-xs">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2.5">
                      {user.role !== 'admin' && (
                        <button
                          onClick={() => { if (confirm(`Delete user ${user.username}?`)) deleteUserMutation.mutate(user.id); }}
                          className="p-1 text-text-muted hover:text-danger transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Audit Log */}
      {activeTab === 'audit' && (
        <div className="card p-5">
          <h3 className="section-title mb-4">Audit Log</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-col">
                  {['Time', 'User', 'Action', 'Details', 'IP'].map((h) => (
                    <th key={h} className="text-left py-2 pr-4 label-text font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(auditLogs || []).map((log) => (
                  <tr key={log.id} className="border-b border-border-col/50 hover:bg-bg-muted/50">
                    <td className="py-2 pr-4 text-text-muted text-xs whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2 pr-4 font-medium text-text-primary">{log.username}</td>
                    <td className="py-2 pr-4">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-bg-muted text-text-secondary">{log.action}</span>
                    </td>
                    <td className="py-2 pr-4 text-text-secondary text-xs max-w-xs truncate">{log.details}</td>
                    <td className="py-2 text-text-muted text-xs font-mono">{log.ip_address}</td>
                  </tr>
                ))}
                {!auditLogs?.length && (
                  <tr><td colSpan={5} className="py-8 text-center text-text-muted text-sm">No audit entries.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
