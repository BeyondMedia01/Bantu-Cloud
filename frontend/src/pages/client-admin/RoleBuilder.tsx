import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, ShieldCheck, Check } from 'lucide-react';
import { RoleAPI } from '../../api/client';
import { getActiveCompanyId } from '../../lib/companyContext';
import { useToast } from '../../context/ToastContext';

const MODULES = [
  { key: 'PEOPLE',     label: 'People',      desc: 'Employees, grades, departments, documents' },
  { key: 'TIME_LEAVE', label: 'Time & Leave', desc: 'Attendance, shifts, roster, leave' },
  { key: 'PAYROLL',    label: 'Payroll',      desc: 'Payroll runs, payslips, transaction codes' },
  { key: 'COMPLIANCE', label: 'Compliance',   desc: 'ZIMRA, NSSA, NEC, statutory exports' },
  { key: 'REPORTS',    label: 'Reports',      desc: 'Payroll summary, audit logs, analytics' },
  { key: 'SETTINGS',   label: 'Settings',     desc: 'Company settings, system configuration' },
] as const;

type ModuleKey = typeof MODULES[number]['key'];

const MODULE_ACTIONS: Record<ModuleKey, string[]> = {
  PEOPLE:     ['VIEW', 'EDIT', 'DELETE'],
  TIME_LEAVE: ['VIEW', 'EDIT', 'APPROVE'],
  PAYROLL:    ['VIEW', 'EDIT', 'RUN', 'EXPORT'],
  COMPLIANCE: ['VIEW', 'EXPORT', 'CONFIGURE'],
  REPORTS:    ['VIEW', 'EXPORT'],
  SETTINGS:   ['VIEW', 'CONFIGURE'],
};

type PermissionMap = Partial<Record<ModuleKey, string[]>>;

interface RoleFormProps {
  initial?: { name: string; description: string; permissions: PermissionMap };
  onSave: (data: { name: string; description: string; permissions: { module: string; actions: string[] }[] }) => void;
  onCancel: () => void;
  saving: boolean;
}

const RoleForm: React.FC<RoleFormProps> = ({ initial, onSave, onCancel, saving }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [permissions, setPermissions] = useState<PermissionMap>(initial?.permissions ?? {});

  const toggleModule = (mod: ModuleKey) => {
    setPermissions((prev) => {
      const next = { ...prev };
      if (next[mod]) { delete next[mod]; } else { next[mod] = ['VIEW']; }
      return next;
    });
  };

  const toggleAction = (mod: ModuleKey, action: string) => {
    setPermissions((prev) => {
      const current = prev[mod] ?? [];
      const updated = current.includes(action)
        ? current.filter((a) => a !== action)
        : [...current, action];
      return { ...prev, [mod]: updated };
    });
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim(),
      permissions: Object.entries(permissions).map(([module, actions]) => ({ module, actions: actions ?? [] })),
    });
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Role Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. HR Manager"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
        <div>
          <label className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Description</label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
            className="mt-1 w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>
      </div>

      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-3">Module Access</p>
        <div className="space-y-3">
          {MODULES.map(({ key, label, desc }) => {
            const enabled = !!permissions[key];
            const availableActions = MODULE_ACTIONS[key];
            return (
              <div
                key={key}
                className={`rounded-xl border transition-colors ${enabled ? 'border-brand bg-brand/5' : 'border-border bg-background'}`}
              >
                <div className="flex items-start gap-3 p-4">
                  <button
                    type="button"
                    onClick={() => toggleModule(key)}
                    className={`w-5 h-5 mt-0.5 rounded flex items-center justify-center border-2 transition-colors shrink-0 ${
                      enabled ? 'bg-navy border-navy text-white' : 'border-border'
                    }`}
                  >
                    {enabled && <Check size={12} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-navy">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                    {enabled && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {availableActions.map((action) => {
                          const active = permissions[key]?.includes(action);
                          return (
                            <button
                              key={action}
                              type="button"
                              onClick={() => toggleAction(key, action)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                                active
                                  ? 'bg-navy text-white border-navy'
                                  : 'bg-background text-muted-foreground border-border hover:border-navy hover:text-navy'
                              }`}
                            >
                              {action}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="px-5 py-2.5 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy/90 transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Role'}
        </button>
        <button
          onClick={onCancel}
          className="px-5 py-2.5 rounded-xl border border-border text-sm font-bold hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

const RoleBuilder: React.FC = () => {
  const companyId = getActiveCompanyId() ?? '';
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['roles', companyId],
    queryFn: () => RoleAPI.getAll(companyId).then((r) => r.data),
    enabled: !!companyId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => RoleAPI.create({ companyId, ...data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles', companyId] });
      setCreating(false);
      showToast('Role created', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.message ?? 'Failed to create role', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => RoleAPI.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles', companyId] });
      setEditing(null);
      showToast('Role updated', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.message ?? 'Failed to update role', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => RoleAPI.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles', companyId] });
      showToast('Role deleted', 'success');
    },
    onError: (e: any) => showToast(e.response?.data?.message ?? 'Failed to delete role', 'error'),
  });

  const toPermissionMap = (permissions: any[]): Partial<Record<ModuleKey, string[]>> =>
    Object.fromEntries(permissions.map((p: any) => [p.module, p.actions]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-navy">Roles</h1>
          <p className="text-sm text-muted-foreground mt-1">Define roles and assign module access for your team.</p>
        </div>
        {!creating && !editing && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy text-white text-sm font-bold hover:bg-navy/90 transition-colors"
          >
            <Plus size={16} /> New Role
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="text-base font-bold text-navy mb-5">Create New Role</h2>
          <RoleForm
            onSave={(data) => createMutation.mutate(data)}
            onCancel={() => setCreating(false)}
            saving={createMutation.isPending}
          />
        </div>
      )}

      {editing && (
        <div className="bg-card border border-brand/40 rounded-2xl p-6">
          <h2 className="text-base font-bold text-navy mb-5">Edit Role — {editing.name}</h2>
          <RoleForm
            initial={{ name: editing.name, description: editing.description ?? '', permissions: toPermissionMap(editing.permissions) }}
            onSave={(data) => updateMutation.mutate({ id: editing.id, data })}
            onCancel={() => setEditing(null)}
            saving={updateMutation.isPending}
          />
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-navy rounded-full animate-spin" />
        </div>
      ) : roles.length === 0 && !creating ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <ShieldCheck size={32} className="mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-bold text-navy">No roles yet</p>
          <p className="text-xs text-muted-foreground mt-1">Create your first role to start assigning team access.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {roles.map((role: any) => (
            <div key={role.id} className="bg-card border border-border rounded-2xl p-5 flex items-start gap-4">
              <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
                <ShieldCheck size={18} className="text-navy" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-navy">{role.name}</p>
                  <span className="text-xs text-muted-foreground font-semibold">
                    · {role._count?.userRoles ?? 0} user{role._count?.userRoles !== 1 ? 's' : ''}
                  </span>
                </div>
                {role.description && <p className="text-xs text-muted-foreground mt-0.5">{role.description}</p>}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {role.permissions?.map((p: any) => (
                    <span key={p.module} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-muted text-xs font-bold text-navy">
                      {MODULES.find((m) => m.key === p.module)?.label ?? p.module}
                      <span className="text-muted-foreground font-normal">
                        · {(p.actions as string[]).map((a) => a.toLowerCase()).join(', ')}
                      </span>
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => { setEditing(role); setCreating(false); }}
                  className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-navy"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => {
                    if (window.confirm(`Delete role "${role.name}"?`)) deleteMutation.mutate(role.id);
                  }}
                  className="p-2 rounded-lg hover:bg-red-50 transition-colors text-muted-foreground hover:text-red-500"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RoleBuilder;
