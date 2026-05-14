import React, { useEffect, useState } from 'react';
import { ClipboardList, Plus, X, CheckCircle2, Circle, ChevronDown, Edit } from 'lucide-react';
import { OnboardingAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import SkeletonTable from '../components/common/SkeletonTable';
import { EmptyState } from '@/components/ui/empty-state';
import { Dropdown } from '@/components/ui/dropdown';
import type { Onboarding as OnboardingType, OnboardingTemplate, OnboardingTask } from '../types/domain';
import { StatusBadge } from '@/components/common/StatusBadge';

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Onboarding: React.FC = () => {
  const { showToast } = useToast();
  const { can } = usePermissions();
  const canManage = can('ONBOARDING');

  const [tab, setTab] = useState<'checklist' | 'templates'>('checklist');
  const [records, setRecords] = useState<OnboardingType[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  // Detail modal (replaces expand)
  const [detailRecord, setDetailRecord] = useState<OnboardingType | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Templates
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([]);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [formEmployee, setFormEmployee] = useState('');
  const [formTemplate, setFormTemplate] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formBuddy, setFormBuddy] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Create template modal
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [tmplName, setTmplName] = useState('');
  const [tmplDesc, setTmplDesc] = useState('');
  const [tmplTasks, setTmplTasks] = useState<{ title: string; description: string; dueDaysFromStart: number }[]>([]);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const res = await OnboardingAPI.getAll({ ...(filter && { status: filter }) });
      setRecords(res.data.data || []);
    } catch {
      showToast('Failed to load onboarding records', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const res = await OnboardingAPI.getTemplates();
      setTemplates(res.data.data || []);
    } catch {
      showToast('Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'checklist') loadRecords();
    else loadTemplates();
  }, [tab, filter]);

  const loadEmployees = async () => {
    try {
      const res = await OnboardingAPI.getEmployees();
      setEmployees(res.data.data || []);
    } catch { /* ignore */ }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmployee || !formStart) return;
    setSubmitting(true);
    try {
      await OnboardingAPI.create({
        employeeId: formEmployee, templateId: formTemplate || undefined,
        startDate: formStart, buddyId: formBuddy || undefined, notes: formNotes || undefined,
      });
      showToast('Onboarding started', 'success');
      setShowCreate(false); resetForm(); loadRecords();
    } catch (err: any) {
      showToast(err.message || 'Failed to create', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormEmployee(''); setFormTemplate(''); setFormStart(''); setFormBuddy(''); setFormNotes('');
  };

  const openDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await OnboardingAPI.getById(id);
      setDetailRecord(res.data.data);
    } catch {
      showToast('Failed to load details', 'error');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleToggleTask = async (recordId: string, task: OnboardingTask) => {
    setActionLoading('task-' + task.id);
    try {
      await OnboardingAPI.updateTask(recordId, task.id, { completed: !task.completed });
      const res = await OnboardingAPI.getById(recordId);
      setDetailRecord(res.data.data);
      loadRecords();
    } catch (err: any) {
      showToast(err.message || 'Failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleCompleteOnboarding = async (id: string) => {
    setActionLoading('complete-' + id);
    try {
      await OnboardingAPI.update(id, { status: 'COMPLETED' });
      showToast('Onboarding completed', 'success');
      setDetailRecord(null);
      loadRecords();
    } catch (err: any) {
      showToast(err.message || 'Failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tmplName) return;
    setSubmitting(true);
    try {
      await OnboardingAPI.createTemplate({ name: tmplName, description: tmplDesc || undefined, tasks: tmplTasks.filter(t => t.title) });
      showToast('Template created', 'success');
      setShowCreateTemplate(false); setTmplName(''); setTmplDesc(''); setTmplTasks([]);
      loadTemplates();
    } catch (err: any) {
      showToast(err.message || 'Failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const STATUS_OPTS = ['', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Onboarding</h1>
          <p className="text-muted-foreground font-medium text-sm">Manage employee onboarding and templates</p>
        </div>
        {canManage && tab === 'checklist' && (
          <button onClick={() => { setShowCreate(true); loadEmployees(); loadTemplates(); }} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
            <Plus size={18} /> Start Onboarding
          </button>
        )}
        {canManage && tab === 'templates' && (
          <button onClick={() => setShowCreateTemplate(true)} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
            <Plus size={18} /> New Template
          </button>
        )}
      </header>

      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {[{ key: 'checklist', label: 'Checklist' }, { key: 'templates', label: 'Templates' }].map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key as 'checklist' | 'templates')}
              className={`px-4 py-2.5 text-sm font-bold transition-colors border-b-2 -mb-px ${active ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-navy'}`}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Checklist tab */}
      {tab === 'checklist' && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Filters</p>
              {filter && <button onClick={() => setFilter('')} className="text-xs font-bold text-muted-foreground hover:text-red-500 px-3 py-1.5 rounded-full border border-border hover:border-red-200 hover:bg-red-50 transition-colors">× Clear filters</button>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Dropdown
                trigger={(isOpen) => (
                  <button className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium shadow-sm flex items-center justify-between hover:border-accent-green transition-colors">
                    <span className="truncate">{filter ? filter.replace('_', ' ') : 'All Statuses'}</span>
                    <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
                sections={[{ items: STATUS_OPTS.map(s => ({ label: s ? s.replace('_', ' ') : 'All Statuses', onClick: () => setFilter(s) })) }]}
              />
            </div>
          </div>

          <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
            {loading ? <SkeletonTable headers={["", "", "", "", ""]} rows={6} /> : records.length === 0 ? (
              <EmptyState variant="no-data" icon={ClipboardList} title="No onboarding records" description="Start an onboarding for a new employee."
                action={canManage ? { label: 'Start Onboarding', onClick: () => { setShowCreate(true); loadEmployees(); loadTemplates(); } } : undefined} />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Template</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Start Date</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Tasks</th>
                    <th className="px-5 py-4 text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {records.map(r => (
                    <tr key={r.id} className="hover:bg-muted/70 transition-colors">
                      <td className="px-5 py-4 font-medium text-navy">
                        {r.employee?.firstName} {r.employee?.lastName}
                        {r.employee?.employeeCode && <p className="text-xs text-muted-foreground">#{r.employee.employeeCode}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={r.status} />
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{r.template?.name || '—'}</td>
                      <td className="px-5 py-4 text-muted-foreground">{fmtDate(r.startDate)}</td>
                      <td className="px-5 py-4 text-muted-foreground">
                        {r.completedTasks !== undefined && r._count ? `${r.completedTasks}/${r._count.tasks}` : '—'}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <button onClick={() => openDetail(r.id)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-navy transition-colors" title="View tasks">
                          <Edit size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Templates tab */}
      {tab === 'templates' && (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          {loading ? <SkeletonTable headers={["", "", ""]} rows={6} /> : templates.length === 0 ? (
            <EmptyState variant="no-data" icon={ClipboardList} title="No templates" description="Create reusable onboarding templates."
              action={canManage ? { label: 'New Template', onClick: () => setShowCreateTemplate(true) } : undefined} />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Name</th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Tasks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {templates.map(t => (
                  <tr key={t.id} className="hover:bg-muted/70 transition-colors">
                    <td className="px-5 py-4 font-medium text-navy">{t.name}</td>
                    <td className="px-5 py-4 text-muted-foreground">{t.description || '—'}</td>
                    <td className="px-5 py-4 text-muted-foreground">{t.tasks?.length ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Start Onboarding modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="modal-title-onboarding" className="bg-primary rounded-2xl shadow-xl w-full max-w-lg flex flex-col" onKeyDown={(e) => { if (e.key === 'Escape') setShowCreate(false); }} tabIndex={-1}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 id="modal-title-onboarding" className="text-lg font-bold text-navy">Start Onboarding</h2>
              <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee *</span>
                <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={formEmployee} onChange={e => setFormEmployee(e.target.value)} required>
                  <option value="">Select employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Template</span>
                <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={formTemplate} onChange={e => setFormTemplate(e.target.value)}>
                  <option value="">No template (manual tasks)</option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Start Date *</span>
                <input type="date" className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={formStart} onChange={e => setFormStart(e.target.value)} required />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Buddy</span>
                <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={formBuddy} onChange={e => setFormBuddy(e.target.value)}>
                  <option value="">No buddy</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Notes</span>
                <textarea className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green min-h-[60px]"
                  value={formNotes} onChange={e => setFormNotes(e.target.value)} />
              </label>
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleCreate as any} disabled={submitting} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
                <Plus size={16} /> {submitting ? 'Starting...' : 'Start Onboarding'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail / tasks modal */}
      {detailRecord && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setDetailRecord(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="modal-title-detail" className="bg-primary rounded-2xl shadow-xl w-full max-w-lg flex flex-col" onKeyDown={(e) => { if (e.key === 'Escape') setDetailRecord(null); }} tabIndex={-1}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div>
                <h2 id="modal-title-detail" className="text-lg font-bold text-navy">{detailRecord.employee?.firstName} {detailRecord.employee?.lastName}</h2>
                <p className="text-xs text-muted-foreground">Onboarding checklist</p>
              </div>
              <button onClick={() => setDetailRecord(null)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <div className="p-6 flex flex-col gap-3 overflow-y-auto max-h-[60vh]">
              {detailLoading ? (
                <p className="text-sm text-muted-foreground text-center py-4">Loading tasks...</p>
              ) : !detailRecord.tasks || detailRecord.tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No tasks found.</p>
              ) : detailRecord.tasks.map(t => (
                <div key={t.id} className="flex items-center gap-3 bg-muted rounded-2xl p-3">
                  <button onClick={() => handleToggleTask(detailRecord.id, t)} disabled={actionLoading === 'task-' + t.id}
                    className="shrink-0 text-muted-foreground hover:text-emerald-600 transition-colors">
                    {t.completed ? <CheckCircle2 size={18} className="text-emerald-600" /> : <Circle size={18} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm ${t.completed ? 'line-through text-muted-foreground' : 'text-navy font-medium'}`}>{t.title}</span>
                    {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
                  </div>
                  {t.dueDate && <span className="text-xs text-muted-foreground shrink-0">Due {fmtDate(t.dueDate)}</span>}
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setDetailRecord(null)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Close</button>
              {canManage && detailRecord.status === 'IN_PROGRESS' && (
                <button onClick={() => handleCompleteOnboarding(detailRecord.id)} disabled={!!actionLoading}
                  className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
                  <CheckCircle2 size={16} /> Complete Onboarding
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Template modal */}
      {showCreateTemplate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowCreateTemplate(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="modal-title-template" className="bg-primary rounded-2xl shadow-xl w-full max-w-lg flex flex-col" onKeyDown={(e) => { if (e.key === 'Escape') setShowCreateTemplate(false); }} tabIndex={-1}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 id="modal-title-template" className="text-lg font-bold text-navy">New Template</h2>
              <button onClick={() => setShowCreateTemplate(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateTemplate} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Name *</span>
                <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={tmplName} onChange={e => setTmplName(e.target.value)} required placeholder="e.g. Standard Onboarding" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</span>
                <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={tmplDesc} onChange={e => setTmplDesc(e.target.value)} />
              </label>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tasks</span>
                  <button type="button" onClick={() => setTmplTasks([...tmplTasks, { title: '', description: '', dueDaysFromStart: 0 }])}
                    className="text-xs font-bold text-navy hover:underline">+ Add task</button>
                </div>
                {tmplTasks.map((task, i) => (
                  <div key={i} className="flex items-start gap-2 bg-muted rounded-2xl p-3">
                    <div className="flex-1 flex flex-col gap-2">
                      <input className="bg-primary border border-border rounded-xl px-3 py-2 text-sm focus:outline-none" value={task.title}
                        onChange={e => { const u = [...tmplTasks]; u[i] = { ...u[i], title: e.target.value }; setTmplTasks(u); }} placeholder="Task title" />
                      <div className="flex gap-2">
                        <input className="bg-primary border border-border rounded-xl px-3 py-2 text-sm focus:outline-none flex-1" value={task.description}
                          onChange={e => { const u = [...tmplTasks]; u[i] = { ...u[i], description: e.target.value }; setTmplTasks(u); }} placeholder="Description (optional)" />
                        <input type="number" min={0} className="bg-primary border border-border rounded-xl px-3 py-2 text-sm focus:outline-none w-20" value={task.dueDaysFromStart || ''}
                          onChange={e => { const u = [...tmplTasks]; u[i] = { ...u[i], dueDaysFromStart: parseInt(e.target.value) || 0 }; setTmplTasks(u); }} placeholder="Day" title="Due days from start" />
                      </div>
                    </div>
                    <button type="button" onClick={() => setTmplTasks(tmplTasks.filter((_, j) => j !== i))}
                      className="p-2 hover:bg-muted rounded-lg text-red-400 hover:text-red-600"><X size={14} /></button>
                  </div>
                ))}
              </div>
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowCreateTemplate(false)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleCreateTemplate as any} disabled={submitting} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
                <Plus size={16} /> {submitting ? 'Creating...' : 'Create Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Onboarding;
