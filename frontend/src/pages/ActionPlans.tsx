import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, CheckCircle2, Clock, AlertCircle, Trash2, Edit2, Download, Bot, Sparkles, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '@/lib/api-client';
import { ActionPlan, AIAnalysis } from '@/types';
import { Button } from '@/components/ui/button';
import { getPriorityLabel, formatDate } from '@/lib/utils';

const STATUS_OPTIONS = ['Open', 'In Progress', 'Completed', 'Overdue', 'Cancelled'] as const;
const PRIORITY_OPTIONS = [
  { value: 1, label: 'Critical' },
  { value: 2, label: 'High' },
  { value: 3, label: 'Medium' },
  { value: 4, label: 'Low' },
  { value: 5, label: 'Info' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  'Open': 'bg-blue-50 text-blue-700',
  'In Progress': 'bg-yellow-50 text-yellow-700',
  'Completed': 'bg-green-50 text-green-700',
  'Overdue': 'bg-red-50 text-red-700',
  'Cancelled': 'bg-gray-100 text-gray-500',
};

const PRIORITY_COLORS: Record<number, string> = {
  1: 'bg-red-50 text-red-700',
  2: 'bg-orange-50 text-orange-700',
  3: 'bg-blue-50 text-blue-700',
  4: 'bg-gray-100 text-gray-600',
  5: 'bg-teal-50 text-teal-700',
};

const statusIcon = (status: string) => {
  if (status === 'Completed') return <CheckCircle2 className="w-4 h-4 text-success" />;
  if (status === 'In Progress') return <Clock className="w-4 h-4 text-warning" />;
  if (status === 'Overdue') return <AlertCircle className="w-4 h-4 text-danger" />;
  if (status === 'Cancelled') return <AlertCircle className="w-4 h-4 text-text-muted" />;
  return <AlertCircle className="w-4 h-4 text-primary" />;
};

interface ActionForm {
  description: string;
  action_required: string;
  dri: string;
  priority: number;
  due_date: string;
  line: string;
  area: string;
  remarks: string;
}

const DEFAULT_FORM: ActionForm = {
  description: '', action_required: '', dri: '', priority: 3,
  due_date: '', line: '', area: '', remarks: '',
};

interface AIAction {
  priority: number;
  line: string;
  area: string;
  problemStatement: string;
  rootCauseHypothesis: string;
  recommendedAction: string;
  expectedImpact: string;
  driRole: string;
  suggestedDueDateDays: number;
  successMetric: string;
}

function parseAIActions(response: string): AIAction[] {
  try {
    const start = response.indexOf('{');
    const end = response.lastIndexOf('}');
    if (start === -1 || end === -1) return [];
    const parsed = JSON.parse(response.slice(start, end + 1));
    return Array.isArray(parsed.actions) ? parsed.actions : [];
  } catch { return []; }
}

function dueDateFromDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + (Number(days) || 7));
  return d.toISOString().split('T')[0];
}

const DRIROLE_MAP: Record<string, string> = {
  TE: 'Technical Engineer', ME: 'Maintenance Engineer',
  PE: 'Process Engineer', EM: 'Engineering Manager', '01-PROD': 'Production',
};

export function ActionPlans() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<ActionPlan | null>(null);
  const [form, setForm] = useState<ActionForm>(DEFAULT_FORM);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [accepted, setAccepted] = useState<Set<number>>(new Set());
  const [showAIPanel, setShowAIPanel] = useState(true);

  const { data: response, isLoading } = useQuery<{ actions: ActionPlan[]; total: number }>({
    queryKey: ['action-plans'],
    queryFn: () => api.get('/actions?limit=200'),
  });

  const { data: aiHistory } = useQuery<AIAnalysis[]>({
    queryKey: ['ai-history', 'v2'],
    queryFn: () => api.get('/ai/history'),
    staleTime: 0,
    gcTime: 0,
  });

  const latestActionPlan = useMemo(() => {
    if (!aiHistory) return null;
    return aiHistory.find((h) => h.analysis_type === 'action_plan' && h.response) || null;
  }, [aiHistory]);

  const aiActions = useMemo(() => {
    if (!latestActionPlan?.response) return [];
    return parseAIActions(latestActionPlan.response);
  }, [latestActionPlan]);

  const pendingAIActions = aiActions.filter((_, i) => !dismissed.has(i) && !accepted.has(i));

  const plans = response?.actions || [];

  const createMutation = useMutation({
    mutationFn: (body: ActionForm) => api.post('/actions', body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plans'] });
      setShowForm(false);
      setForm(DEFAULT_FORM);
    },
  });

  const acceptAIMutation = useMutation({
    mutationFn: (body: ActionForm) => api.post('/actions', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['action-plans'] }),
  });

  const handleAccept = (action: AIAction, idx: number) => {
    const p = (Math.min(5, Math.max(1, Number(action.priority) || 3))) as 1|2|3|4|5;
    acceptAIMutation.mutate(
      {
        description: action.problemStatement,
        action_required: action.recommendedAction,
        dri: DRIROLE_MAP[action.driRole] || action.driRole || '',
        priority: p,
        due_date: dueDateFromDays(action.suggestedDueDateDays),
        line: action.line || '',
        area: action.area || '',
        remarks: `Impact: ${action.expectedImpact || ''}. Metric: ${action.successMetric || ''}. Root cause: ${action.rootCauseHypothesis || ''}`,
      },
      { onSuccess: () => setAccepted((prev) => new Set([...prev, idx])) }
    );
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Partial<ActionForm & { status: string }> }) =>
      api.put(`/actions/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['action-plans'] });
      setEditItem(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => api.delete(`/actions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['action-plans'] }),
  });

  const handleExport = async () => {
    const blob = await api.download('/actions/export');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'action-plans.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const filteredPlans = plans.filter((p) => {
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    if (filterPriority !== 'all' && String(p.priority) !== filterPriority) return false;
    return true;
  });

  const inputCls = 'w-full h-9 px-3 text-sm border border-border-col rounded-md bg-bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-text-primary';

  const PRIORITY_LABELS: Record<number, string> = { 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low', 5: 'Info' };
  const PRIORITY_PILL: Record<number, string> = {
    1: 'bg-red-50 text-red-700', 2: 'bg-orange-50 text-orange-700',
    3: 'bg-blue-50 text-blue-700', 4: 'bg-gray-100 text-gray-600', 5: 'bg-teal-50 text-teal-700',
  };

  return (
    <div className="space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between py-0.5">
        <div>
          <h1 className="text-lg font-bold text-text-primary tracking-tight">Action Plans</h1>
          <p className="text-[11px] text-text-muted">Track corrective actions · AI-recommended & manual</p>
        </div>
        <div className="flex gap-1.5">
          <Button variant="outline" size="sm" onClick={handleExport} className="gap-1 text-[11px] h-7 px-2.5">
            <Download className="w-3 h-3" /> Export
          </Button>
          <Button size="sm" onClick={() => { setShowForm(true); setEditItem(null); setForm(DEFAULT_FORM); }} className="gap-1 text-[11px] h-7 px-2.5">
            <Plus className="w-3 h-3" /> New
          </Button>
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        {[
          { label: 'Total', value: plans.length, color: 'text-text-primary' },
          { label: 'Open', value: plans.filter(p => p.status === 'Open').length, color: 'text-primary' },
          { label: 'In Progress', value: plans.filter(p => p.status === 'In Progress').length, color: 'text-warning' },
          { label: 'Completed', value: plans.filter(p => p.status === 'Completed').length, color: 'text-success' },
          { label: 'Overdue', value: plans.filter(p => p.due_date && new Date(p.due_date) < new Date() && p.status !== 'Completed').length, color: 'text-danger' },
        ].map(s => (
          <div key={s.label} className="card px-3 py-2.5 text-center">
            <p className={`font-mono text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* AI Recommendations panel */}
      {aiActions.length > 0 && (
        <div className="border border-primary/20 rounded-lg overflow-hidden">
          <button className="w-full flex items-center justify-between px-3 py-2.5 bg-primary/5 hover:bg-primary/8 transition-colors"
            onClick={() => setShowAIPanel(v => !v)}>
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 bg-primary/15 rounded flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-3 h-3 text-primary" />
              </div>
              <span className="text-[11px] font-semibold text-primary">
                AI Recommended Actions
                {pendingAIActions.length > 0 && <span className="ml-1.5 bg-primary text-white text-[9px] px-1.5 py-px rounded-full">{pendingAIActions.length} pending</span>}
              </span>
              <span className="text-[10px] text-text-muted">{accepted.size} accepted · {dismissed.size} dismissed</span>
            </div>
            {showAIPanel ? <ChevronUp className="w-3.5 h-3.5 text-text-muted" /> : <ChevronDown className="w-3.5 h-3.5 text-text-muted" />}
          </button>

          {showAIPanel && (
            <div className="divide-y divide-border-col/50">
              {aiActions.map((action, idx) => {
                const isAccepted = accepted.has(idx);
                const isDismissed = dismissed.has(idx);
                const p = Math.min(5, Math.max(1, Number(action.priority) || 3)) as 1|2|3|4|5;
                return (
                  <div key={idx} className={`px-3 py-2.5 transition-colors ${isAccepted ? 'bg-green-50/50' : isDismissed ? 'bg-bg-muted/30 opacity-50' : 'bg-bg-surface'}`}>
                    <div className="flex items-start gap-2.5">
                      <span className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-bold mt-0.5 ${PRIORITY_PILL[p]}`}>P{p} {PRIORITY_LABELS[p]}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                          {action.line && <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-px rounded-full">{action.line}</span>}
                          {action.area && <span className="text-[9px] bg-purple-50 text-purple-700 px-1.5 py-px rounded-full">{action.area}</span>}
                          {action.driRole && <span className="text-[9px] bg-gray-100 text-gray-600 px-1.5 py-px rounded-full">{DRIROLE_MAP[action.driRole] || action.driRole}</span>}
                        </div>
                        <p className="text-[10.5px] font-semibold text-text-primary leading-snug">{action.problemStatement}</p>
                        <p className="text-[10px] text-text-secondary mt-0.5">→ {action.recommendedAction}</p>
                        <div className="flex flex-wrap gap-2 mt-1 text-[10px] text-text-muted">
                          {action.expectedImpact && <span className="text-success font-medium">↑ {action.expectedImpact}</span>}
                          {action.suggestedDueDateDays && <span>Due in {action.suggestedDueDateDays}d</span>}
                          {action.successMetric && <span>✓ {action.successMetric}</span>}
                        </div>
                      </div>
                      <div className="flex-shrink-0 flex gap-1 ml-1">
                        {isAccepted ? (
                          <span className="flex items-center gap-0.5 text-[10px] text-success font-semibold"><CheckCircle2 className="w-3 h-3" />Accepted</span>
                        ) : isDismissed ? (
                          <span className="text-[10px] text-text-muted">Dismissed</span>
                        ) : (
                          <>
                            <button onClick={() => handleAccept(action, idx)} disabled={acceptAIMutation.isPending}
                              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-success text-white font-semibold hover:bg-success/90 disabled:opacity-50">
                              <Check className="w-2.5 h-2.5" />Accept
                            </button>
                            <button onClick={() => setDismissed(prev => new Set([...prev, idx]))}
                              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded bg-bg-muted text-text-muted font-semibold hover:bg-danger/10 hover:text-danger">
                              <X className="w-2.5 h-2.5" />Dismiss
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Filters + Form toggle */}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="h-7 px-2 text-[11px] border border-border-col rounded bg-bg-surface text-text-primary focus:outline-none">
          <option value="all">All Status</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
          className="h-7 px-2 text-[11px] border border-border-col rounded bg-bg-surface text-text-primary focus:outline-none">
          <option value="all">All Priority</option>
          {PRIORITY_OPTIONS.map(p => <option key={p.value} value={String(p.value)}>{p.label}</option>)}
        </select>
        <span className="text-[11px] text-text-muted ml-auto">{filteredPlans.length} action{filteredPlans.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Create / Edit Form */}
      {(showForm || editItem) && (
        <div className="card p-3">
          <p className="text-[11px] font-bold text-text-primary mb-2.5">{editItem ? 'Edit Action' : 'New Action Plan'}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            <div className="md:col-span-2">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Problem Description *</label>
              <input className={inputCls} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Describe the problem or finding" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Action Required *</label>
              <textarea className={`${inputCls} h-16 resize-none`} value={form.action_required} onChange={e => setForm({ ...form, action_required: e.target.value })} placeholder="What needs to be done?" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">DRI</label>
              <input className={inputCls} value={form.dri} onChange={e => setForm({ ...form, dri: e.target.value })} placeholder="Person responsible" />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Priority</label>
              <select className={inputCls} value={form.priority} onChange={e => setForm({ ...form, priority: Number(e.target.value) })}>
                {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Due Date</label>
              <input type="date" className={inputCls} value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div>
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Line</label>
              <input className={inputCls} value={form.line} onChange={e => setForm({ ...form, line: e.target.value })} placeholder="e.g. Line 1 (optional)" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[10px] font-semibold text-text-muted uppercase tracking-wider mb-1 block">Remarks</label>
              <input className={inputCls} value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} placeholder="Additional notes (optional)" />
            </div>
          </div>
          <div className="flex gap-1.5 mt-3">
            <Button size="sm" className="h-7 text-[11px]"
              onClick={() => editItem ? updateMutation.mutate({ id: editItem.id as number, body: form }) : createMutation.mutate(form)}
              disabled={!form.description || !form.action_required || createMutation.isPending || updateMutation.isPending}>
              {editItem ? 'Save Changes' : 'Create Action'}
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => { setShowForm(false); setEditItem(null); }}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Plans List */}
      {isLoading ? (
        <div className="space-y-1.5">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-14 w-full" />)}</div>
      ) : filteredPlans.length === 0 ? (
        <div className="card p-8 text-center text-text-muted">
          <p className="text-sm font-medium mb-1">No action plans yet</p>
          <p className="text-[11px]">Create one manually or run AI Analysis to get suggestions.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredPlans.map(plan => {
            const isOverdue = plan.due_date && new Date(plan.due_date) < new Date() && plan.status !== 'Completed';
            return (
              <div key={plan.id} className={`card p-2.5 flex items-center gap-2.5 ${isOverdue ? 'border-l-2 border-l-danger' : ''}`}>
                <div className="flex-shrink-0">{statusIcon(plan.status)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10.5px] font-semibold text-text-primary leading-snug truncate">{plan.description}</p>
                  {plan.action_required && (
                    <p className="text-[10px] text-text-muted mt-0.5 line-clamp-1">→ {plan.action_required}</p>
                  )}
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    <span className={`text-[9px] px-1.5 py-px rounded-full font-bold ${PRIORITY_COLORS[plan.priority] || 'bg-gray-100 text-gray-600'}`}>
                      P{plan.priority} {getPriorityLabel(plan.priority)}
                    </span>
                    <span className={`text-[9px] px-1.5 py-px rounded-full font-semibold ${STATUS_COLORS[plan.status] || 'bg-gray-100 text-gray-500'}`}>{plan.status}</span>
                    {plan.dri && <span className="text-[9px] text-text-muted">{plan.dri}</span>}
                    {plan.line && <span className="text-[9px] text-text-muted">{plan.line}</span>}
                    {plan.due_date && <span className={`text-[9px] ${isOverdue ? 'text-danger font-semibold' : 'text-text-muted'}`}>{formatDate(plan.due_date)}{isOverdue ? ' ⚠' : ''}</span>}
                    {plan.ai_generated === 1 && <span className="text-[9px] bg-purple-50 text-purple-700 px-1.5 py-px rounded-full">✨AI</span>}
                  </div>
                </div>
                <div className="flex-shrink-0 flex items-center gap-1">
                  <select value={plan.status}
                    onChange={e => updateMutation.mutate({ id: plan.id as number, body: { status: e.target.value } })}
                    className="h-6 px-1 text-[10px] border border-border-col rounded bg-bg-surface text-text-primary focus:outline-none">
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button onClick={() => { setEditItem(plan); setForm({ description: plan.description || '', action_required: plan.action_required || '', dri: plan.dri || '', priority: plan.priority || 3, due_date: plan.due_date || '', line: plan.line || '', area: plan.area || '', remarks: plan.remarks || '' }); }}
                    className="p-1 rounded hover:bg-bg-muted text-text-muted hover:text-primary"><Edit2 className="w-3 h-3" /></button>
                  <button onClick={() => { if (confirm('Delete this action?')) deleteMutation.mutate(plan.id as number); }}
                    className="p-1 rounded hover:bg-bg-muted text-text-muted hover:text-danger"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
