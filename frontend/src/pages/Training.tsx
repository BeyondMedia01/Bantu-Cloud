import React, { useEffect, useState } from 'react';
import { GraduationCap, Plus, X, Users, Award, CheckCircle2, Circle, Search } from 'lucide-react';
import { TrainingAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import SkeletonTable from '../components/common/SkeletonTable';
import type { TrainingCourse, TrainingEnrollment, TrainingCertificate, EnrollmentStatus } from '../types/domain';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  ACTIVE: 'bg-green-50 text-green-700 border-green-200',
  COMPLETED: 'bg-blue-50 text-blue-700 border-blue-200',
  CANCELLED: 'bg-red-50 text-red-600 border-red-200',
};
const ENR_STATUS_COLORS: Record<string, string> = {
  ENROLLED: 'bg-blue-50 text-blue-700 border-blue-200',
  IN_PROGRESS: 'bg-amber-50 text-amber-700 border-amber-200',
  COMPLETED: 'bg-teal-50 text-teal-700 border-teal-200',
  PASSED: 'bg-green-50 text-green-700 border-green-200',
  FAILED: 'bg-red-50 text-red-600 border-red-200',
  CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
};
const ENR_OPTS: EnrollmentStatus[] = ['ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'PASSED', 'FAILED', 'CANCELLED'];
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Training: React.FC = () => {
  const { showToast } = useToast();
  const { can } = usePermissions();
  const canManage = can('manage_employees');

  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [enrollments, setEnrollments] = useState<Record<string, TrainingEnrollment[]>>({});
  const [certs, setCerts] = useState<Record<string, TrainingCertificate[]>>({});
  const [sectionLoading, setSectionLoading] = useState<string | null>(null);
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

  useEffect(() => { loadCourses(); }, [filter]);

  const loadEnrollments = async (id: string) => {
    setSectionLoading('enr-' + id);
    try {
      const [eRes, cRes] = await Promise.all([TrainingAPI.getEnrollments(id), TrainingAPI.getCertificates(id)]);
      setEnrollments(prev => ({ ...prev, [id]: eRes.data.data || [] }));
      setCerts(prev => ({ ...prev, [id]: cRes.data.data || [] }));
    } catch { showToast('Failed to load enrollments', 'error'); }
    finally { setSectionLoading(null); }
  };

  const loadEmployees = async () => {
    try { const res = await TrainingAPI.getEmployees(); setEmployees(res.data.data || []); } catch { /* ignore */ }
  };

  const toggleExpand = (id: string) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!enrollments[id]) loadEnrollments(id);
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
    } catch (err: any) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setSubmitting(false); }
  };

  const resetForm = () => {
    setFTitle(''); setFDesc(''); setFProvider(''); setFDuration('');
    setFType(''); setFCost(''); setFMax(''); setFStart(''); setFEnd('');
  };

  const handlePublish = async (id: string) => {
    setActionLoading('pub-' + id);
    try { await TrainingAPI.updateCourse(id, { status: 'ACTIVE' }); showToast('Course activated', 'success'); loadCourses(); }
    catch (err: any) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setActionLoading(''); }
  };

  const handleEnroll = async () => {
    if (!enrollCourseId || selectedEmps.length === 0) return;
    setActionLoading('enroll');
    try {
      await TrainingAPI.enrollEmployees(enrollCourseId, selectedEmps);
      showToast('Employees enrolled', 'success');
      setShowEnroll(false); setSelectedEmps([]);
      if (expandedId) loadEnrollments(expandedId);
      loadCourses();
    } catch (err: any) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setActionLoading(''); }
  };

  const handleStatusChange = async (enrId: string, status: EnrollmentStatus) => {
    setActionLoading('enr-' + enrId);
    try {
      await TrainingAPI.updateEnrollment(enrId, { status });
      if (expandedId) loadEnrollments(expandedId);
      loadCourses();
    } catch (err: any) { showToast(err.response?.data?.message || 'Failed', 'error'); }
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
      if (expandedId) loadEnrollments(expandedId);
      loadCourses();
    } catch (err: any) { showToast(err.response?.data?.message || 'Failed', 'error'); }
    finally { setActionLoading(''); }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <GraduationCap size={28} className="text-navy" />
          <h1 className="text-2xl font-semibold text-navy">Training</h1>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(true)} className="btn btn-primary flex items-center gap-2">
            <Plus size={18} /> New Course
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto">
        {['', 'DRAFT', 'ACTIVE', 'COMPLETED', 'CANCELLED'].map(s => (
          <button key={s || 'all'} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-lg border whitespace-nowrap transition-colors ${
              filter === s ? 'bg-navy text-white border-navy' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >{s || 'All'}</button>
        ))}
      </div>

      {loading ? <SkeletonTable rows={5} cols={5} /> : (
        <div className="space-y-3">
          {courses.length === 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-500">
              <GraduationCap size={48} className="mx-auto mb-3 text-slate-300" />
              <p className="text-lg font-medium text-slate-400 mb-1">No courses yet</p>
              <p>Create your first training course.</p>
            </div>
          )}

          {courses.map(c => (
            <div key={c.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div className="p-4 flex items-start justify-between cursor-pointer hover:bg-slate-50"
                onClick={() => toggleExpand(c.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-slate-900 truncate">{c.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_COLORS[c.status] || ''}`}>{c.status}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
                    {c.provider && <span>{c.provider}</span>}
                    {c.type && <span>{c.type}</span>}
                    {c.duration && <span>{c.duration}</span>}
                    {c._count && <span><Users size={14} className="inline mr-1" />{c._count.enrollments} enrolled</span>}
                    {c._count && c._count.certificates > 0 && <span><Award size={14} className="inline mr-1" />{c._count.certificates} certified</span>}
                    {c.cost && <span>${c.cost}</span>}
                    <span>Created {fmtDate(c.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0" onClick={e => e.stopPropagation()}>
                  {canManage && c.status === 'DRAFT' && (
                    <button onClick={() => handlePublish(c.id)} className="btn btn-sm btn-success">Activate</button>
                  )}
                </div>
              </div>

              {expandedId === c.id && (
                <div className="border-t border-slate-100">
                  {/* Quick actions */}
                  {canManage && c.status !== 'CANCELLED' && (
                    <div className="bg-slate-50 px-4 py-2 flex items-center gap-2 border-b border-slate-100">
                      <button onClick={() => { setEnrollCourseId(c.id); setShowEnroll(true); loadEmployees(); }}
                        className="btn btn-sm text-blue-600 border border-blue-200 bg-white flex items-center gap-1"
                      ><Users size={14} /> Enroll Employees</button>
                      <button onClick={() => { setCertCourseId(c.id); setShowCert(true); loadEmployees(); }}
                        className="btn btn-sm text-green-600 border border-green-200 bg-white flex items-center gap-1"
                      ><Award size={14} /> Issue Certificate</button>
                    </div>
                  )}

                  <div className="p-4 space-y-4">
                    {/* Enrollments */}
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 mb-2">Enrollments ({enrollments[c.id]?.length || 0})</h4>
                      {sectionLoading === 'enr-' + c.id ? <SkeletonTable rows={3} cols={3} /> : (
                        !enrollments[c.id] || enrollments[c.id].length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-3">No enrollments yet</p>
                        ) : (
                          <div className="space-y-1.5">
                            {enrollments[c.id].map(e => (
                              <div key={e.id} className="flex items-center justify-between bg-slate-50 rounded px-3 py-2">
                                <div>
                                  <span className="text-sm text-slate-800">{e.employee?.firstName} {e.employee?.lastName}</span>
                                  <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full border ${ENR_STATUS_COLORS[e.status] || ''}`}>{e.status}</span>
                                  {e.score !== null && e.score !== undefined && <span className="ml-2 text-xs text-slate-500">Score: {e.score}</span>}
                                </div>
                                {canManage && (
                                  <select className="text-xs border border-slate-200 rounded px-1.5 py-1 bg-white"
                                    value="" onChange={o => { const v = o.target.value as EnrollmentStatus; if (v) handleStatusChange(e.id, v); }}
                                  >
                                    <option value="">Change status...</option>
                                    {ENR_OPTS.filter(s => s !== e.status).map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                )}
                              </div>
                            ))}
                          </div>
                        )
                      )}
                    </div>

                    {/* Certificates */}
                    <div>
                      <h4 className="text-sm font-medium text-slate-700 mb-2">Certificates ({certs[c.id]?.length || 0})</h4>
                      {certs[c.id] && certs[c.id].length > 0 && (
                        <div className="space-y-1">
                          {certs[c.id].map(cert => (
                            <div key={cert.id} className="flex items-center gap-2 text-sm text-slate-600 bg-green-50 rounded px-3 py-1.5">
                              <Award size={14} className="text-green-600" />
                              <span>{cert.employee?.firstName} {cert.employee?.lastName}</span>
                              {cert.certificateNo && <span className="text-xs text-slate-400">#{cert.certificateNo}</span>}
                              <span className="text-xs text-slate-400 ml-auto">Issued {fmtDate(cert.issuedAt)}</span>
                              {cert.expiryDate && <span className="text-xs text-slate-400">Expires {fmtDate(cert.expiryDate)}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Course modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">New Course</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                <input className="input" value={fTitle} onChange={e => setFTitle(e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Provider</label>
                  <input className="input" value={fProvider} onChange={e => setFProvider(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                  <select className="input" value={fType} onChange={e => setFType(e.target.value)}>
                    <option value="">Select</option>
                    <option value="ONLINE">Online</option>
                    <option value="CLASSROOM">Classroom</option>
                    <option value="WORKSHOP">Workshop</option>
                    <option value="SEMINAR">Seminar</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Duration</label>
                  <input className="input" value={fDuration} onChange={e => setFDuration(e.target.value)} placeholder="e.g. 2 days" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cost (USD)</label>
                  <input type="number" step="0.01" min="0" className="input" value={fCost} onChange={e => setFCost(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Max Attendees</label>
                  <input type="number" min="0" className="input" value={fMax} onChange={e => setFMax(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Start Date</label>
                  <input type="date" className="input" value={fStart} onChange={e => setFStart(e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">End Date</label>
                  <input type="date" className="input" value={fEnd} onChange={e => setFEnd(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea className="input min-h-[80px]" value={fDesc} onChange={e => setFDesc(e.target.value)} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">{submitting ? 'Creating...' : 'Create Course'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enroll modal */}
      {showEnroll && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowEnroll(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">Enroll Employees</h2>
              <button onClick={() => setShowEnroll(false)} className="text-slate-400"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="max-h-60 overflow-y-auto space-y-1.5">
                {employees.map(e => (
                  <label key={e.id} className="flex items-center gap-2 p-2 rounded hover:bg-slate-50 cursor-pointer">
                    <input type="checkbox" checked={selectedEmps.includes(e.id)}
                      onChange={() => setSelectedEmps(prev => prev.includes(e.id) ? prev.filter(x => x !== e.id) : [...prev, e.id])}
                    />
                    <span className="text-sm">{e.firstName} {e.lastName} ({e.employeeCode})</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowEnroll(false)} className="btn btn-ghost">Cancel</button>
                <button onClick={handleEnroll} disabled={selectedEmps.length === 0 || !!actionLoading} className="btn btn-primary">
                  Enroll {selectedEmps.length > 0 ? `(${selectedEmps.length})` : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Certificate modal */}
      {showCert && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCert(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">Issue Certificate</h2>
              <button onClick={() => setShowCert(false)} className="text-slate-400"><X size={20} /></button>
            </div>
            <form onSubmit={handleIssueCert} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Employee *</label>
                <select className="input" value={certEmp} onChange={e => setCertEmp(e.target.value)} required>
                  <option value="">Select employee</option>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Certificate Number</label>
                <input className="input" value={certNo} onChange={e => setCertNo(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Expiry Date</label>
                <input type="date" className="input" value={certExpiry} onChange={e => setCertExpiry(e.target.value)} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCert(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={!!actionLoading} className="btn btn-primary">Issue Certificate</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Training;
