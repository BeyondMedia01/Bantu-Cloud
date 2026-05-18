import React, { useEffect, useState } from 'react';
import { GraduationCap, Plus, X, Users, Award, ChevronDown } from 'lucide-react';
import { TrainingAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import SkeletonTable from '../components/common/SkeletonTable';
import { EmptyState } from '@/components/ui/empty-state';
import { Dropdown } from '@/components/ui/dropdown';
import type { TrainingCourse, TrainingEnrollment, EnrollmentStatus } from '../types/domain';

const COURSE_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  COMPLETED: 'bg-blue-50 text-blue-700',
  CANCELLED: 'bg-red-50 text-red-700',
};
const ENR_STATUS_COLORS: Record<string, string> = {
  ENROLLED: 'bg-blue-50 text-blue-700',
  IN_PROGRESS: 'bg-amber-50 text-amber-700',
  COMPLETED: 'bg-emerald-50 text-emerald-700',
  PASSED: 'bg-emerald-50 text-emerald-700',
  FAILED: 'bg-red-50 text-red-700',
  CANCELLED: 'bg-muted text-muted-foreground',
};
const ENR_OPTS: EnrollmentStatus[] = ['ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'PASSED', 'FAILED', 'CANCELLED'];

const Training: React.FC = () => {
  const { showToast } = useToast();
  const { can } = usePermissions();
  const canManage = can('TRAINING');

  const [tab, setTab] = useState<'courses' | 'enrollments'>('courses');
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [allEnrollments, setAllEnrollments] = useState<TrainingEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [enrFilter, setEnrFilter] = useState('');
  const [actionLoading, setActionLoading] = useState('');

  // Create course
  const [showCreate, setShowCreate] = useState(false);
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fProvider, setFProvider] = useState('');
  const [fDuration, setFDuration] = useState('');
  const [fType, setFType] = useState('');
  const [fCost, setFCost] = useState('');
  const [fMax, setFMax] = useState('');
  const [fStart, setFStart] = useState('');
  const [fEnd, setFEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Enroll / Certificate modals
  const [showEnroll, setShowEnroll] = useState(false);
  const [showCert, setShowCert] = useState(false);
  const [enrollCourseId, setEnrollCourseId] = useState('');
  const [certCourseId, setCertCourseId] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmps, setSelectedEmps] = useState<string[]>([]);
  const [certEmp, setCertEmp] = useState('');
  const [certNo, setCertNo] = useState('');
  const [certExpiry, setCertExpiry] = useState('');

  const loadCourses = async () => {
    setLoading(true);
    try {
      const res = await TrainingAPI.getCourses({ ...(filter && { status: filter }) });
      setCourses(res.data.data || []);
    } catch {
      showToast('Failed to load courses', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAllEnrollments = async () => {
    setLoading(true);
    try {
      // Load enrollments across all courses
      const coursesRes = await TrainingAPI.getCourses({});
      const allCourses = coursesRes.data.data || [];
      const enrResults: TrainingEnrollment[] = [];
      await Promise.all(allCourses.slice(0, 20).map(async (c: TrainingCourse) => {
        try {
          const res = await TrainingAPI.getEnrollments(c.id);
          const enrs = (res.data.data || []).map((e: TrainingEnrollment) => ({ ...e, course: c }));
          enrResults.push(...enrs);
        } catch { /* ignore */ }
      }));
      const filtered = enrFilter ? enrResults.filter(e => e.status === enrFilter) : enrResults;
      setAllEnrollments(filtered);
    } catch {
      showToast('Failed to load enrollments', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'courses') loadCourses();
    else loadAllEnrollments();
  }, [tab, filter, enrFilter]);

  const loadEmployees = async () => {
    try { const res = await TrainingAPI.getEmployees(); setEmployees(res.data.data || []); } catch { /* ignore */ }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fTitle) return;
    setSubmitting(true);
    try {
      await TrainingAPI.createCourse({
        title: fTitle, description: fDesc || undefined, provider: fProvider || undefined,
        duration: fDuration || undefined, type: fType || undefined,
        cost: fCost ? parseFloat(fCost) : undefined, maxAttendees: fMax ? parseInt(fMax) : undefined,
        startDate: fStart || undefined, endDate: fEnd || undefined,
      });
      showToast('Course created', 'success');
      setShowCreate(false); resetForm(); loadCourses();
    } catch (err: any) { showToast(err.message || 'Failed', 'error'); }
    finally { setSubmitting(false); }
  };

  const resetForm = () => {
    setFTitle(''); setFDesc(''); setFProvider(''); setFDuration('');
    setFType(''); setFCost(''); setFMax(''); setFStart(''); setFEnd('');
  };

  const handlePublish = async (id: string) => {
    setActionLoading('pub-' + id);
    try { await TrainingAPI.updateCourse(id, { status: 'ACTIVE' }); showToast('Course activated', 'success'); loadCourses(); }
    catch (err: any) { showToast(err.message || 'Failed', 'error'); }
    finally { setActionLoading(''); }
  };

  const handleEnroll = async () => {
    if (!enrollCourseId || selectedEmps.length === 0) return;
    setActionLoading('enroll');
    try {
      await TrainingAPI.enrollEmployees(enrollCourseId, selectedEmps);
      showToast('Employees enrolled', 'success');
      setShowEnroll(false); setSelectedEmps([]);
      loadCourses();
      if (tab === 'enrollments') loadAllEnrollments();
    } catch (err: any) { showToast(err.message || 'Failed', 'error'); }
    finally { setActionLoading(''); }
  };

  const handleStatusChange = async (enrId: string, status: EnrollmentStatus) => {
    setActionLoading('enr-' + enrId);
    try {
      await TrainingAPI.updateEnrollment(enrId, { status });
      loadAllEnrollments();
    } catch (err: any) { showToast(err.message || 'Failed', 'error'); }
    finally { setActionLoading(''); }
  };

  const handleIssueCert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certCourseId || !certEmp) return;
    setActionLoading('cert');
    try {
      await TrainingAPI.issueCertificate(certCourseId, { employeeId: certEmp, certificateNo: certNo || undefined, expiryDate: certExpiry || undefined });
      showToast('Certificate issued', 'success');
      setShowCert(false); setCertEmp(''); setCertNo(''); setCertExpiry('');
    } catch (err: any) { showToast(err.message || 'Failed', 'error'); }
    finally { setActionLoading(''); }
  };

  const COURSE_STATUS_OPTS = ['', 'DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'];

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Training</h1>
          <p className="text-muted-foreground font-medium text-sm">Manage courses and track employee development</p>
        </div>
        {canManage && tab === 'courses' && (
          <button onClick={() => setShowCreate(true)} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
            <Plus size={18} /> New Course
          </button>
        )}
        {canManage && tab === 'enrollments' && (
          <button onClick={() => { setEnrollCourseId(''); setShowEnroll(true); loadEmployees(); }} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
            <Plus size={18} /> Enroll Employees
          </button>
        )}
      </header>

      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {[{ key: 'courses', label: 'Courses' }, { key: 'enrollments', label: 'Enrollments' }].map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key as 'courses' | 'enrollments')}
              className={`px-4 py-2.5 text-sm font-bold transition-colors border-b-2 -mb-px ${active ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-navy'}`}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Courses tab */}
      {tab === 'courses' && (
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
                    <span className="truncate">{filter || 'All Statuses'}</span>
                    <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
                sections={[{ items: COURSE_STATUS_OPTS.map(s => ({ label: s || 'All Statuses', onClick: () => setFilter(s) })) }]}
              />
            </div>
          </div>

          <div className="tbl-container">
            {loading ? <SkeletonTable headers={["", "", "", "", "", ""]} rows={6} /> : courses.length === 0 ? (
              <EmptyState variant="no-data" icon={GraduationCap} title="No courses yet" description="Create your first training course."
                action={canManage ? { label: 'New Course', onClick: () => setShowCreate(true) } : undefined} />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="tbl-head-row">
                    <th className="tbl-th">Course</th>
                    <th className="tbl-th">Provider</th>
                    <th className="tbl-th">Status</th>
                    <th className="tbl-th">Enrolled</th>
                    <th className="tbl-th">Certified</th>
                    <th className="tbl-th">Cost</th>
                    <th className="tbl-th text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {courses.map(c => (
                    <tr key={c.id} className="tbl-row">
                      <td className="tbl-td">
                        <p className="font-medium text-navy">{c.title}</p>
                        {c.type && <p className="text-xs text-muted-foreground">{c.type}{c.duration ? ` · ${c.duration}` : ''}</p>}
                      </td>
                      <td className="tbl-td">{c.provider || '—'}</td>
                      <td className="tbl-td">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${COURSE_STATUS_COLORS[c.status]}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="tbl-td">{c._count?.enrollments ?? 0}</td>
                      <td className="tbl-td">{c._count?.certificates ?? 0}</td>
                      <td className="tbl-td">{c.cost ? `$${c.cost}` : '—'}</td>
                      <td className="tbl-td text-right">
                        <div className="flex items-center justify-end gap-1">
                          {canManage && c.status === 'DRAFT' && (
                            <button onClick={() => handlePublish(c.id)} disabled={!!actionLoading}
                              className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-bold hover:bg-emerald-100 transition-colors">
                              Activate
                            </button>
                          )}
                          {canManage && c.status !== 'CANCELLED' && (
                            <>
                              <button onClick={() => { setEnrollCourseId(c.id); setShowEnroll(true); loadEmployees(); }}
                                className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-navy transition-colors" title="Enroll employees">
                                <Users size={15} />
                              </button>
                              <button onClick={() => { setCertCourseId(c.id); setShowCert(true); loadEmployees(); }}
                                className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-emerald-600 transition-colors" title="Issue certificate">
                                <Award size={15} />
                              </button>
                            </>
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

      {/* Enrollments tab */}
      {tab === 'enrollments' && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Filters</p>
              {enrFilter && <button onClick={() => setEnrFilter('')} className="text-xs font-bold text-muted-foreground hover:text-red-500 px-3 py-1.5 rounded-full border border-border hover:border-red-200 hover:bg-red-50 transition-colors">× Clear filters</button>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Dropdown
                trigger={(isOpen) => (
                  <button className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium shadow-sm flex items-center justify-between hover:border-accent-green transition-colors">
                    <span className="truncate">{enrFilter || 'All Statuses'}</span>
                    <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
                sections={[{ items: [{ label: 'All Statuses', onClick: () => setEnrFilter('') }, ...ENR_OPTS.map(s => ({ label: s, onClick: () => setEnrFilter(s) }))] }]}
              />
            </div>
          </div>

          <div className="tbl-container">
            {loading ? <SkeletonTable headers={["", "", "", "", ""]} rows={6} /> : allEnrollments.length === 0 ? (
              <EmptyState variant="no-data" icon={Users} title="No enrollments" description="Enroll employees in courses to see them here." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="tbl-head-row">
                    <th className="tbl-th">Employee</th>
                    <th className="tbl-th">Course</th>
                    <th className="tbl-th">Status</th>
                    <th className="tbl-th">Score</th>
                    {canManage && <th className="tbl-th text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allEnrollments.map(e => (
                    <tr key={e.id} className="tbl-row">
                      <td className="tbl-td font-medium text-navy">
                        {e.employee?.firstName} {e.employee?.lastName}
                      </td>
                      <td className="tbl-td">{e.course?.title || '—'}</td>
                      <td className="tbl-td">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${ENR_STATUS_COLORS[e.status]}`}>
                          {e.status}
                        </span>
                      </td>
                      <td className="tbl-td">{e.score !== null && e.score !== undefined ? e.score : '—'}</td>
                      {canManage && (
                        <td className="tbl-td text-right">
                          <select className="text-xs border border-border rounded-lg px-2 py-1 bg-primary text-muted-foreground"
                            value="" onChange={o => { const v = o.target.value as EnrollmentStatus; if (v) handleStatusChange(e.id, v); }}>
                            <option value="">Change status...</option>
                            {ENR_OPTS.filter(s => s !== e.status).map(s => <option key={s} value={s}>{s}</option>)}
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

      {/* Create Course modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="modal-title-course" className="bg-primary rounded-2xl shadow-xl w-full max-w-lg flex flex-col" onKeyDown={(e) => { if (e.key === 'Escape') setShowCreate(false); }} tabIndex={-1}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 id="modal-title-course" className="text-lg font-bold text-navy">New Course</h2>
              <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Title *</span>
                <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={fTitle} onChange={e => setFTitle(e.target.value)} required />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Provider</span>
                  <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={fProvider} onChange={e => setFProvider(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Type</span>
                  <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={fType} onChange={e => setFType(e.target.value)}>
                    <option value="">Select</option>
                    <option value="ONLINE">Online</option>
                    <option value="CLASSROOM">Classroom</option>
                    <option value="WORKSHOP">Workshop</option>
                    <option value="SEMINAR">Seminar</option>
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Duration</span>
                  <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={fDuration} onChange={e => setFDuration(e.target.value)} placeholder="e.g. 2 days" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Cost (USD)</span>
                  <input type="number" step="0.01" min="0" className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={fCost} onChange={e => setFCost(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Max Attendees</span>
                  <input type="number" min="0" className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={fMax} onChange={e => setFMax(e.target.value)} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Start Date</span>
                  <input type="date" className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={fStart} onChange={e => setFStart(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">End Date</span>
                  <input type="date" className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={fEnd} onChange={e => setFEnd(e.target.value)} />
                </label>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Description</span>
                <textarea className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green min-h-[70px]"
                  value={fDesc} onChange={e => setFDesc(e.target.value)} />
              </label>
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={(e) => { handleCreate(e); }} disabled={submitting} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
                <Plus size={16} /> {submitting ? 'Creating...' : 'Create Course'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enroll modal */}
      {showEnroll && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowEnroll(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="modal-title-enroll" className="bg-primary rounded-2xl shadow-xl w-full max-w-md flex flex-col" onKeyDown={(e) => { if (e.key === 'Escape') setShowEnroll(false); }} tabIndex={-1}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 id="modal-title-enroll" className="text-lg font-bold text-navy">Enroll Employees</h2>
              <button onClick={() => setShowEnroll(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <div className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
              {!enrollCourseId && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Course *</span>
                  <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={enrollCourseId} onChange={e => setEnrollCourseId(e.target.value)}>
                    <option value="">Select course</option>
                    {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </label>
              )}
              <div className="max-h-60 overflow-y-auto flex flex-col gap-1">
                {employees.map(e => (
                  <label key={e.id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-muted cursor-pointer">
                    <input type="checkbox" checked={selectedEmps.includes(e.id)}
                      onChange={() => setSelectedEmps(prev => prev.includes(e.id) ? prev.filter(x => x !== e.id) : [...prev, e.id])} />
                    <span className="text-sm text-navy">{e.firstName} {e.lastName} ({e.employeeCode})</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowEnroll(false)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleEnroll} disabled={selectedEmps.length === 0 || !!actionLoading || !enrollCourseId}
                className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
                <Users size={16} /> Enroll {selectedEmps.length > 0 ? `(${selectedEmps.length})` : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certificate modal */}
      {showCert && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowCert(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="modal-title-cert" className="bg-primary rounded-2xl shadow-xl w-full max-w-md flex flex-col" onKeyDown={(e) => { if (e.key === 'Escape') setShowCert(false); }} tabIndex={-1}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 id="modal-title-cert" className="text-lg font-bold text-navy">Issue Certificate</h2>
              <button onClick={() => setShowCert(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleIssueCert} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee *</span>
                <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={certEmp} onChange={e => setCertEmp(e.target.value)} required>
                  <option value="">Select employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Certificate Number</span>
                <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={certNo} onChange={e => setCertNo(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Expiry Date</span>
                <input type="date" className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={certExpiry} onChange={e => setCertExpiry(e.target.value)} />
              </label>
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowCert(false)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={(e) => { handleIssueCert(e); }} disabled={!!actionLoading}
                className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
                <Award size={16} /> Issue Certificate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Training;
