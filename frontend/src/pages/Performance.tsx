import React, { useEffect, useState } from 'react';
import { BarChart3, Plus, X, Target, FileText, CheckCircle2, Circle, Search, Star } from 'lucide-react';
import { PerformanceAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import SkeletonTable from '../components/common/SkeletonTable';
import type { PerformanceGoal, PerformanceReview, GoalStatus, ReviewStatus } from '../types/domain';

const GOAL_STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: 'bg-slate-100 text-slate-600 border-slate-200',
  IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-200',
  ACHIEVED: 'bg-green-50 text-green-700 border-green-200',
  CANCELLED: 'bg-red-50 text-red-600 border-red-200',
};
const REVIEW_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  SUBMITTED: 'bg-amber-50 text-amber-700 border-amber-200',
  ACKNOWLEDGED: 'bg-blue-50 text-blue-700 border-blue-200',
  COMPLETED: 'bg-green-50 text-green-700 border-green-200',
};
const GOAL_OPTS: GoalStatus[] = ['NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED', 'CANCELLED'];
const REVIEW_OPTS: ReviewStatus[] = ['DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'COMPLETED'];
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Performance: React.FC = () => {
  const { showToast } = useToast();
  const { can } = usePermissions();
  const canManage = can('manage_employees');

  const [tab, setTab] = useState<'goals' | 'reviews'>('goals');
  const [goals, setGoals] = useState<PerformanceGoal[]>([]);
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  // Goal filter
  const [goalFilter, setGoalFilter] = useState('');
  const [reviewFilter, setReviewFilter] = useState('');

  // Create Goal
  const [showGoal, setShowGoal] = useState(false);
  const [gEmp, setGEmp] = useState('');
  const [gTitle, setGTitle] = useState('');
  const [gDesc, setGDesc] = useState('');
  const [gCat, setGCat] = useState('');
  const [gStart, setGStart] = useState('');
  const [gTarget, setGTarget] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Create Review
  const [showReview, setShowReview] = useState(false);
  const [rEmp, setREmp] = useState('');
  const [rReviewer, setRReviewer] = useState('');
  const [rPeriod, setRPeriod] = useState('');
  const [reviewers, setReviewers] = useState<any[]>([]);

  // Edit Review detail
  const [editReviewId, setEditReviewId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState<number>(0);
  const [editSummary, setEditSummary] = useState('');
  const [editAchievements, setEditAchievements] = useState('');
  const [editAreas, setEditAreas] = useState('');
  const [editEmpComments, setEditEmpComments] = useState('');
  const [editSkills, setEditSkills] = useState<{ name: string; rating: number }[]>([]);
  const [newSkill, setNewSkill] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      if (tab === 'goals') {
        const res = await PerformanceAPI.getGoals({ ...(goalFilter && { status: goalFilter }) });
        setGoals(res.data.data || []);
      } else {
        const res = await PerformanceAPI.getReviews({ ...(reviewFilter && { status: reviewFilter }) });
        setReviews(res.data.data || []);
      }
    } catch { showToast('Failed to load data', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [tab, goalFilter, reviewFilter]);

  const loadEmployees = async () => {
    try { const res = await PerformanceAPI.getEmployees(); setEmployees(res.data.data || []); } catch { /* ignore */ }
  };
  const loadReviewers = async () => {
    try { const res = await PerformanceAPI.getReviewers(); setReviewers(res.data.data || []); } catch { /* ignore */ }
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gEmp || !gTitle) return;
    setSubmitting(true);
    try {
      await PerformanceAPI.createGoal({ employeeId: gEmp, title: gTitle, description: gDesc || undefined, category: gCat || undefined, startDate: gStart || undefined, targetDate: gTarget || undefined });
      showToast('Goal created', 'success');
      setShowGoal(false); setGEmp(''); setGTitle(''); setGDesc(''); setGCat(''); setGStart(''); setGTarget('');
      loadData();
    } catch (err: any) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setSubmitting(false); }
  };

  const handleGoalProgress = async (id: string, progress: number, status?: GoalStatus) => {
    setActionLoading('goal-' + id);
    try {
      const data: any = { progress };
      if (status) data.status = status;
      await PerformanceAPI.updateGoal(id, data);
      loadData();
    } catch (err: any) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setActionLoading(''); }
  };

  const handleCreateReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rEmp || !rReviewer || !rPeriod) return;
    setSubmitting(true);
    try {
      await PerformanceAPI.createReview({ employeeId: rEmp, reviewerId: rReviewer, period: rPeriod });
      showToast('Review created', 'success');
      setShowReview(false); setREmp(''); setRReviewer(''); setRPeriod('');
      loadData();
    } catch (err: any) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setSubmitting(false); }
  };

  const openEditReview = async (id: string) => {
    try {
      const res = await PerformanceAPI.getReview(id);
      const r = res.data.data;
      setEditReviewId(id);
      setEditRating(r.rating || 0);
      setEditSummary(r.summary || '');
      setEditAchievements(r.achievements || '');
      setEditAreas(r.areasForImprovement || '');
      setEditEmpComments(r.employeeComments || '');
      setEditSkills(r.skills?.map(s => ({ name: s.name, rating: s.rating || 0 })) || []);
    } catch { showToast('Failed to load review', 'error'); }
  };

  const handleSaveReview = async () => {
    if (!editReviewId) return;
    setActionLoading('save-review');
    try {
      await PerformanceAPI.updateReview(editReviewId, {
        rating: editRating || undefined, summary: editSummary || undefined,
        achievements: editAchievements || undefined, areasForImprovement: editAreas || undefined,
        employeeComments: editEmpComments || undefined, skills: editSkills,
      });
      showToast('Review saved', 'success');
      setEditReviewId(null);
      loadData();
    } catch (err: any) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setActionLoading(''); }
  };

  const handleReviewStatus = async (id: string, status: ReviewStatus) => {
    setActionLoading('rv-' + id);
    try {
      await PerformanceAPI.updateReview(id, { status });
      showToast(`Review ${status}`, 'success');
      loadData();
    } catch (err: any) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setActionLoading(''); }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <BarChart3 size={28} className="text-navy" />
          <h1 className="text-2xl font-semibold text-navy">Performance</h1>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {tab === 'goals' && (
              <button onClick={() => { setShowGoal(true); loadEmployees(); }} className="btn btn-primary flex items-center gap-2">
                <Plus size={18} /> New Goal
              </button>
            )}
            {tab === 'reviews' && (
              <button onClick={() => { setShowReview(true); loadEmployees(); loadReviewers(); }} className="btn btn-primary flex items-center gap-2">
                <Plus size={18} /> New Review
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-6">
        <button onClick={() => setTab('goals')} className={`px-4 py-1.5 text-sm rounded-lg border transition-colors ${tab === 'goals' ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200'}`}>
          <Target size={16} className="inline mr-1.5" />Goals
        </button>
        <button onClick={() => setTab('reviews')} className={`px-4 py-1.5 text-sm rounded-lg border transition-colors ${tab === 'reviews' ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200'}`}>
          <FileText size={16} className="inline mr-1.5" />Reviews
        </button>
      </div>

      {/* Goals */}
      {tab === 'goals' && (
        <>
          <div className="flex gap-2 mb-4">
            {['', 'NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED'].map(s => (
              <button key={s || 'all'} onClick={() => setGoalFilter(s)}
                className={`px-3 py-1 text-xs rounded-lg border transition-colors ${goalFilter === s ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200'}`}
              >{s ? s.replace('_', ' ') : 'All'}</button>
            ))}
          </div>

          {loading ? <SkeletonTable rows={5} cols={5} /> : (
            <div className="space-y-2">
              {goals.length === 0 && (
                <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-500">
                  <Target size={48} className="mx-auto mb-3 text-slate-300" />
                  <p className="text-lg font-medium text-slate-400 mb-1">No goals yet</p>
                </div>
              )}
              {goals.map(g => (
                <div key={g.id} className="bg-white rounded-lg border border-slate-200 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-slate-900">{g.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${GOAL_STATUS_COLORS[g.status] || ''}`}>
                          {g.status?.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {g.employee?.firstName} {g.employee?.lastName} ({g.employee?.employeeCode})
                        {g.category && <span className="ml-2">• {g.category}</span>}
                        {g.targetDate && <span className="ml-2">• Due {fmtDate(g.targetDate)}</span>}
                      </div>
                      {g.description && <p className="text-sm text-slate-600 mt-1">{g.description}</p>}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${(g.progress || 0) >= 80 ? 'bg-green-500' : (g.progress || 0) >= 40 ? 'bg-blue-500' : 'bg-amber-500'}`}
                          style={{ width: `${g.progress || 0}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium text-slate-600 w-10 text-right">{g.progress || 0}%</span>
                      {canManage && (
                        <select className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white"
                          value="" onChange={e => { if (!e.target.value) return; const [p, s] = e.target.value.split('|'); handleGoalProgress(g.id, parseInt(p), s || undefined); }}
                        >
                          <option value="">Progress...</option>
                          <option value="0|NOT_STARTED">Not Started</option>
                          <option value="25|IN_PROGRESS">25%</option>
                          <option value="50|IN_PROGRESS">50%</option>
                          <option value="75|IN_PROGRESS">75%</option>
                          <option value="100|ACHIEVED">100% Achieved</option>
                        </select>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Reviews */}
      {tab === 'reviews' && (
        <>
          <div className="flex gap-2 mb-4">
            {['', 'DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'COMPLETED'].map(s => (
              <button key={s || 'all'} onClick={() => setReviewFilter(s)}
                className={`px-3 py-1 text-xs rounded-lg border transition-colors ${reviewFilter === s ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200'}`}
              >{s || 'All'}</button>
            ))}
          </div>

          {loading ? <SkeletonTable rows={5} cols={5} /> : (
            <div className="space-y-2">
              {reviews.length === 0 && (
                <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-500">
                  <FileText size={48} className="mx-auto mb-3 text-slate-300" />
                  <p className="text-lg font-medium text-slate-400 mb-1">No reviews yet</p>
                </div>
              )}
              {reviews.map(r => (
                <div key={r.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                  <div className="p-4 flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-slate-900">{r.employee?.firstName} {r.employee?.lastName}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${REVIEW_STATUS_COLORS[r.status] || ''}`}>
                          {r.status}
                        </span>
                        {r.rating && (
                          <span className="text-xs flex items-center gap-0.5 text-amber-600">
                            {Array.from({ length: r.rating }).map((_, i) => <Star key={i} size={12} className="fill-amber-400" />)}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">
                        Period: {r.period}
                        <span className="ml-2">Reviewer: {r.reviewer?.name}</span>
                        <span className="ml-2">Created {fmtDate(r.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-3 shrink-0">
                      {canManage && r.status === 'DRAFT' && (
                        <button onClick={() => openEditReview(r.id)} className="btn btn-sm btn-primary">Edit</button>
                      )}
                      {canManage && r.status === 'DRAFT' && (
                        <button onClick={() => handleReviewStatus(r.id, 'SUBMITTED')} className="btn btn-sm btn-success">Submit</button>
                      )}
                      {canManage && r.status === 'SUBMITTED' && (
                        <button onClick={() => openEditReview(r.id)} className="btn btn-sm bg-blue-100 text-blue-700 border border-blue-200">
                          Review
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create Goal modal */}
      {showGoal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowGoal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">New Goal</h2>
              <button onClick={() => setShowGoal(false)} className="text-slate-400"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateGoal} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Employee *</label>
                <select className="input" value={gEmp} onChange={e => setGEmp(e.target.value)} required>
                  <option value="">Select employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                <input className="input" value={gTitle} onChange={e => setGTitle(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea className="input min-h-[60px]" value={gDesc} onChange={e => setGDesc(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                  <select className="input" value={gCat} onChange={e => setGCat(e.target.value)}>
                    <option value="">Select</option>
                    <option value="DEVELOPMENT">Development</option>
                    <option value="PROJECT">Project</option>
                    <option value="BEHAVIORAL">Behavioral</option>
                    <option value="SALES">Sales</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Target Date</label>
                  <input type="date" className="input" value={gTarget} onChange={e => setGTarget(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowGoal(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? 'Creating...' : 'Create Goal'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Review modal */}
      {showReview && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowReview(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">New Review</h2>
              <button onClick={() => setShowReview(false)} className="text-slate-400"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateReview} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Employee *</label>
                <select className="input" value={rEmp} onChange={e => setREmp(e.target.value)} required>
                  <option value="">Select employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Reviewer *</label>
                <select className="input" value={rReviewer} onChange={e => setRReviewer(e.target.value)} required>
                  <option value="">Select reviewer</option>
                  {reviewers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Period *</label>
                <select className="input" value={rPeriod} onChange={e => setRPeriod(e.target.value)} required>
                  <option value="">Select period</option>
                  {(() => {
                    const opts = [];
                    for (let y = 2024; y <= 2027; y++) {
                      opts.push(`${y}-Q1`, `${y}-Q2`, `${y}-Q3`, `${y}-Q4`, `${y}-H1`, `${y}-H2`, `${y} Annual`);
                    }
                    return opts.map(p => <option key={p} value={p}>{p}</option>);
                  })()}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowReview(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? 'Creating...' : 'Create Review'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Review modal */}
      {editReviewId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setEditReviewId(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">Edit Review</h2>
              <button onClick={() => setEditReviewId(null)} className="text-slate-400"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              {/* Rating */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Overall Rating</label>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setEditRating(n)}
                      className={`p-1 ${n <= editRating ? 'text-amber-400' : 'text-slate-200'}`}
                    ><Star size={24} className={n <= editRating ? 'fill-amber-400' : ''} /></button>
                  ))}
                  <span className="text-sm text-slate-500 ml-2">{editRating}/5</span>
                </div>
              </div>

              {/* Skills */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Skills</label>
                <div className="space-y-1.5 mb-2">
                  {editSkills.map((s, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-sm flex-1">{s.name}</span>
                      <select className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white"
                        value={s.rating} onChange={e => {
                          const updated = [...editSkills];
                          updated[i] = { ...updated[i], rating: parseInt(e.target.value) };
                          setEditSkills(updated);
                        }}
                      >
                        {[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n === 0 ? '—' : n}</option>)}
                      </select>
                      <button onClick={() => setEditSkills(editSkills.filter((_, j) => j !== i))} className="text-red-400"><X size={14} /></button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <input className="input text-sm flex-1" value={newSkill} onChange={e => setNewSkill(e.target.value)}
                    placeholder="Add skill..." onKeyDown={e => {
                      if (e.key === 'Enter' && newSkill) { e.preventDefault(); setEditSkills([...editSkills, { name: newSkill, rating: 0 }]); setNewSkill(''); }
                    }}
                  />
                  <button type="button" onClick={() => { if (newSkill) { setEditSkills([...editSkills, { name: newSkill, rating: 0 }]); setNewSkill(''); } }}
                    className="btn btn-sm btn-primary">Add</button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Summary</label>
                <textarea className="input min-h-[80px]" value={editSummary} onChange={e => setEditSummary(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Achievements</label>
                <textarea className="input min-h-[80px]" value={editAchievements} onChange={e => setEditAchievements(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Areas for Improvement</label>
                <textarea className="input min-h-[80px]" value={editAreas} onChange={e => setEditAreas(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Employee Comments</label>
                <textarea className="input min-h-[80px]" value={editEmpComments} onChange={e => setEditEmpComments(e.target.value)} />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setEditReviewId(null)} className="btn btn-ghost">Cancel</button>
                <button onClick={handleSaveReview} disabled={!!actionLoading} className="btn btn-primary">
                  {actionLoading ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Performance;
