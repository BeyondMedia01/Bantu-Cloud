import React, { useEffect, useState } from 'react';
import { ClipboardCheck, Plus, X, BarChart3, Send } from 'lucide-react';
import { SurveyAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import SkeletonTable from '../components/common/SkeletonTable';
import type { Survey, SurveyResult } from '../types/domain';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  ACTIVE: 'bg-green-50 text-green-700 border-green-200',
  CLOSED: 'bg-blue-50 text-blue-700 border-blue-200',
};
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Surveys: React.FC = () => {
  const { showToast } = useToast();
  const { can } = usePermissions();
  const canManage = can('SURVEYS');

  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);

  // Create
  const [showCreate, setShowCreate] = useState(false);
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fAnon, setFAnon] = useState(false);
  const [fDue, setFDue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit questions
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editQuestions, setEditQuestions] = useState<{ text: string; type: string; required: boolean }[]>([]);
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Results
  const [resultsId, setResultsId] = useState<string | null>(null);
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
    } catch (err: any) { showToast(err.response?.data?.message || 'Failed', 'error'); }
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
    } catch (err: any) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setEditSubmitting(false); }
  };

  const handleActivate = async (id: string) => {
    try { await SurveyAPI.update(id, { status: 'ACTIVE' }); showToast('Survey activated', 'success'); loadSurveys(); }
    catch (err: any) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const handleClose = async (id: string) => {
    try { await SurveyAPI.update(id, { status: 'CLOSED' }); showToast('Survey closed', 'success'); loadSurveys(); }
    catch (err: any) { showToast(err.response?.data?.message || 'Failed', 'error'); }
  };

  const openResults = async (id: string) => {
    setResultsId(id);
    setResultsLoading(true);
    try { const res = await SurveyAPI.getResults(id); setResultsData(res.data.data); }
    catch { showToast('Failed to load results', 'error'); }
    finally { setResultsLoading(false); }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardCheck size={28} className="text-navy" />
          <h1 className="text-2xl font-semibold text-navy">Surveys</h1>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(true)} className="btn btn-primary flex items-center gap-2"><Plus size={18} /> New Survey</button>
        )}
      </div>

      {loading ? <SkeletonTable headers={['Title', 'Status', 'Questions', 'Actions']} rows={5} /> : (
        <div className="space-y-3">
          {surveys.length === 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-500">
              <ClipboardCheck size={48} className="mx-auto mb-3 text-slate-300" />
              <p className="text-lg font-medium text-slate-400 mb-1">No surveys yet</p>
            </div>
          )}
          {surveys.map(s => (
            <div key={s.id} className="bg-white rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-slate-900">{s.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[s.status] || ''}`}>{s.status}</span>
                    {s.anonymous && <span className="text-xs text-slate-400">Anonymous</span>}
                  </div>
                  <div className="text-sm text-slate-500">
                    {s._count && <span>{s._count.questions} questions • {s._count.responses} responses</span>}
                    {s.dueDate && <span className="ml-2">Due {fmtDate(s.dueDate)}</span>}
                    <span className="ml-2">Created {fmtDate(s.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-3 shrink-0">
                  {canManage && s.status === 'DRAFT' && (
                    <>
                      <button onClick={() => openEdit(s.id)} className="btn btn-sm btn-primary">Edit</button>
                      <button onClick={() => handleActivate(s.id)} className="btn btn-sm btn-success flex items-center gap-1"><Send size={12} /> Activate</button>
                    </>
                  )}
                  {canManage && s.status === 'ACTIVE' && (
                    <button onClick={() => handleClose(s.id)} className="btn btn-sm bg-slate-100 text-slate-600 border border-slate-200">Close</button>
                  )}
                  {(s.status === 'CLOSED' || s._count && s._count.responses > 0) && (
                    <button onClick={() => openResults(s.id)} className="btn btn-sm bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1">
                      <BarChart3 size={12} /> Results
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">New Survey</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                <input className="input" value={fTitle} onChange={e => setFTitle(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea className="input min-h-[60px]" value={fDesc} onChange={e => setFDesc(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input type="checkbox" checked={fAnon} onChange={e => setFAnon(e.target.checked)} />
                    Anonymous responses
                  </label>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Due Date</label>
                  <input type="date" className="input" value={fDue} onChange={e => setFDue(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? 'Creating...' : 'Create'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditId(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">Edit: {editTitle}</h2>
              <button onClick={() => setEditId(null)} className="text-slate-400"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">Questions</label>
                <button type="button" onClick={() => setEditQuestions([...editQuestions, { text: '', type: 'TEXT', required: false }])}
                  className="text-xs text-blue-600 hover:text-blue-700">+ Add question</button>
              </div>
              <div className="space-y-3">
                {editQuestions.map((q, i) => (
                  <div key={i} className="bg-slate-50 rounded p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-slate-400 mt-2 w-5">{i + 1}.</span>
                      <div className="flex-1 space-y-2">
                        <input className="input text-sm" value={q.text} onChange={e => {
                          const updated = [...editQuestions]; updated[i] = { ...updated[i], text: e.target.value }; setEditQuestions(updated);
                        }} placeholder="Question text" />
                        <div className="flex gap-2">
                          <select className="input text-sm flex-1" value={q.type} onChange={e => {
                            const updated = [...editQuestions]; updated[i] = { ...updated[i], type: e.target.value }; setEditQuestions(updated);
                          }}>
                            <option value="TEXT">Text</option>
                            <option value="RATING">Rating (1-5)</option>
                            <option value="YES_NO">Yes/No</option>
                            <option value="MULTIPLE_CHOICE">Multiple Choice</option>
                          </select>
                          <label className="flex items-center gap-1 text-xs text-slate-600 whitespace-nowrap">
                            <input type="checkbox" checked={q.required} onChange={e => {
                              const updated = [...editQuestions]; updated[i] = { ...updated[i], required: e.target.checked }; setEditQuestions(updated);
                            }} />
                            Required
                          </label>
                          <button onClick={() => setEditQuestions(editQuestions.filter((_, j) => j !== i))} className="text-red-400 p-1"><X size={14} /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setEditId(null)} className="btn btn-ghost">Cancel</button>
                <button onClick={handleSaveQuestions} disabled={editSubmitting} className="btn btn-primary">
                  {editSubmitting ? 'Saving...' : 'Save Questions'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {resultsId && resultsData && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => { setResultsId(null); setResultsData(null); }}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">Survey Results</h2>
              <button onClick={() => { setResultsId(null); setResultsData(null); }} className="text-slate-400"><X size={20} /></button>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-500 mb-4">Total responses: <strong>{resultsData.totalResponses}</strong></p>
              {resultsLoading ? <SkeletonTable headers={['Question', 'Results']} rows={5} /> : (
                <div className="space-y-6">
                  {resultsData.results.map(r => (
                    <div key={r.questionId} className="border border-slate-200 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-slate-800 mb-2">{r.text}</h4>

                      {r.type === 'RATING' && (
                        <div>
                          <p className="text-lg font-bold text-navy mb-2">{r.average !== null ? `${r.average} / 5` : 'No ratings'}</p>
                          {r.distribution?.map(d => (
                            <div key={d.value} className="flex items-center gap-2 mb-1">
                              <span className="text-xs text-slate-500 w-8">{d.value} ★</span>
                              <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                                <div className="bg-amber-400 h-full rounded-full" style={{ width: `${r.count ? (d.count / r.count) * 100 : 0}%` }} />
                              </div>
                              <span className="text-xs text-slate-500 w-8 text-right">{d.count}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {r.type === 'YES_NO' && (
                        <div className="flex gap-4">
                          <div className="flex-1 bg-green-50 rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-green-700">{r.yes}</p>
                            <p className="text-xs text-green-600">Yes</p>
                          </div>
                          <div className="flex-1 bg-red-50 rounded-lg p-3 text-center">
                            <p className="text-2xl font-bold text-red-600">{r.no}</p>
                            <p className="text-xs text-red-500">No</p>
                          </div>
                        </div>
                      )}

                      {r.type === 'TEXT' && r.responses && (
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {r.responses.slice(0, 10).map((resp, i) => (
                            <p key={i} className="text-sm text-slate-600 bg-slate-50 rounded px-2 py-1">{resp.value}</p>
                          ))}
                          {r.responses.length > 10 && <p className="text-xs text-slate-400">...and {r.responses.length - 10} more</p>}
                        </div>
                      )}

                      {r.type === 'MULTIPLE_CHOICE' && r.responses && (
                        <div className="space-y-1">
                          {r.responses.slice(0, 8).map((resp, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-sm text-slate-600 flex-1">{resp.value}</span>
                              <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                                <div className="bg-blue-500 h-full rounded-full" style={{ width: `${r.count ? (resp.count / r.count) * 100 : 0}%` }} />
                              </div>
                              <span className="text-xs text-slate-500 w-8 text-right">{resp.count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Surveys;
