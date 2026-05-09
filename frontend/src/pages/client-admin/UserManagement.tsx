import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Mail, X, ShieldCheck, Clock, CheckCircle2, Users } from 'lucide-react';
import { RoleAPI, InviteAPI } from '../../api/client';
import { getActiveCompanyId } from '../../lib/companyContext';
import { useToast } from '../../context/ToastContext';
import { getAvatarGradient } from '../../lib/avatarGradient';

const InviteModal: React.FC<{
  roles: any[];
  onClose: () => void;
  onSend: (email: string, roleIds: string[]) => void;
  sending: boolean;
}> = ({ roles, onClose, onSend, sending }) => {
  const [email, setEmail] = useState('');
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);

  const toggleRole = (id: string) => {
    setSelectedRoles((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-base font-bold text-navy">Invite Team Member</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <X size={16} />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@company.com"
              className="mt-1 w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2 block">Assign Roles</label>
            {roles.length === 0 ? (
              <p className="text-xs text-muted-foreground">No roles defined yet. Create roles first.</p>
            ) : (
              <div className="space-y-2">
                {roles.map((role: any) => (
                  <label key={role.id} className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-muted cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={selectedRoles.includes(role.id)}
                      onChange={() => toggleRole(role.id)}
                      className="accent-navy"
                    />
                    <div>
                      <p className="text-sm font-bold text-navy">{role.name}</p>
                      {role.description && <p className="text-xs text-muted-foreground">{role.description}</p>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3 p-6 border-t border-border">
          <button
            onClick={() => onSend(email, selectedRoles)}
            disabled={sending || !email.trim() || selectedRoles.length === 0}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy/90 transition-colors disabled:opacity-50"
          >
            <Mail size={15} />
            {sending ? 'Sending...' : 'Send Invite'}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-border text-sm font-bold hover:bg-muted transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

const statusBadge = (status: string) => {
  if (status === 'PENDING') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200">
      <Clock size={10} /> Pending
    </span>
  );
  if (status === 'ACCEPTED') return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-green-50 text-green-700 text-xs font-bold border border-green-200">
      <CheckCircle2 size={10} /> Accepted
    </span>
  );
  return (
    <span className="px-2 py-0.5 rounded-lg bg-muted text-muted-foreground text-xs font-bold">{status}</span>
  );
};

const UserManagement: React.FC = () => {
  const companyId = getActiveCompanyId() ?? '';
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [showInvite, setShowInvite] = useState(false);
  const [tab, setTab] = useState<'users' | 'invites'>('users');

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['company-users', companyId],
    queryFn: () => RoleAPI.getUsers(companyId).then((r) => r.data),
    enabled: !!companyId,
  });

  const { data: invites = [], isLoading: invitesLoading } = useQuery({
    queryKey: ['invites', companyId],
    queryFn: () => InviteAPI.list(companyId).then((r) => r.data),
    enabled: !!companyId,
  });

  const { data: roles = [] } = useQuery({
    queryKey: ['roles', companyId],
    queryFn: () => RoleAPI.getAll(companyId).then((r) => r.data),
    enabled: !!companyId,
  });

  const inviteMutation = useMutation({
    mutationFn: (data: { companyId: string; email: string; roleIds: string[] }) => InviteAPI.send(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites', companyId] });
      setShowInvite(false);
      showToast('Invite sent successfully', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.message ?? 'Failed to send invite', 'error'),
  });

  const cancelInviteMutation = useMutation({
    mutationFn: (id: string) => InviteAPI.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites', companyId] });
      showToast('Invite cancelled', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.message ?? 'Failed to cancel invite', 'error'),
  });

  const pendingInvites = invites.filter((i: any) => i.status === 'PENDING');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Team Members</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage who has access and what they can do.</p>
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy/90 transition-colors"
        >
          <UserPlus size={16} /> Invite Member
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-xl w-fit">
        {(['users', 'invites'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors capitalize ${
              tab === t ? 'bg-card text-navy shadow-sm' : 'text-muted-foreground hover:text-navy'
            }`}
          >
            {t === 'users' ? 'Active Users' : `Invites${pendingInvites.length > 0 ? ` (${pendingInvites.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* Active Users */}
      {tab === 'users' && (
        <>
          {usersLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-navy rounded-full animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-12 text-center">
              <Users size={32} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-bold text-navy">No team members yet</p>
              <p className="text-xs text-muted-foreground mt-1">Send an invite to add your first team member.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {users.map((user: any) => (
                <div key={user.id} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold uppercase shrink-0"
                    style={getAvatarGradient(user.firstName || user.email)}
                  >
                    {(user.firstName || user.email || '?')[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-navy">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5 justify-end">
                    {user.roles?.map((role: any) => (
                      <span key={role.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-brand/10 text-xs font-bold text-navy">
                        <ShieldCheck size={10} /> {role.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Invites */}
      {tab === 'invites' && (
        <>
          {invitesLoading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-navy rounded-full animate-spin" />
            </div>
          ) : invites.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-12 text-center">
              <Mail size={32} className="mx-auto text-muted-foreground mb-3" />
              <p className="text-sm font-bold text-navy">No invites sent</p>
              <p className="text-xs text-muted-foreground mt-1">Invite a team member to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {invites.map((invite: any) => (
                <div key={invite.id} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Mail size={16} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-navy">{invite.email}</p>
                    <p className="text-xs text-muted-foreground">
                      Sent {new Date(invite.createdAt).toLocaleDateString()} · Expires {new Date(invite.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {statusBadge(invite.status)}
                    {invite.status === 'PENDING' && (
                      <button
                        onClick={() => {
                          if (window.confirm('Cancel this invite?')) cancelInviteMutation.mutate(invite.id);
                        }}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                        title="Cancel invite"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showInvite && (
        <InviteModal
          roles={roles}
          onClose={() => setShowInvite(false)}
          onSend={(email, roleIds) => inviteMutation.mutate({ companyId, email, roleIds })}
          sending={inviteMutation.isPending}
        />
      )}
    </div>
  );
};

export default UserManagement;
