import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Tabs from '@radix-ui/react-tabs';
import * as Dialog from '@radix-ui/react-dialog';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  Users, ClipboardList, MoreVertical, CheckCircle2, XCircle,
  Eye, EyeOff, AlertCircle, ShieldCheck, Shield,
  ChevronDown, RefreshCw, KeyRound,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { ManagedUser, UserRequest } from '@/types';
import { useAuthStore } from '@/store/authStore';

// ── helpers ───────────────────────────────────────────────────────────────────
function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function initials(name: string) {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

const ROLE_STYLE: Record<string, string> = {
  admin:   'bg-purple-100 text-purple-700',
  analyst: 'bg-blue-100 text-blue-700',
  viewer:  'bg-slate-100 text-slate-500',
};

const ROLE_AVATAR: Record<string, string> = {
  admin:   'bg-purple-100 text-purple-700',
  analyst: 'bg-blue-100 text-blue-700',
  viewer:  'bg-slate-100 text-slate-500',
};

const INPUT_CLS =
  'w-full h-9 px-3 text-sm border border-border-col rounded-md bg-bg-surface ' +
  'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary ' +
  'text-text-primary placeholder:text-text-muted';

const SELECT_CLS =
  'h-9 px-3 text-sm border border-border-col rounded-md bg-bg-surface ' +
  'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary ' +
  'text-text-primary cursor-pointer';

// ── Approve Modal ─────────────────────────────────────────────────────────────
function ApproveModal({
  request,
  open,
  onClose,
}: {
  request: UserRequest | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [role, setRole] = useState<'analyst' | 'viewer' | 'admin'>('viewer');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');

  const mut = useMutation({
    mutationFn: (id: number) =>
      api.post(`/users/requests/${id}/approve`, { role, initialPassword: pw }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-requests'] });
      qc.invalidateQueries({ queryKey: ['users-list'] });
      onClose();
      setPw(''); setConfirm(''); setErr('');
    },
    onError: (e: Error) => setErr(e.message),
  });

  const submit = () => {
    if (pw.length < 8) { setErr('Password must be at least 8 characters'); return; }
    if (pw !== confirm) { setErr('Passwords do not match'); return; }
    setErr('');
    if (request) mut.mutate(request.id);
  };

  return (
    <Dialog.Root open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-surface rounded-xl shadow-card-lg border border-border-col p-6">
          <Dialog.Title className="text-base font-semibold text-text-primary mb-1">
            Approve Access for <span className="text-primary">@{request?.username}</span>
          </Dialog.Title>
          <Dialog.Description className="text-xs text-text-muted mb-5">
            This will create an active account. The user can log in immediately.
          </Dialog.Description>

          {err && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 text-danger rounded-md mb-4 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Grant Role</label>
              <select value={role} onChange={e => setRole(e.target.value as typeof role)} className={SELECT_CLS + ' w-full'}>
                <option value="viewer">Viewer — read-only access</option>
                <option value="analyst">Analyst — upload &amp; AI analysis</option>
                <option value="admin">Admin — full access</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Initial Password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  value={pw}
                  onChange={e => setPw(e.target.value)}
                  placeholder="Min. 8 characters"
                  className={INPUT_CLS + ' pr-10'}
                />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Confirm Password</label>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Re-enter password"
                className={INPUT_CLS}
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={submit} disabled={mut.isPending} className="flex-1 bg-success hover:bg-success/90 text-white">
              {mut.isPending ? 'Approving...' : 'Approve & Create Account'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Reject Modal ──────────────────────────────────────────────────────────────
function RejectModal({
  request,
  open,
  onClose,
}: {
  request: UserRequest | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');

  const mut = useMutation({
    mutationFn: (id: number) => api.post(`/users/requests/${id}/reject`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user-requests'] });
      onClose();
      setReason(''); setErr('');
    },
    onError: (e: Error) => setErr(e.message),
  });

  const submit = () => {
    if (reason.trim().length < 10) { setErr('Please provide a reason (min 10 characters)'); return; }
    setErr('');
    if (request) mut.mutate(request.id);
  };

  return (
    <Dialog.Root open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-bg-surface rounded-xl shadow-card-lg border border-border-col p-6">
          <Dialog.Title className="text-base font-semibold text-text-primary mb-1">Reject Access Request</Dialog.Title>
          <Dialog.Description className="text-xs text-text-muted mb-5">
            Provide a reason for rejecting <span className="font-medium text-text-primary">@{request?.username}</span>.
          </Dialog.Description>

          {err && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 text-danger rounded-md mb-4 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Reason (required)</label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Explain why this request is being rejected..."
              rows={4}
              maxLength={500}
              className={INPUT_CLS + ' h-auto py-2 resize-none'}
            />
            <p className="text-[11px] text-text-muted text-right mt-0.5">{reason.length}/500</p>
          </div>

          <div className="flex gap-3 mt-5">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={submit} disabled={mut.isPending}
              className="flex-1 bg-danger hover:bg-danger/90 text-white">
              {mut.isPending ? 'Rejecting...' : 'Reject Request'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Reset Password Modal ──────────────────────────────────────────────────────
function ResetPasswordModal({
  user,
  open,
  onClose,
}: {
  user: ManagedUser | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');

  const mut = useMutation({
    mutationFn: (id: number) => api.post(`/users/${id}/reset-password`, { newPassword: pw }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users-list'] });
      onClose(); setPw(''); setConfirm(''); setErr('');
    },
    onError: (e: Error) => setErr(e.message),
  });

  const submit = () => {
    if (pw.length < 8) { setErr('Password must be at least 8 characters'); return; }
    if (pw !== confirm) { setErr('Passwords do not match'); return; }
    setErr('');
    if (user) mut.mutate(user.id);
  };

  return (
    <Dialog.Root open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-sm bg-bg-surface rounded-xl shadow-card-lg border border-border-col p-6">
          <Dialog.Title className="text-base font-semibold text-text-primary mb-1">
            Reset Password
          </Dialog.Title>
          <Dialog.Description className="text-xs text-text-muted mb-5">
            Set a new password for <span className="font-medium text-text-primary">@{user?.username}</span>.
          </Dialog.Description>

          {err && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 text-danger rounded-md mb-4 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {err}
            </div>
          )}

          <div className="space-y-3">
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={pw}
                onChange={e => setPw(e.target.value)} placeholder="New password (min 8)"
                className={INPUT_CLS + ' pr-10'} />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <input type={showPw ? 'text' : 'password'} value={confirm}
              onChange={e => setConfirm(e.target.value)} placeholder="Confirm new password"
              className={INPUT_CLS} />
          </div>

          <div className="flex gap-3 mt-5">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={submit} disabled={mut.isPending} className="flex-1">
              {mut.isPending ? 'Saving...' : 'Set Password'}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: 'pending' | 'approved' | 'rejected' }) {
  const map = {
    pending:  'bg-warning-light text-warning-text',
    approved: 'bg-success-light text-success-text',
    rejected: 'bg-danger-light text-danger-text',
  };
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${map[status]}`}>
      {status}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function UserManagement() {
  const { user: me } = useAuthStore();
  const qc = useQueryClient();

  // filter for requests tab
  const [reqFilter, setReqFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');

  // modals
  const [approveTarget, setApproveTarget] = useState<UserRequest | null>(null);
  const [rejectTarget, setRejectTarget]   = useState<UserRequest | null>(null);
  const [resetTarget, setResetTarget]     = useState<ManagedUser | null>(null);

  // ── queries ──
  const { data: users = [], isLoading: usersLoading } = useQuery<ManagedUser[]>({
    queryKey: ['users-list'],
    queryFn: () => api.get('/users'),
  });

  const { data: requests = [], isLoading: reqLoading } = useQuery<UserRequest[]>({
    queryKey: ['user-requests'],
    queryFn: () => api.get('/users/requests'),
  });

  const pendingCount = requests.filter((r: UserRequest) => r.status === 'pending').length;

  const filteredRequests =
    reqFilter === 'all' ? requests : requests.filter((r: UserRequest) => r.status === reqFilter);

  // ── mutations ──
  const patchUser = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      api.patch(`/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users-list'] }),
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">Manage access, roles, and pending requests</p>
        </div>
        <button
          onClick={() => {
            qc.invalidateQueries({ queryKey: ['users-list'] });
            qc.invalidateQueries({ queryKey: ['user-requests'] });
          }}
          className="p-2 rounded-lg border border-border-col bg-white hover:bg-bg-muted text-text-muted hover:text-text-primary transition-colors shadow-card"
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Modals */}
      <ApproveModal request={approveTarget} open={!!approveTarget} onClose={() => setApproveTarget(null)} />
      <RejectModal  request={rejectTarget}  open={!!rejectTarget}  onClose={() => setRejectTarget(null)} />
      <ResetPasswordModal user={resetTarget} open={!!resetTarget}  onClose={() => setResetTarget(null)} />

      {/* Tabs */}
      <Tabs.Root defaultValue="users">
        <Tabs.List className="flex gap-1 border-b border-border-col mb-5">
          {([
            { value: 'users',    label: 'Active Users',     icon: Users },
            { value: 'requests', label: 'Access Requests',  icon: ClipboardList, badge: pendingCount },
          ] as const).map(tab => (
            <Tabs.Trigger
              key={tab.value}
              value={tab.value}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-text-muted border-b-2 border-transparent
                         data-[state=active]:border-primary data-[state=active]:text-primary
                         hover:text-text-primary transition-colors -mb-px"
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {'badge' in tab && tab.badge > 0 && (
                <span className="bg-danger text-white text-[10px] font-bold px-1.5 py-px rounded-full leading-none">
                  {tab.badge}
                </span>
              )}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* ━━━━ TAB 1 — Active Users ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <Tabs.Content value="users">
          <div className="card overflow-hidden">
            {usersLoading ? (
              <div className="p-8 text-center text-text-muted text-sm">Loading users...</div>
            ) : users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Users className="w-10 h-10 text-text-muted/30" />
                <p className="text-text-muted text-sm">No users found</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-col bg-bg-muted/40">
                    {['User', 'Email', 'Role', 'Status', 'Last Login', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u: ManagedUser) => {
                    const isSelf = u.id === me?.id;
                    return (
                      <tr key={u.id} className="border-b border-border-col/50 hover:bg-bg-muted/20 transition-colors">
                        {/* User */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${ROLE_AVATAR[u.role] ?? 'bg-slate-100 text-slate-500'}`}>
                              {u.full_name ? initials(u.full_name) : u.username.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-text-primary">
                                {u.full_name || u.username}
                                {isSelf && <span className="ml-1.5 text-[10px] text-primary font-normal">(you)</span>}
                              </p>
                              <p className="text-[11px] text-text-muted">@{u.username}</p>
                            </div>
                          </div>
                        </td>
                        {/* Email */}
                        <td className="px-4 py-3 text-sm text-text-secondary">{u.email || '—'}</td>
                        {/* Role */}
                        <td className="px-4 py-3">
                          <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_STYLE[u.role] ?? ''}`}>
                            {u.role}
                          </span>
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${u.is_active ? 'bg-success-light text-success-text' : 'bg-danger-light text-danger-text'}`}>
                            {u.is_active ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {u.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        {/* Last login */}
                        <td className="px-4 py-3 text-xs text-text-muted">{fmtDate(u.last_login)}</td>
                        {/* Actions */}
                        <td className="px-4 py-3">
                          <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                              <button
                                className="p-1.5 rounded-md hover:bg-bg-muted text-text-muted hover:text-text-primary transition-colors"
                                disabled={isSelf}
                                title={isSelf ? 'Cannot edit your own account here' : 'Actions'}
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                              <DropdownMenu.Content
                                className="z-50 min-w-[180px] bg-bg-surface rounded-lg shadow-card-lg border border-border-col py-1"
                                align="end"
                                sideOffset={4}
                              >
                                {/* Edit Role */}
                                <DropdownMenu.Sub>
                                  <DropdownMenu.SubTrigger className="flex items-center gap-2 w-full px-3 py-2 text-sm text-text-primary hover:bg-bg-muted cursor-pointer">
                                    <Shield className="w-3.5 h-3.5" />
                                    Change Role
                                    <ChevronDown className="w-3 h-3 ml-auto -rotate-90" />
                                  </DropdownMenu.SubTrigger>
                                  <DropdownMenu.Portal>
                                    <DropdownMenu.SubContent className="z-50 min-w-[140px] bg-bg-surface rounded-lg shadow-card-lg border border-border-col py-1" sideOffset={4}>
                                      {(['viewer', 'analyst', 'admin'] as const).map(r => (
                                        <DropdownMenu.Item
                                          key={r}
                                          disabled={u.role === r}
                                          onSelect={() => patchUser.mutate({ id: u.id, body: { role: r } })}
                                          className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-bg-muted disabled:opacity-40 disabled:cursor-not-allowed capitalize"
                                        >
                                          <span className={`w-2 h-2 rounded-full ${r === 'admin' ? 'bg-purple-500' : r === 'analyst' ? 'bg-blue-500' : 'bg-slate-400'}`} />
                                          {r}
                                          {u.role === r && <span className="ml-auto text-[10px] text-text-muted">current</span>}
                                        </DropdownMenu.Item>
                                      ))}
                                    </DropdownMenu.SubContent>
                                  </DropdownMenu.Portal>
                                </DropdownMenu.Sub>

                                {/* Reset password */}
                                <DropdownMenu.Item
                                  onSelect={() => setResetTarget(u)}
                                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-bg-muted"
                                >
                                  <KeyRound className="w-3.5 h-3.5" />
                                  Reset Password
                                </DropdownMenu.Item>

                                <DropdownMenu.Separator className="h-px bg-border-col my-1" />

                                {/* Deactivate / Reactivate */}
                                <DropdownMenu.Item
                                  onSelect={() => patchUser.mutate({ id: u.id, body: { is_active: u.is_active ? 0 : 1 } })}
                                  className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-bg-muted ${u.is_active ? 'text-danger' : 'text-success'}`}
                                >
                                  {u.is_active
                                    ? <><XCircle className="w-3.5 h-3.5" />Deactivate</>
                                    : <><CheckCircle2 className="w-3.5 h-3.5" />Reactivate</>
                                  }
                                </DropdownMenu.Item>
                              </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                          </DropdownMenu.Root>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Tabs.Content>

        {/* ━━━━ TAB 2 — Access Requests ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
        <Tabs.Content value="requests">
          {/* Filter pills */}
          <div className="flex gap-2 mb-4">
            {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
              <button
                key={f}
                onClick={() => setReqFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors capitalize ${
                  reqFilter === f
                    ? 'bg-primary text-white border-primary'
                    : 'border-border-col text-text-muted hover:border-primary/40 hover:text-text-primary'
                }`}
              >
                {f}
                {f === 'pending' && pendingCount > 0 && (
                  <span className="ml-1.5 bg-white/30 text-[10px] px-1 rounded-full">{pendingCount}</span>
                )}
              </button>
            ))}
          </div>

          <div className="card overflow-hidden">
            {reqLoading ? (
              <div className="p-8 text-center text-text-muted text-sm">Loading requests...</div>
            ) : filteredRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <ClipboardList className="w-10 h-10 text-text-muted/30" />
                <p className="text-text-muted text-sm">No {reqFilter !== 'all' ? reqFilter : ''} requests</p>
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border-col bg-bg-muted/40">
                    {['Requested', 'Full Name', 'Username', 'Email', 'Role', 'Reason', 'Status', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.map((r: UserRequest) => (
                    <tr key={r.id} className="border-b border-border-col/50 hover:bg-bg-muted/20 transition-colors">
                      <td className="px-4 py-3 text-xs text-text-muted whitespace-nowrap">{fmtDate(r.requested_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-500 flex-shrink-0">
                            {initials(r.full_name)}
                          </div>
                          <span className="text-sm font-medium text-text-primary">{r.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-text-secondary">@{r.username}</td>
                      <td className="px-4 py-3 text-sm text-text-secondary">{r.email}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${ROLE_STYLE[r.requested_role] ?? ''}`}>
                          {r.requested_role}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="text-xs text-text-muted truncate" title={r.reason ?? undefined}>
                          {r.reason || <span className="italic">—</span>}
                        </p>
                        {r.rejection_reason && (
                          <p className="text-[11px] text-danger mt-0.5 truncate" title={r.rejection_reason}>
                            Reason: {r.rejection_reason}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                      <td className="px-4 py-3">
                        {r.status === 'pending' && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setApproveTarget(r)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-success-light text-success-text hover:bg-success hover:text-white rounded-md transition-colors"
                            >
                              <ShieldCheck className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button
                              onClick={() => setRejectTarget(r)}
                              className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium border border-danger text-danger hover:bg-danger hover:text-white rounded-md transition-colors"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                          </div>
                        )}
                        {r.status !== 'pending' && (
                          <span className="text-xs text-text-muted">{fmtDate(r.reviewed_at)}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

