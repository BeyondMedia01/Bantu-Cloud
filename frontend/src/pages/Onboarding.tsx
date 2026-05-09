import React, { useEffect, useState } from 'react';
import { ClipboardList, Plus, X, CheckCircle2, Circle, Users, Calendar, UserCheck } from 'lucide-react';
import { OnboardingAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import { getActiveCompanyId } from '../lib/companyContext';
import SkeletonTable from '../components/common/SkeletonTable';
import type { Onboarding as OnboardingType, OnboardingTemplate, OnboardingTask } from '../types/domain';

const STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-600 border-slate-200',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-200',
  COMPLETED: 'bg-green-50 text-green-700 border-green-200',
  CANCELLED: 'bg-red-50 text-red-600 border-red-200',
};

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Onboarding: React.FC = () => {
  const { showToast } = useToast();
  const { can } = usePermissions();
  const canManage = can('manage_employees');

  const [records, setRecords] = useState<OnboardingType[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState('');

  // Templates
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState<OnboardingTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

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

  useEffect(() => { loadRecords(); }, [filter]);

  const loadEmployees = async () => {
    try {
      const res = await OnboardingAPI.getEmployees();
      setEmployees(res.data.data || []);
    } catch { /* ignore */ }
  };

  const loadTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const res = await OnboardingAPI.getTemplates();
      setTemplates(res.data.data || []);
    } catch {
      showToast('Failed to load templates', 'error');
    } finally {
      setTemplatesLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmployee || !formStart) return;
    setSubmitting(true);
    try {
      await OnboardingAPI.create({
        employeeId: formEmployee,
        templateId: formTemplate || undefined,
        startDate: formStart,
        buddyId: formBuddy || undefined,
        notes: formNotes || undefined,
      });
      showToast('Onboarding started', 'success');
      setShowCreate(false);
      resetForm();
      loadRecords();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to create', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormEmployee(''); setFormTemplate(''); setFormStart('');
    setFormBuddy(''); setFormNotes('');
  };

  const handleToggleTask = async (recordId: string, task: OnboardingTask) => {
    setActionLoading('task-' + task.id);
    try {
      await OnboardingAPI.updateTask(recordId, task.id, { completed: !task.completed });
      if (expandedId) {
        const res = await OnboardingAPI.getById(expandedId);
        setRecords(prev => prev.map(r => r.id === expandedId ? { ...r, ...res.data.data, completedTasks: res.data.data.tasks?.filter(t => t.completed).length || 0 } : r));
      }
      loadRecords();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleCompleteOnboarding = async (id: string) => {
    setActionLoading('complete-' + id);
    try {
      await OnboardingAPI.update(id, { status: 'COMPLETED' });
      showToast('Onboarding completed', 'success');
      loadRecords();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tmplName) return;
    setSubmitting(true);
    try {
      await OnboardingAPI.createTemplate({
        name: tmplName, description: tmplDesc || undefined,
        tasks: tmplTasks.filter(t => t.title),
      });
      showToast('Template created', 'success');
      setShowCreateTemplate(false);
      setTmplName(''); setTmplDesc(''); setTmplTasks([]);
      loadTemplates();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    try {
      const res = await OnboardingAPI.getById(id);
      setRecords(prev => prev.map(r => r.id === id ? { ...r, tasks: res.data.data.tasks } : r));
    } catch { /* ignore */ }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardList size={28} className="text-navy" />
          <h1 className="text-2xl font-semibold text-navy">Onboarding</h1>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <button onClick={() => { setShowTemplates(true); loadTemplates(); }} className="btn btn-ghost flex items-center gap-2">
              <Users size={18} /> Templates
            </button>
            <button onClick={() => { setShowCreate(true); loadEmployees(); loadTemplates(); }} className="btn btn-primary flex items-center gap-2">
              <Plus size={18} /> Start Onboarding
            </button>
          </div>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {['', 'NOT_STARTED', 'IN_PROGRESS', 'COMPLETED'].map(s => (
          <button key={s || 'all'} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-lg border whitespace-nowrap transition-colors ${
              filter === s ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {s ? s.replace('_', ' ') : 'All'}
          </button>
        ))}
      </div>

      {loading ? <SkeletonTable rows={5} cols={5} /> : (
        <div className="space-y-3">
          {records.length === 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-500">
              <ClipboardList size={48} className="mx-auto mb-3 text-slate-300" />
              <p className="text-lg font-medium text-slate-400 mb-1">No onboarding records</p>
              <p>Start an onboarding for a new employee.</p>
            </div>
          )}

          {records.map(r => (
            <div key={r.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="p-4 flex items-start justify-between cursor-pointer hover:bg-slate-50"
                onClick={() => toggleExpand(r.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-slate-900">
                      {r.employee?.firstName} {r.employee?.lastName}
                    </h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[r.status] || ''}`}>
                      {r.status?.replace('_', ' ')}
                    </span>
                    {r.completedTasks !== undefined && r._count && (
                      <span className="text-xs text-slate-500">
                        {r.completedTasks}/{r._count.tasks} tasks
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
                    {r.template?.name && <span>{r.template.name}</span>}
                    <span><Calendar size={14} className="inline mr-1" />{fmtDate(r.startDate)}</span>
                    {r.employee?.employeeCode && <span>#{r.employee.employeeCode}</span>}
                  </div>
                </div>
              </div>

              {expandedId === r.id && r.tasks && (
                <div className="border-t border-slate-100 bg-slate-50 p-4">
                  <h4 className="text-sm font-medium text-slate-700 mb-3">Checklist</h4>
                  <div className="space-y-1.5">
                    {r.tasks.map(t => (
                      <div key={t.id} className="flex items-center gap-3 bg-white rounded border border-slate-200 p-2.5">
                        <button onClick={() => handleToggleTask(r.id, t)} disabled={actionLoading === 'task-' + t.id}
                          className="shrink-0 text-slate-400 hover:text-green-600 transition-colors"
                        >
                          {t.completed ? <CheckCircle2 size={18} className="text-green-600" /> : <Circle size={18} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <span className={`text-sm ${t.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                            {t.title}
                          </span>
                          {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                        </div>
                        {t.dueDate && (
                          <span className="text-xs text-slate-400 shrink-0">
                            Due {fmtDate(t.dueDate)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                  {canManage && r.status === 'IN_PROGRESS' && (
                    <div className="mt-3 flex justify-end">
                      <button onClick={() => handleCompleteOnboarding(r.id)} disabled={!!actionLoading}
                        className="btn btn-sm btn-success flex items-center gap-1"
                      >
                        <CheckCircle2 size={14} /> Complete Onboarding
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Start Onboarding modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">Start Onboarding</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Employee *</label>
                <select className="input" value={formEmployee} onChange={e => setFormEmployee(e.target.value)} required>
                  <option value="">Select employee</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.firstName} {e.lastName} ({e.employeeCode})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Template</label>
                <select className="input" value={formTemplate} onChange={e => setFormTemplate(e.target.value)}>
                  <option value="">No template (manual tasks)</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Start Date *</label>
                <input type="date" className="input" value={formStart} onChange={e => setFormStart(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Buddy</label>
                <select className="input" value={formBuddy} onChange={e => setFormBuddy(e.target.value)}>
                  <option value="">No buddy</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea className="input min-h-[60px]" value={formNotes} onChange={e => setFormNotes(e.target.value)} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? 'Starting...' : 'Start Onboarding'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Templates modal */}
      {showTemplates && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => { setShowTemplates(false); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">Onboarding Templates</h2>
              <div className="flex items-center gap-2">
                {canManage && (
                  <button onClick={() => setShowCreateTemplate(true)} className="btn btn-sm btn-primary flex items-center gap-1">
                    <Plus size={14} /> New Template
                  </button>
                )}
                <button onClick={() => setShowTemplates(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
              </div>
            </div>
            <div className="p-5">
              {templatesLoading ? <SkeletonTable rows={3} cols={3} /> : (
                templates.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-4">No templates yet</p>
                ) : (
                  <div className="space-y-3">
                    {templates.map(t => (
                      <div key={t.id} className="border border-slate-200 rounded-lg p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium text-slate-800">{t.name}</h4>
                            {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
                          </div>
                          <span className="text-xs text-slate-400">{t.tasks?.length || 0} tasks</span>
                        </div>
                        {t.tasks && t.tasks.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {t.tasks.map(task => (
                              <div key={task.id} className="text-xs text-slate-600 flex items-center gap-2">
                                <Circle size={10} className="shrink-0" />
                                <span>{task.title}</span>
                                {task.dueDaysFromStart && <span className="text-slate-400">(Day {task.dueDaysFromStart})</span>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Template modal */}
      {showCreateTemplate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCreateTemplate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">New Template</h2>
              <button onClick={() => setShowCreateTemplate(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateTemplate} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Name *</label>
                <input className="input" value={tmplName} onChange={e => setTmplName(e.target.value)} required placeholder="e.g. Standard Onboarding" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <input className="input" value={tmplDesc} onChange={e => setTmplDesc(e.target.value)} />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-slate-700">Tasks</label>
                  <button type="button" onClick={() => setTmplTasks([...tmplTasks, { title: '', description: '', dueDaysFromStart: 0 }])}
                    className="text-xs text-blue-600 hover:text-blue-700"
                  >
                    + Add task
                  </button>
                </div>
                <div className="space-y-2">
                  {tmplTasks.map((task, i) => (
                    <div key={i} className="flex items-start gap-2 bg-slate-50 rounded p-2">
                      <div className="flex-1 space-y-1">
                        <input className="input text-sm" value={task.title} onChange={e => {
                          const updated = [...tmplTasks]; updated[i] = { ...updated[i], title: e.target.value }; setTmplTasks(updated);
                        }} placeholder="Task title" />
                        <div className="flex gap-2">
                          <input className="input text-sm flex-1" value={task.description} onChange={e => {
                            const updated = [...tmplTasks]; updated[i] = { ...updated[i], description: e.target.value }; setTmplTasks(updated);
                          }} placeholder="Description (optional)" />
                          <input type="number" min={0} className="input text-sm w-20" value={task.dueDaysFromStart || ''} onChange={e => {
                            const updated = [...tmplTasks]; updated[i] = { ...updated[i], dueDaysFromStart: parseInt(e.target.value) || 0 }; setTmplTasks(updated);
                          }} placeholder="Day" title="Due days from start" />
                        </div>
                      </div>
                      <button type="button" onClick={() => setTmplTasks(tmplTasks.filter((_, j) => j !== i))}
                        className="text-red-400 hover:text-red-600 p-1"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreateTemplate(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? 'Creating...' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Onboarding;
