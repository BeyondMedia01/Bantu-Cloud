import React, { useEffect, useState } from 'react';
import { Users, Plus, X, Star, TrendingUp } from 'lucide-react';
import { SuccessionAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import SkeletonTable from '../components/common/SkeletonTable';
import type { SuccessionPlan } from '../types/domain';

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-50 text-green-700 border-green-200',
  FILLED: 'bg-blue-50 text-blue-700 border-blue-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
};
const READINESS_LABELS: Record<string, string> = {
  READY_NOW: 'Ready Now', READY_1_2_YEARS: '1-2 Years', READY_3_5_YEARS: '3-5 Years', LONG_TERM: 'Long Term',
};
const READINESS_COLORS: Record<string, string> = {
  READY_NOW: 'bg-green-100 text-green-700', READY_1_2_YEARS: 'bg-blue-100 text-blue-700',
  READY_3_5_YEARS: 'bg-amber-100 text-amber-700', LONG_TERM: 'bg-slate-100 text-slate-600',
};
const RISK_COLORS: Record<string, string> = { HIGH: 'text-red-600', MEDIUM: 'text-amber-600', LOW: 'text-green-600' };

const Succession: React.FC = () => {
  const { showToast } = useToast();
  const { can } = usePermissions();
  const canManage = can('SUCCESSION');

  const [plans, setPlans] = useState<SuccessionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [, setActionLoading] = useState('');

  // Create plan
  const [showCreate, setShowCreate] = useState(false);
  const [fTitle, setFTitle] = useState('');
  const [fDept, setFDept] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fRisk, setFRisk] = useState('MEDIUM');
  const [submitting, setSubmitting] = useState(false);

  // Add candidate
  const [showCandidate, setShowCandidate] = useState(false);
  const [candPlanId, setCandPlanId] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [cEmp, setCEmp] = useState('');
  const [cReadiness, setCReadiness] = useState('READY_1_2_YEARS');
  const [cRating, setCRating] = useState(3);
  const [cNotes, setCNotes] = useState('');
  const [cStrengths, setCStrengths] = useState('');
  const [cGrowth, setCGrowth] = useState('');

  const loadPlans = async () => {
    setLoading(true);
    try { const res = await SuccessionAPI.getPlans(); setPlans(res.data.data || []); }
    catch { showToast('Failed to load plans', 'error'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadPlans(); }, []);

  const loadEmployees = async () => {
    try { const res = await SuccessionAPI.getEmployees(); setEmployees(res.data.data || []); } catch { /* ignore */ }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fTitle) return;
    setSubmitting(true);
    try {
      await SuccessionAPI.createPlan({ positionTitle: fTitle, department: fDept || undefined, description: fDesc || undefined, riskLevel: fRisk });
      showToast('Plan created', 'success');
      setShowCreate(false); setFTitle(''); setFDept(''); setFDesc(''); setFRisk('MEDIUM');
      loadPlans();
    } catch (err: any) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setSubmitting(false); }
  };

  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!candPlanId || !cEmp) return;
    setSubmitting(true);
    try {
      await SuccessionAPI.addCandidate(candPlanId, { employeeId: cEmp, readiness: cReadiness, rating: cRating, notes: cNotes || undefined, strengths: cStrengths || undefined, areasForGrowth: cGrowth || undefined });
      showToast('Candidate added', 'success');
      setShowCandidate(false); setCEmp(''); setCNotes(''); setCStrengths(''); setCGrowth('');
      if (expandedId) { const res = await SuccessionAPI.getPlans(); setPlans(res.data.data || []); }
      loadPlans();
    } catch (err: any) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setSubmitting(false); }
  };

  const handleFill = async (id: string) => {
    setActionLoading('fill-' + id);
    try { await SuccessionAPI.updatePlan(id, { status: 'FILLED' }); showToast('Marked as filled', 'success'); loadPlans(); }
    catch (err: any) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setActionLoading(''); }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users size={28} className="text-navy" />
          <h1 className="text-2xl font-semibold text-navy">Succession</h1>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(true)} className="btn btn-primary flex items-center gap-2"><Plus size={18} /> New Plan</button>
        )}
      </div>

      {loading ? <SkeletonTable headers={['Position', 'Department', 'Status', 'Actions']} rows={5} /> : (
        <div className="space-y-3">
          {plans.length === 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-500">
              <TrendingUp size={48} className="mx-auto mb-3 text-slate-300" />
              <p className="text-lg font-medium text-slate-400 mb-1">No succession plans</p>
              <p>Create a plan for key positions in your organization.</p>
            </div>
          )}
          {plans.map(p => (
            <div key={p.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="p-4 cursor-pointer hover:bg-slate-50" onClick={() => setExpandedId(expandedId === p.id ? null : p.id)}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-slate-900">{p.positionTitle}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[p.status] || ''}`}>{p.status}</span>
                      {p.riskLevel && <span className={`text-xs font-medium ${RISK_COLORS[p.riskLevel] || ''}`}>{p.riskLevel} Risk</span>}
                    </div>
                    <div className="text-sm text-slate-500">
                      {p.department && <span>{p.department} • </span>}
                      {p._count && <span>{p._count.candidates} candidates</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3" onClick={e => e.stopPropagation()}>
                    {canManage && p.status === 'ACTIVE' && (
                      <button onClick={() => handleFill(p.id)} className="btn btn-sm btn-success">Mark Filled</button>
                    )}
                  </div>
                </div>
              </div>

              {expandedId === p.id && (
                <div className="border-t border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-slate-700">Candidates</h4>
                    {canManage && p.status === 'ACTIVE' && (
                      <button onClick={() => { setCandPlanId(p.id); setShowCandidate(true); loadEmployees(); }}
                        className="btn btn-sm btn-primary flex items-center gap-1"><Plus size={14} /> Add Candidate</button>
                    )}
                  </div>

                  {(!p.candidates || p.candidates.length === 0) ? (
                    <p className="text-sm text-slate-400 text-center py-4">No candidates identified yet</p>
                  ) : (
                    <div className="space-y-2">
                      {p.candidates.map(c => (
                        <div key={c.id} className="bg-white rounded border border-slate-200 p-3">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-slate-800 text-sm">{c.employee?.firstName} {c.employee?.lastName}</span>
                                {c.readiness && (
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${READINESS_COLORS[c.readiness] || ''}`}>
                                    {READINESS_LABELS[c.readiness] || c.readiness}
                                  </span>
                                )}
                                {c.rating && (
                                  <span className="text-xs text-amber-600 flex items-center gap-0.5">
                                    {Array.from({ length: c.rating }).map((_, i) => <Star key={i} size={11} className="fill-amber-400" />)}
                                  </span>
                                )}
                              </div>
                              {c.strengths && <p className="text-xs text-slate-500 mt-1"><strong>Strengths:</strong> {c.strengths}</p>}
                              {c.areasForGrowth && <p className="text-xs text-slate-500"><strong>Growth:</strong> {c.areasForGrowth}</p>}
                              {c.notes && <p className="text-xs text-slate-400 italic mt-0.5">{c.notes}</p>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">New Succession Plan</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Position Title *</label>
                <input className="input" value={fTitle} onChange={e => setFTitle(e.target.value)} required placeholder="e.g. Chief Technology Officer" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                  <input className="input" value={fDept} onChange={e => setFDept(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Risk Level</label>
                  <select className="input" value={fRisk} onChange={e => setFRisk(e.target.value)}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea className="input min-h-[60px]" value={fDesc} onChange={e => setFDesc(e.target.value)} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? 'Creating...' : 'Create Plan'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCandidate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCandidate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">Add Candidate</h2>
              <button onClick={() => setShowCandidate(false)} className="text-slate-400"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddCandidate} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Employee *</label>
                <select className="input" value={cEmp} onChange={e => setCEmp(e.target.value)} required>
                  <option value="">Select employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Readiness</label>
                  <select className="input" value={cReadiness} onChange={e => setCReadiness(e.target.value)}>
                    <option value="READY_NOW">Ready Now</option>
                    <option value="READY_1_2_YEARS">1-2 Years</option>
                    <option value="READY_3_5_YEARS">3-5 Years</option>
                    <option value="LONG_TERM">Long Term</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Rating (1-5)</label>
                  <select className="input" value={cRating} onChange={e => setCRating(parseInt(e.target.value))}>
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Strengths</label>
                <textarea className="input min-h-[50px]" value={cStrengths} onChange={e => setCStrengths(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Areas for Growth</label>
                <textarea className="input min-h-[50px]" value={cGrowth} onChange={e => setCGrowth(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes</label>
                <textarea className="input min-h-[50px]" value={cNotes} onChange={e => setCNotes(e.target.value)} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCandidate(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? 'Adding...' : 'Add Candidate'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Succession;
