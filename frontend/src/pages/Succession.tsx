import React, { useEffect, useState } from 'react';
import { Plus, X, TrendingUp, Edit } from 'lucide-react';
import { SuccessionAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import SkeletonTable from '../components/common/SkeletonTable';
import { EmptyState } from '@/components/ui/empty-state';
import type { SuccessionPlan } from '../types/domain';
import { StatusBadge } from '@/components/common/StatusBadge';

const RISK_COLORS: Record<string, string> = {
  HIGH: 'bg-red-50 text-red-700',
  MEDIUM: 'bg-amber-50 text-amber-700',
  LOW: 'bg-emerald-50 text-emerald-700',
};

const Succession: React.FC = () => {
  const { showToast } = useToast();
  const { can } = usePermissions();
  const canManage = can('SUCCESSION');

  const [plans, setPlans] = useState<SuccessionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  // Detail modal
  const [detailPlan, setDetailPlan] = useState<SuccessionPlan | null>(null);

  // Create plan
  const [showCreate, setShowCreate] = useState(false);
  const [fTitle, setFTitle] = useState('');
  const [fDept, setFDept] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fRisk, setFRisk] = useState('MEDIUM');
  const [submitting, setSubmitting] = useState(false);

  // Add candidate
  const [showCandidate, setShowCandidate] = useState(false);
  const [candPlanId, _setCandPlanId] = useState('');
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

const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fTitle) return;
    setSubmitting(true);
    try {
      await SuccessionAPI.createPlan({ positionTitle: fTitle, department: fDept || undefined, description: fDesc || undefined, riskLevel: fRisk });
      showToast('Plan created', 'success');
      setShowCreate(false); setFTitle(''); setFDept(''); setFDesc(''); setFRisk('MEDIUM');
      loadPlans();
    } catch (err: any) { showToast(err.message || 'Failed', 'error'); }
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
      loadPlans();
      // refresh detail
      if (detailPlan?.id === candPlanId) {
        const res = await SuccessionAPI.getPlans();
        const updated = (res.data.data || []).find((p: SuccessionPlan) => p.id === candPlanId);
        if (updated) setDetailPlan(updated);
      }
    } catch (err: any) { showToast(err.message || 'Failed', 'error'); }
    finally { setSubmitting(false); }
  };

  const handleFill = async (id: string) => {
    setActionLoading('fill-' + id);
    try { await SuccessionAPI.updatePlan(id, { status: 'FILLED' }); showToast('Marked as filled', 'success'); loadPlans(); setDetailPlan(null); }
    catch (err: any) { showToast(err.message || 'Failed', 'error'); }
    finally { setActionLoading(''); }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Succession Planning</h1>
          <p className="text-muted-foreground font-medium text-sm">Identify and develop candidates for key positions</p>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(true)} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
            <Plus size={18} /> New Plan
          </button>
        )}
      </header>

      {/* Table */}
      <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
        {loading ? <SkeletonTable headers={["", "", "", "", ""]} rows={6} /> : plans.length === 0 ? (
          <EmptyState variant="no-data" icon={TrendingUp} title="No succession plans" description="Create a plan for key positions in your organization."
            action={canManage ? { label: 'New Plan', onClick: () => setShowCreate(true) } : undefined} />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted border-b border-border">
              <tr>
                <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Position</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Department</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Risk</th>
                <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Candidates</th>
                <th className="px-5 py-4 text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plans.map(p => (
                <tr key={p.id} className="hover:bg-muted/70 transition-colors">
                  <td className="px-5 py-4 font-medium text-navy">{p.positionTitle}</td>
                  <td className="px-5 py-4 text-muted-foreground">{p.department || '—'}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-5 py-4">
                    {p.riskLevel && (
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${RISK_COLORS[p.riskLevel]}`}>
                        {p.riskLevel}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">{p._count?.candidates ?? 0}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setDetailPlan(p)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-navy transition-colors" title="View candidates">
                        <Edit size={15} />
                      </button>
                      {canManage && p.status === 'ACTIVE' && (
                        <button onClick={() => handleFill(p.id)} disabled={!!actionLoading}
                          className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 transition-colors">
                          Mark Filled
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

      {/* Create Plan modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="modal-title-succession" className="bg-primary rounded-2xl shadow-xl w-full max-w-md flex flex-col" onKeyDown={(e) => { if (e.key === 'Escape') setShowCreate(false); }} tabIndex={-1}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 id="modal-title-succession" className="text-lg font-bold text-navy">New Succession Plan</h2>
              <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Position Title *</span>
                <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={fTitle} onChange={e => setFTitle(e.target.value)} required placeholder="e.g. Chief Technology Officer" />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Department</span>
                  <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={fDept} onChange={e => setFDept(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Risk Level</span>
                  <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={fRisk} onChange={e => setFRisk(e.target.value)}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</span>
                <textarea className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green min-h-[60px]"
                  value={fDesc} onChange={e => setFDesc(e.target.value)} />
              </label>
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={(e) => { handleCreate(e); }} disabled={submitting} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">

                {submitting ? 'Creating...' : 'Create Plan'}

              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Candidate Modal */}
      {showCandidate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowCandidate(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="modal-title-candidate" className="bg-primary rounded-2xl shadow-xl w-full max-w-md flex flex-col" onKeyDown={(e) => { if (e.key === 'Escape') setShowCandidate(false); }} tabIndex={-1}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 id="modal-title-candidate" className="text-lg font-bold text-navy">Add Candidate</h2>
              <button onClick={() => setShowCandidate(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleAddCandidate} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee *</span>
                <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={cEmp} onChange={e => setCEmp(e.target.value)} required>
                  <option value="">Select employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Readiness</span>
                  <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={cReadiness} onChange={e => setCReadiness(e.target.value)}>
                    <option value="READY_NOW">Ready Now</option>
                    <option value="READY_1_2_YEARS">1-2 Years</option>
                    <option value="READY_3_5_YEARS">3-5 Years</option>
                    <option value="LONG_TERM">Long Term</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Rating (1-5)</span>
                  <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={cRating} onChange={e => setCRating(parseInt(e.target.value))}>
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Strengths</span>
                <textarea className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green min-h-[50px]"
                  value={cStrengths} onChange={e => setCStrengths(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Areas for Growth</span>
                <textarea className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green min-h-[50px]"
                  value={cGrowth} onChange={e => setCGrowth(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Notes</span>
                <textarea className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green min-h-[50px]"
                  value={cNotes} onChange={e => setCNotes(e.target.value)} />
              </label>
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowCandidate(false)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={(e) => { handleAddCandidate(e); }} disabled={submitting} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
                <Plus size={16} /> {submitting ? 'Adding...' : 'Add Candidate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Succession;
