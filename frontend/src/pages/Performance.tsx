import React, { useEffect, useState } from 'react';
import { Plus, X, Target, FileText, Star, ChevronDown, Edit } from 'lucide-react';
import { PerformanceAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import SkeletonTable from '../components/common/SkeletonTable';
import { EmptyState } from '@/components/ui/empty-state';
import { Dropdown } from '@/components/ui/dropdown';
import type { PerformanceGoal, PerformanceReview, GoalStatus, ReviewStatus } from '../types/domain';

const GOAL_STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: 'bg-muted text-muted-foreground',
  IN_PROGRESS: 'bg-blue-50 text-blue-700',
  ACHIEVED: 'bg-emerald-50 text-emerald-700',
  CANCELLED: 'bg-red-50 text-red-700',
};
const REVIEW_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  SUBMITTED: 'bg-amber-50 text-amber-700',
  ACKNOWLEDGED: 'bg-blue-50 text-blue-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
};

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Performance: React.FC = () => {
  const { showToast } = useToast();
  const { can } = usePermissions();
  const canManage = can('PERFORMANCE');

  const [tab, setTab] = useState<'goals' | 'reviews'>('goals');
  const [goals, setGoals] = useState<PerformanceGoal[]>([]);
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  const [goalFilter, setGoalFilter] = useState('');
  const [reviewFilter, setReviewFilter] = useState('');

  // Create Goal
  const [showGoal, setShowGoal] = useState(false);
  const [gEmp, setGEmp] = useState('');
  const [gTitle, setGTitle] = useState('');
  const [gDesc, setGDesc] = useState('');
  const [gCat, setGCat] = useState('');
  const [gTarget, setGTarget] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Create Review
  const [showReview, setShowReview] = useState(false);
  const [rEmp, setREmp] = useState('');
  const [rReviewer, setRReviewer] = useState('');
  const [rPeriod, setRPeriod] = useState('');
  const [reviewers, setReviewers] = useState<any[]>([]);

  // Edit Review
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
      await PerformanceAPI.createGoal({ employeeId: gEmp, title: gTitle, description: gDesc || undefined, category: gCat || undefined, targetDate: gTarget || undefined });
      showToast('Goal created', 'success');
      setShowGoal(false); setGEmp(''); setGTitle(''); setGDesc(''); setGCat(''); setGTarget('');
      loadData();
    } catch (err: any) { showToast(err.message || 'Failed', 'error'); }
    finally { setSubmitting(false); }
  };

  const handleGoalProgress = async (id: string, progress: number, status?: GoalStatus) => {
    setActionLoading('goal-' + id);
    try {
      const data: any = { progress };
      if (status) data.status = status;
      await PerformanceAPI.updateGoal(id, data);
      loadData();
    } catch (err: any) { showToast(err.message || 'Failed', 'error'); }
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
    } catch (err: any) { showToast(err.message || 'Failed', 'error'); }
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
      setEditSkills(r.skills?.map((s: any) => ({ name: s.name, rating: s.rating || 0 })) || []);
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
    } catch (err: any) { showToast(err.message || 'Failed', 'error'); }
    finally { setActionLoading(''); }
  };

  const handleReviewStatus = async (id: string, status: ReviewStatus) => {
    setActionLoading('rv-' + id);
    try {
      await PerformanceAPI.updateReview(id, { status });
      showToast(`Review ${status}`, 'success');
      loadData();
    } catch (err: any) { showToast(err.message || 'Failed', 'error'); }
    finally { setActionLoading(''); }
  };

  const GOAL_STATUS_OPTS = ['', 'NOT_STARTED', 'IN_PROGRESS', 'ACHIEVED', 'CANCELLED'];
  const REVIEW_STATUS_OPTS = ['', 'DRAFT', 'SUBMITTED', 'ACKNOWLEDGED', 'COMPLETED'];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Performance</h1>
          <p className="text-muted-foreground font-medium text-sm">Track goals and performance reviews</p>
        </div>
        {canManage && tab === 'goals' && (
          <button onClick={() => { setShowGoal(true); loadEmployees(); }} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
            <Plus size={18} /> New Goal
          </button>
        )}
        {canManage && tab === 'reviews' && (
          <button onClick={() => { setShowReview(true); loadEmployees(); loadReviewers(); }} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
            <Plus size={18} /> New Review
          </button>
        )}
      </header>

      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {[{ key: 'goals', label: 'Goals' }, { key: 'reviews', label: 'Reviews' }].map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key as 'goals' | 'reviews')}
              className={`px-4 py-2.5 text-sm font-bold transition-colors border-b-2 -mb-px ${active ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-navy'}`}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Goals tab */}
      {tab === 'goals' && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Filters</p>
              {goalFilter && <button onClick={() => setGoalFilter('')} className="text-xs font-bold text-muted-foreground hover:text-red-500 px-3 py-1.5 rounded-full border border-border hover:border-red-200 hover:bg-red-50 transition-colors">× Clear filters</button>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Dropdown
                trigger={(isOpen) => (
                  <button className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium shadow-sm flex items-center justify-between hover:border-accent-green transition-colors">
                    <span className="truncate">{goalFilter ? goalFilter.replace('_', ' ') : 'All Statuses'}</span>
                    <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
                sections={[{ items: GOAL_STATUS_OPTS.map(s => ({ label: s ? s.replace('_', ' ') : 'All Statuses', onClick: () => setGoalFilter(s) })) }]}
              />
            </div>
          </div>

          <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
            {loading ? <SkeletonTable headers={["", "", "", "", ""]} rows={6} /> : goals.length === 0 ? (
              <EmptyState variant="no-data" icon={Target} title="No goals yet" description="Create goals to track employee performance."
                action={canManage ? { label: 'New Goal', onClick: () => { setShowGoal(true); loadEmployees(); } } : undefined} />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Goal</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Progress</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Due</th>
                    {canManage && <th className="px-5 py-4 text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {goals.map(g => (
                    <tr key={g.id} className="hover:bg-muted/70 transition-colors">
                      <td className="px-5 py-4 font-medium text-navy">
                        {g.employee?.firstName} {g.employee?.lastName}
                        <p className="text-xs text-muted-foreground">{g.employee?.employeeCode}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium text-navy">{g.title}</p>
                        {g.category && <p className="text-xs text-muted-foreground">{g.category}</p>}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${GOAL_STATUS_COLORS[g.status]}`}>
                          {g.status?.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-muted rounded-full h-1.5 overflow-hidden">
                            <div className={`h-full rounded-full ${(g.progress || 0) >= 80 ? 'bg-emerald-500' : (g.progress || 0) >= 40 ? 'bg-blue-500' : 'bg-amber-500'}`}
                              style={{ width: `${g.progress || 0}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground">{g.progress || 0}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{g.targetDate ? fmtDate(g.targetDate) : '—'}</td>
                      {canManage && (
                        <td className="px-5 py-4 text-right">
                          <select className="text-xs border border-border rounded-lg px-2 py-1 bg-primary text-muted-foreground"
                            value="" onChange={e => { if (!e.target.value) return; const [p, s] = e.target.value.split('|'); handleGoalProgress(g.id, parseInt(p), s as GoalStatus | undefined); }}
                          >
                            <option value="">Update...</option>
                            <option value="0|NOT_STARTED">Not Started</option>
                            <option value="25|IN_PROGRESS">25%</option>
                            <option value="50|IN_PROGRESS">50%</option>
                            <option value="75|IN_PROGRESS">75%</option>
                            <option value="100|ACHIEVED">100% Achieved</option>
                          </select>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Reviews tab */}
      {tab === 'reviews' && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Filters</p>
              {reviewFilter && <button onClick={() => setReviewFilter('')} className="text-xs font-bold text-muted-foreground hover:text-red-500 px-3 py-1.5 rounded-full border border-border hover:border-red-200 hover:bg-red-50 transition-colors">× Clear filters</button>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Dropdown
                trigger={(isOpen) => (
                  <button className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium shadow-sm flex items-center justify-between hover:border-accent-green transition-colors">
                    <span className="truncate">{reviewFilter || 'All Statuses'}</span>
                    <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
                sections={[{ items: REVIEW_STATUS_OPTS.map(s => ({ label: s || 'All Statuses', onClick: () => setReviewFilter(s) })) }]}
              />
            </div>
          </div>

          <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
            {loading ? <SkeletonTable headers={["", "", "", "", ""]} rows={6} /> : reviews.length === 0 ? (
              <EmptyState variant="no-data" icon={FileText} title="No reviews yet" description="Create performance reviews for employees."
                action={canManage ? { label: 'New Review', onClick: () => { setShowReview(true); loadEmployees(); loadReviewers(); } } : undefined} />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Period</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Reviewer</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Rating</th>
                    <th className="px-5 py-4 text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reviews.map(r => (
                    <tr key={r.id} className="hover:bg-muted/70 transition-colors">
                      <td className="px-5 py-4 font-medium text-navy">
                        {r.employee?.firstName} {r.employee?.lastName}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{r.period}</td>
                      <td className="px-5 py-4 text-muted-foreground">{r.reviewer?.name}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${REVIEW_STATUS_COLORS[r.status]}`}>
                          {r.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {r.rating ? (
                          <span className="flex items-center gap-0.5">
                            {Array.from({ length: r.rating }).map((_, i) => <Star key={i} size={12} className="fill-amber-400 text-amber-400" />)}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canManage && (r.status === 'DRAFT' || r.status === 'SUBMITTED') && (
                            <button onClick={() => openEditReview(r.id)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-navy transition-colors">
                              <Edit size={15} />
                            </button>
                          )}
                          {canManage && r.status === 'DRAFT' && (
                            <button onClick={() => handleReviewStatus(r.id, 'SUBMITTED')} disabled={!!actionLoading}
                              className="px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-[11px] font-bold hover:bg-amber-100 transition-colors">
                              Submit
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
        </>
      )}

      {/* Create Goal modal */}
      {showGoal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowGoal(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="modal-title-goal" className="bg-primary rounded-2xl shadow-xl w-full max-w-md flex flex-col" onKeyDown={(e) => { if (e.key === 'Escape') setShowGoal(false); }} tabIndex={-1}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 id="modal-title-goal" className="text-lg font-bold text-navy">New Goal</h2>
              <button onClick={() => setShowGoal(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateGoal} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee *</span>
                <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={gEmp} onChange={e => setGEmp(e.target.value)} required>
                  <option value="">Select employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Title *</span>
                <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={gTitle} onChange={e => setGTitle(e.target.value)} required />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</span>
                <textarea className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green min-h-[60px]"
                  value={gDesc} onChange={e => setGDesc(e.target.value)} />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Category</span>
                  <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={gCat} onChange={e => setGCat(e.target.value)}>
                    <option value="">Select</option>
                    <option value="DEVELOPMENT">Development</option>
                    <option value="PROJECT">Project</option>
                    <option value="BEHAVIORAL">Behavioral</option>
                    <option value="SALES">Sales</option>
                    <option value="OTHER">Other</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Target Date</span>
                  <input type="date" className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={gTarget} onChange={e => setGTarget(e.target.value)} />
                </label>
              </div>
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowGoal(false)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={(e) => { handleCreateGoal(e); }} disabled={submitting} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
                <Plus size={16} /> {submitting ? 'Creating...' : 'Create Goal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Review modal */}
      {showReview && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowReview(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="modal-title-review" className="bg-primary rounded-2xl shadow-xl w-full max-w-md flex flex-col" onKeyDown={(e) => { if (e.key === 'Escape') setShowReview(false); }} tabIndex={-1}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 id="modal-title-review" className="text-lg font-bold text-navy">New Review</h2>
              <button onClick={() => setShowReview(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateReview} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee *</span>
                <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={rEmp} onChange={e => setREmp(e.target.value)} required>
                  <option value="">Select employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Reviewer *</span>
                <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={rReviewer} onChange={e => setRReviewer(e.target.value)} required>
                  <option value="">Select reviewer</option>
                  {reviewers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Period *</span>
                <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={rPeriod} onChange={e => setRPeriod(e.target.value)} required>
                  <option value="">Select period</option>
                  {(() => {
                    const opts = [];
                    for (let y = 2024; y <= 2027; y++) {
                      opts.push(`${y}-Q1`, `${y}-Q2`, `${y}-Q3`, `${y}-Q4`, `${y}-H1`, `${y}-H2`, `${y} Annual`);
                    }
                    return opts.map(p => <option key={p} value={p}>{p}</option>);
                  })()}
                </select>
              </label>
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowReview(false)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={(e) => { handleCreateReview(e); }} disabled={submitting} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
                <Plus size={16} /> {submitting ? 'Creating...' : 'Create Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Review modal */}
      {editReviewId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditReviewId(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="modal-title-edit-review" className="bg-primary rounded-2xl shadow-xl w-full max-w-lg flex flex-col" onKeyDown={(e) => { if (e.key === 'Escape') setEditReviewId(null); }} tabIndex={-1}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 id="modal-title-edit-review" className="text-lg font-bold text-navy">Edit Review</h2>
              <button onClick={() => setEditReviewId(null)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <div className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Overall Rating</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} type="button" onClick={() => setEditRating(n)}
                      className={`p-1 transition-colors ${n <= editRating ? 'text-amber-400' : 'text-muted'}`}>
                      <Star size={24} className={n <= editRating ? 'fill-amber-400' : ''} />
                    </button>
                  ))}
                  <span className="text-sm text-muted-foreground ml-2">{editRating}/5</span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Skills</span>
                  <button type="button" onClick={() => { if (newSkill) { setEditSkills([...editSkills, { name: newSkill, rating: 0 }]); setNewSkill(''); } }}
                    className="text-xs font-bold text-navy hover:underline">+ Add</button>
                </div>
                <div className="flex gap-2 mb-2">
                  <input className="bg-primary border border-border rounded-2xl px-4 py-2 text-sm focus:outline-none flex-1"
                    value={newSkill} onChange={e => setNewSkill(e.target.value)}
                    placeholder="Skill name..."
                    onKeyDown={e => { if (e.key === 'Enter' && newSkill) { e.preventDefault(); setEditSkills([...editSkills, { name: newSkill, rating: 0 }]); setNewSkill(''); } }}
                  />
                </div>
                <div className="space-y-1.5">
                  {editSkills.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2">
                      <span className="text-sm flex-1 text-navy">{s.name}</span>
                      <select className="text-xs border border-border rounded-lg px-2 py-1 bg-primary"
                        value={s.rating} onChange={e => {
                          const updated = [...editSkills];
                          updated[i] = { ...updated[i], rating: parseInt(e.target.value) };
                          setEditSkills(updated);
                        }}>
                        {[0, 1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n === 0 ? '—' : n}</option>)}
                      </select>
                      <button onClick={() => setEditSkills(editSkills.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>

              {[
                { label: 'Summary', val: editSummary, set: setEditSummary },
                { label: 'Achievements', val: editAchievements, set: setEditAchievements },
                { label: 'Areas for Improvement', val: editAreas, set: setEditAreas },
                { label: 'Employee Comments', val: editEmpComments, set: setEditEmpComments },
              ].map(({ label, val, set }) => (
                <label key={label} className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{label}</span>
                  <textarea className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green min-h-[70px]"
                    value={val} onChange={e => set(e.target.value)} />
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setEditReviewId(null)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleSaveReview} disabled={!!actionLoading} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90">
                {actionLoading ? 'Saving...' : 'Save Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Performance;
