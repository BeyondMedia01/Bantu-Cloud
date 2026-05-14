import React, { useEffect, useState } from 'react';
import { ClipboardCheck, Plus, X, BarChart3, Send, Edit } from 'lucide-react';
import { SurveyAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import SkeletonTable from '../components/common/SkeletonTable';
import { EmptyState } from '@/components/ui/empty-state';
import type { Survey, SurveyResult } from '../types/domain';
import { StatusBadge } from '@/components/common/StatusBadge';

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Surveys: React.FC = () => {
  const { showToast } = useToast();
  const { can } = usePermissions();
  const canManage = can('SURVEYS');

  const [tab, setTab] = useState<'surveys' | 'results'>('surveys');
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);

  // Create
  const [showCreate, setShowCreate] = useState(false);
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fAnon, setFAnon] = useState(false);
  const [fDue, setFDue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit questions modal
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editQuestions, setEditQuestions] = useState<{ text: string; type: string; required: boolean }[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Results modal
  const [resultsId, setResultsId] = useState<string | null>(null);
  const [resultsTitle, setResultsTitle] = useState('');
  const [resultsData, setResultsData] = useState<{ totalResponses: number; results: SurveyResult[] } | null>(null);
  const [resultsLoading, setResultsLoading] = useState(false);

  const loadSurveys = async () => {
    setLoading(true);
    try { const res = await SurveyAPI.getAll(); setSurveys(res.data.data || []); }
    catch { showToast('Failed to load surveys', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadSurveys(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fTitle) return;
    setSubmitting(true);
    try {
      await SurveyAPI.create({ title: fTitle, description: fDesc || undefined, anonymous: fAnon, dueDate: fDue || undefined });
      showToast('Survey created', 'success');
      setShowCreate(false); setFTitle(''); setFDesc(''); setFAnon(false); setFDue('');
      loadSurveys();
    } catch (err: any) { showToast(err.message || 'Failed', 'error'); }
    finally { setSubmitting(false); }
  };

  const openEdit = async (id: string) => {
    try {
      const res = await SurveyAPI.getById(id);
      setEditId(id);
      setEditTitle(res.data.data.title);
      setEditQuestions(res.data.data.questions?.map((q: any) => ({ text: q.text, type: q.type, required: q.required })) || []);
    } catch { showToast('Failed to load survey', 'error'); }
  };

  const handleSaveQuestions = async () => {
    if (!editId) return;
    setEditSubmitting(true);
    try {
      await SurveyAPI.update(editId, { questions: editQuestions.map((q, i) => ({ ...q, order: i })) });
      showToast('Questions saved', 'success');
      setEditId(null);
      loadSurveys();
    } catch (err: any) { showToast(err.message || 'Failed', 'error'); }
    finally { setEditSubmitting(false); }
  };

  const handleActivate = async (id: string) => {
    try { await SurveyAPI.update(id, { status: 'ACTIVE' }); showToast('Survey activated', 'success'); loadSurveys(); }
    catch (err: any) { showToast(err.message || 'Failed', 'error'); }
  };

  const handleClose = async (id: string) => {
    try { await SurveyAPI.update(id, { status: 'CLOSED' }); showToast('Survey closed', 'success'); loadSurveys(); }
    catch (err: any) { showToast(err.message || 'Failed', 'error'); }
  };

  const openResults = async (id: string, title: string) => {
    setResultsId(id);
    setResultsTitle(title);
    setResultsLoading(true);
    setTab('results');
    try { const res = await SurveyAPI.getResults(id); setResultsData(res.data.data); }
    catch { showToast('Failed to load results', 'error'); }
    finally { setResultsLoading(false); }
  };

  // Closed/responded surveys for results tab
  const resultableSurveys = surveys.filter(s => s.status === 'CLOSED' || (s._count && s._count.responses > 0));

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Surveys</h1>
          <p className="text-muted-foreground font-medium text-sm">Collect employee feedback and insights</p>
        </div>
        {canManage && tab === 'surveys' && (
          <button onClick={() => setShowCreate(true)} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
            <Plus size={18} /> New Survey
          </button>
        )}
      </header>

      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {[{ key: 'surveys', label: 'Surveys' }, { key: 'results', label: 'Results' }].map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key as 'surveys' | 'results')}
              className={`px-4 py-2.5 text-sm font-bold transition-colors border-b-2 -mb-px ${active ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-navy'}`}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Surveys tab */}
      {tab === 'surveys' && (
        <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
          {loading ? <SkeletonTable headers={["", "", "", "", ""]} rows={6} /> : surveys.length === 0 ? (
            <EmptyState variant="no-data" icon={ClipboardCheck} title="No surveys yet" description="Create your first survey to collect feedback."
              action={canManage ? { label: 'New Survey', onClick: () => setShowCreate(true) } : undefined} />
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted border-b border-border">
                <tr>
                  <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Title</th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Questions</th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Responses</th>
                  <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Due</th>
                  <th className="px-5 py-4 text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {surveys.map(s => (
                  <tr key={s.id} className="hover:bg-muted/70 transition-colors">
                    <td className="px-5 py-4">
                      <p className="font-medium text-navy">{s.title}</p>
                      {s.anonymous && <p className="text-xs text-muted-foreground">Anonymous</p>}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{s._count?.questions ?? 0}</td>
                    <td className="px-5 py-4 text-muted-foreground">{s._count?.responses ?? 0}</td>
                    <td className="px-5 py-4 text-muted-foreground">{s.dueDate ? fmtDate(s.dueDate) : '—'}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canManage && s.status === 'DRAFT' && (
                          <button onClick={() => openEdit(s.id)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-navy transition-colors" title="Edit questions">
                            <Edit size={15} />
                          </button>
                        )}
                        {canManage && s.status === 'DRAFT' && (
                          <button onClick={() => handleActivate(s.id)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-emerald-600 transition-colors" title="Activate">
                            <Send size={15} />
                          </button>
                        )}
                        {canManage && s.status === 'ACTIVE' && (
                          <button onClick={() => handleClose(s.id)} className="px-3 py-1 rounded-full bg-muted text-muted-foreground text-[11px] font-bold hover:bg-border transition-colors">
                            Close
                          </button>
                        )}
                        {(s.status === 'CLOSED' || (s._count && s._count.responses > 0)) && (
                          <button onClick={() => openResults(s.id, s.title)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-blue-600 transition-colors" title="View results">
                            <BarChart3 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Results tab */}
      {tab === 'results' && (
        <div className="flex flex-col gap-6">
          {/* Survey selector */}
          <div className="flex flex-col gap-3">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Select Survey</p>
            <div className="flex flex-wrap gap-2">
              {resultableSurveys.map(s => (
                <button key={s.id} onClick={() => openResults(s.id, s.title)}
                  className={`px-4 py-2 rounded-full text-sm font-bold border transition-colors ${resultsId === s.id ? 'bg-navy text-white border-navy' : 'border-border text-muted-foreground hover:border-navy hover:text-navy'}`}>
                  {s.title}
                </button>
              ))}
              {resultableSurveys.length === 0 && (
                <p className="text-sm text-muted-foreground">No surveys with responses yet.</p>
              )}
            </div>
          </div>

          {resultsId && (
            <div className="bg-primary rounded-2xl border border-border shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-navy">{resultsTitle}</h2>
                {resultsData && <p className="text-sm text-muted-foreground"><strong>{resultsData.totalResponses}</strong> responses</p>}
              </div>
              {resultsLoading ? (
                <SkeletonTable headers={["", ""]} rows={4} />
              ) : resultsData ? (
                <div className="flex flex-col gap-6">
                  {resultsData.results.map(r => (
                    <div key={r.questionId} className="border border-border rounded-2xl p-4">
                      <h4 className="text-sm font-bold text-navy mb-3">{r.text}</h4>

                      {r.type === 'RATING' && (
                        <div>
                          <p className="text-2xl font-bold text-navy mb-3">{r.average !== null ? `${r.average} / 5` : 'No ratings'}</p>
                          {r.distribution?.map(d => (
                            <div key={d.value} className="flex items-center gap-3 mb-1.5">
                              <span className="text-xs text-muted-foreground w-8">{d.value} ★</span>
                              <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                                <div className="bg-amber-400 h-full rounded-full" style={{ width: `${r.count ? (d.count / r.count) * 100 : 0}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground w-8 text-right">{d.count}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {r.type === 'YES_NO' && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-emerald-50 rounded-2xl p-4 text-center">
                            <p className="text-2xl font-bold text-emerald-700">{r.yes}</p>
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Yes</p>
                          </div>
                          <div className="bg-red-50 rounded-2xl p-4 text-center">
                            <p className="text-2xl font-bold text-red-700">{r.no}</p>
                            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">No</p>
                          </div>
                        </div>
                      )}

                      {r.type === 'TEXT' && r.responses && (
                        <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                          {r.responses.slice(0, 10).map((resp, i) => (
                            <p key={i} className="text-sm text-muted-foreground bg-muted rounded-xl px-3 py-2">{resp.value}</p>
                          ))}
                          {r.responses.length > 10 && <p className="text-xs text-muted-foreground">...and {r.responses.length - 10} more</p>}
                        </div>
                      )}

                      {r.type === 'MULTIPLE_CHOICE' && r.responses && (
                        <div className="flex flex-col gap-1.5">
                          {r.responses.slice(0, 8).map((resp, i) => (
                            <div key={i} className="flex items-center gap-3">
                              <span className="text-sm text-muted-foreground w-32 truncate">{resp.value}</span>
                              <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                                <div className="bg-blue-500 h-full rounded-full" style={{ width: `${r.count ? (resp.count / r.count) * 100 : 0}%` }} />
                              </div>
                              <span className="text-xs text-muted-foreground w-8 text-right">{resp.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Create Survey modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-primary rounded-2xl shadow-xl w-full max-w-md flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-navy">New Survey</h2>
              <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Title *</span>
                <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={fTitle} onChange={e => setFTitle(e.target.value)} required />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</span>
                <textarea className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green min-h-[60px]"
                  value={fDesc} onChange={e => setFDesc(e.target.value)} />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex items-center gap-2 text-sm font-medium text-navy cursor-pointer">
                  <input type="checkbox" checked={fAnon} onChange={e => setFAnon(e.target.checked)} className="rounded" />
                  <span>Anonymous responses</span>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Due Date</span>
                  <input type="date" className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={fDue} onChange={e => setFDue(e.target.value)} />
                </label>
              </div>
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleCreate as any} disabled={submitting} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
                <Plus size={16} /> {submitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Questions modal */}
      {editId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-primary rounded-2xl shadow-xl w-full max-w-lg flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 className="text-lg font-bold text-navy">Edit: {editTitle}</h2>
              <button onClick={() => setEditId(null)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <div className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Questions</span>
                <button type="button" onClick={() => setEditQuestions([...editQuestions, { text: '', type: 'TEXT', required: false }])}
                  className="text-xs font-bold text-navy hover:underline">+ Add question</button>
              </div>
              <div className="flex flex-col gap-3">
                {editQuestions.map((q, i) => (
                  <div key={i} className="bg-muted rounded-2xl p-4 flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-muted-foreground mt-3 w-5 shrink-0">{i + 1}.</span>
                      <div className="flex-1 flex flex-col gap-2">
                        <input className="bg-primary border border-border rounded-xl px-3 py-2 text-sm focus:outline-none"
                          value={q.text} onChange={e => { const u = [...editQuestions]; u[i] = { ...u[i], text: e.target.value }; setEditQuestions(u); }} placeholder="Question text" />
                        <div className="flex gap-2">
                          <select className="bg-primary border border-border rounded-xl px-3 py-2 text-sm focus:outline-none flex-1"
                            value={q.type} onChange={e => { const u = [...editQuestions]; u[i] = { ...u[i], type: e.target.value }; setEditQuestions(u); }}>
                            <option value="TEXT">Text</option>
                            <option value="RATING">Rating (1-5)</option>
                            <option value="YES_NO">Yes/No</option>
                            <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                          </select>
                          <label className="flex items-center gap-1 text-xs text-navy whitespace-nowrap">
                            <input type="checkbox" checked={q.required} onChange={e => { const u = [...editQuestions]; u[i] = { ...u[i], required: e.target.checked }; setEditQuestions(u); }} />
                            Required
                          </label>
                          <button onClick={() => setEditQuestions(editQuestions.filter((_, j) => j !== i))}
                            className="p-2 hover:bg-muted rounded-lg text-red-400 hover:text-red-600"><X size={14} /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setEditId(null)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleSaveQuestions} disabled={editSubmitting} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90">
                {editSubmitting ? 'Saving...' : 'Save Questions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Surveys;
