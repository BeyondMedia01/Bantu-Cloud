import React, { useEffect, useState, useRef } from 'react';
import {
  UserPlus, Plus, Send, X, Briefcase, Upload, FileText,
  Brain, Star, ChevronDown, Trash,
} from 'lucide-react';
import { RecruitmentAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import SkeletonTable from '../components/common/SkeletonTable';
import ConfirmModal from '../components/common/ConfirmModal';
import { EmptyState } from '@/components/ui/empty-state';
import { Dropdown } from '@/components/ui/dropdown';
import { StatusBadge } from '@/components/common/StatusBadge';
import type {
  JobPosting, JobApplication, JobStatus, ApplicationStatus,
  ScreeningSummary,
} from '../types/domain';

const POSTING_STATUS_OPTS: JobStatus[] = ['DRAFT', 'PUBLISHED', 'CLOSED', 'FILLED'];
const APP_STATUS_OPTS: ApplicationStatus[] = ['NEW', 'SCREENING', 'INTERVIEWING', 'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN'];

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Recruitment: React.FC = () => {
  const { showToast } = useToast();
  const { can } = usePermissions();

  const [tab, setTab] = useState<'postings' | 'applications'>('postings');
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [allApplications, setAllApplications] = useState<JobApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [appStatusFilter, setAppStatusFilter] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Screening state per posting
  const [screeningSummary, setScreeningSummary] = useState<Record<string, ScreeningSummary>>({});
  const [screenLoading, setScreenLoading] = useState<string | null>(null);
  const [screenThreshold] = useState(50);

  // Parsing state
  const [parseLoading, setParseLoading] = useState<string | null>(null);
  const [resumeUploading, setResumeUploading] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Create posting modal
  const [showCreate, setShowCreate] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formDept, setFormDept] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formType, setFormType] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formReq, setFormReq] = useState('');
  const [formSalary, setFormSalary] = useState('');
  const [formCloses, setFormCloses] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Add application modal
  const [showAddApp, setShowAddApp] = useState(false);
  const [addAppPostingId, setAddAppPostingId] = useState('');
  const [appName, setAppName] = useState('');
  const [appEmail, setAppEmail] = useState('');
  const [appPhone, setAppPhone] = useState('');
  const [appSource, setAppSource] = useState('');

  // Status change modal
  const [statusChangeTarget, setStatusChangeTarget] = useState<{ appId: string; toStatus: ApplicationStatus } | null>(null);
  const [changeNotes, setChangeNotes] = useState('');

  const loadPostings = async () => {
    setLoading(true);
    try {
      const res = await RecruitmentAPI.getPostings({ ...(statusFilter && { status: statusFilter }) });
      setPostings(res.data.data || []);
    } catch {
      showToast('Failed to load job postings', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAllApplications = async () => {
    setLoading(true);
    try {
      const res = await RecruitmentAPI.getApplications({ ...(appStatusFilter && { status: appStatusFilter }) });
      setAllApplications(res.data.data || []);
    } catch {
      showToast('Failed to load applications', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (tab === 'postings') loadPostings();
    else loadAllApplications();
  }, [tab, statusFilter, appStatusFilter]);

  const loadScreeningSummary = async (postingId: string) => {
    try {
      const res = await RecruitmentAPI.getScreeningSummary(postingId);
      setScreeningSummary(prev => ({ ...prev, [postingId]: res.data.data }));
    } catch { /* ignore */ }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle || !formDesc) return;
    setSubmitting(true);
    try {
      await RecruitmentAPI.createPosting({
        title: formTitle, department: formDept || undefined, location: formLocation || undefined,
        type: formType || undefined, description: formDesc, requirements: formReq || undefined,
        salaryRange: formSalary || undefined, closesAt: formCloses || undefined,
      });
      showToast('Job posting created', 'success');
      setShowCreate(false);
      resetForm();
      loadPostings();
    } catch (err: any) {
      showToast(err.message || 'Failed to create posting', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormTitle(''); setFormDept(''); setFormLocation(''); setFormType('');
    setFormDesc(''); setFormReq(''); setFormSalary(''); setFormCloses('');
  };

  const handlePublish = async (id: string) => {
    setActionLoading('pub-' + id);
    try {
      await RecruitmentAPI.updatePosting(id, { status: 'PUBLISHED' });
      showToast('Job posting published', 'success');
      loadPostings();
    } catch (err: any) {
      showToast(err.message || 'Failed to publish', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleClose = async (id: string) => {
    setActionLoading('close-' + id);
    try {
      await RecruitmentAPI.updatePosting(id, { status: 'CLOSED' });
      showToast('Job posting closed', 'success');
      loadPostings();
    } catch (err: any) {
      showToast(err.message || 'Failed to close', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionLoading('del-' + deleteTarget);
    try {
      await RecruitmentAPI.deletePosting(deleteTarget);
      showToast('Job posting deleted', 'success');
      setDeleteTarget(null);
      loadPostings();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleAddApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addAppPostingId || !appName || !appEmail) return;
    setSubmitting(true);
    try {
      await RecruitmentAPI.createApplication({
        jobPostingId: addAppPostingId, candidateName: appName, candidateEmail: appEmail,
        candidatePhone: appPhone || undefined, source: appSource || undefined,
      });
      showToast('Application added', 'success');
      setShowAddApp(false);
      setAddAppPostingId(''); setAppName(''); setAppEmail(''); setAppPhone(''); setAppSource('');
      loadPostings();
      loadAllApplications();
    } catch (err: any) {
      showToast(err.message || 'Failed to add application', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async () => {
    if (!statusChangeTarget) return;
    setActionLoading('status-' + statusChangeTarget.appId);
    try {
      await RecruitmentAPI.updateApplicationStatus(statusChangeTarget.appId, statusChangeTarget.toStatus, changeNotes || undefined);
      showToast(`Status updated to ${statusChangeTarget.toStatus}`, 'success');
      setStatusChangeTarget(null);
      setChangeNotes('');
      loadAllApplications();
      loadPostings();
    } catch (err: any) {
      showToast(err.message || 'Failed to update status', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleResumeUpload = async (appId: string, file: File) => {
    setResumeUploading(appId);
    try {
      await RecruitmentAPI.uploadResume(appId, file);
      showToast('Resume uploaded', 'success');
      loadAllApplications();
    } catch (err: any) {
      showToast(err.message || 'Upload failed', 'error');
    } finally {
      setResumeUploading(null);
    }
  };

  const handleParseResume = async (appId: string) => {
    setParseLoading(appId);
    try {
      const res = await RecruitmentAPI.parseResume(appId);
      showToast(`Parsed: ${res.data.data.skills.length} skills, ${res.data.data.totalYears}y experience`, 'success');
      loadAllApplications();
    } catch (err: any) {
      showToast(err.message || 'Parse failed', 'error');
    } finally {
      setParseLoading(null);
    }
  };

  const handleScreenPosting = async (postingId: string) => {
    setScreenLoading(postingId);
    try {
      const res = await RecruitmentAPI.screenPosting(postingId, screenThreshold);
      showToast(`Screened ${res.data.data.total} candidates — ${res.data.data.shortlisted} shortlisted (≥${res.data.data.threshold}%)`, 'success');
      loadScreeningSummary(postingId);
      loadAllApplications();
    } catch (err: any) {
      showToast(err.message || 'Screening failed', 'error');
    } finally {
      setScreenLoading(null);
    }
  };

  const handleToggleShortlist = async (appId: string, current: boolean) => {
    setActionLoading('sl-' + appId);
    try {
      await RecruitmentAPI.toggleShortlist(appId, !current);
      loadAllApplications();
    } catch (err: any) {
      showToast(err.message || 'Failed to update', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const hasStatusFilter = !!statusFilter;
  const hasAppFilter = !!appStatusFilter;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy">Recruitment</h1>
          <p className="text-muted-foreground font-medium text-sm">Manage job postings and track candidates</p>
        </div>
        {can('RECRUITMENT', 'EDIT') && tab === 'postings' && (
          <button onClick={() => setShowCreate(true)} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
            <Plus size={18} /> New Posting
          </button>
        )}
        {can('RECRUITMENT', 'EDIT') && tab === 'applications' && (
          <button onClick={() => setShowAddApp(true)} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
            <Plus size={18} /> Add Application
          </button>
        )}
      </header>

      {/* Sub-navigation tabs */}
      <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
        {[{ key: 'postings', label: 'Job Postings' }, { key: 'applications', label: 'Applications' }].map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key as 'postings' | 'applications')}
              className={`px-4 py-2.5 text-sm font-bold transition-colors border-b-2 -mb-px ${active ? 'border-navy text-navy' : 'border-transparent text-muted-foreground hover:text-navy'}`}>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Postings tab */}
      {tab === 'postings' && (
        <>
          {/* Filters */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Filters</p>
              {hasStatusFilter && <button onClick={() => setStatusFilter('')} className="text-xs font-bold text-muted-foreground hover:text-red-500 px-3 py-1.5 rounded-full border border-border hover:border-red-200 hover:bg-red-50 transition-colors">× Clear filters</button>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Dropdown
                trigger={(isOpen) => (
                  <button className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium shadow-sm flex items-center justify-between hover:border-accent-green transition-colors">
                    <span className="truncate">{statusFilter || 'All Statuses'}</span>
                    <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
                sections={[{ items: [{ label: 'All Statuses', onClick: () => setStatusFilter('') }, ...POSTING_STATUS_OPTS.map(s => ({ label: s, onClick: () => setStatusFilter(s) }))] }]}
              />
            </div>
          </div>

          {/* Table */}
          <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
            {loading ? <SkeletonTable headers={["", "", "", "", ""]} rows={6} /> : postings.length === 0 ? (
              <EmptyState variant="no-data" icon={Briefcase} title="No job postings" description="Create your first posting to start recruiting."
                action={can('RECRUITMENT', 'EDIT') ? { label: 'New Posting', onClick: () => setShowCreate(true) } : undefined} />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Title</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Department</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Applications</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Closes</th>
                    <th className="px-5 py-4 text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {postings.map(p => (
                    <tr key={p.id} className="hover:bg-muted/70 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-medium text-navy">{p.title}</p>
                        {p.location && <p className="text-xs text-muted-foreground">{p.location}{p.type ? ` · ${p.type}` : ''}</p>}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{p.department || '—'}</td>
                      <td className="px-5 py-4">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{p._count?.applications ?? 0}</td>
                      <td className="px-5 py-4 text-muted-foreground">{p.closesAt ? fmtDate(p.closesAt) : '—'}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {can('RECRUITMENT', 'EDIT') && p.status === 'DRAFT' && (
                            <button onClick={() => handlePublish(p.id)} disabled={!!actionLoading}
                              className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-emerald-600 transition-colors" title="Publish">
                              <Send size={15} />
                            </button>
                          )}
                          {can('RECRUITMENT', 'EDIT') && p.status === 'PUBLISHED' && (
                            <button onClick={() => handleClose(p.id)} disabled={!!actionLoading}
                              className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-navy transition-colors" title="Close">
                              <X size={15} />
                            </button>
                          )}
                          {can('RECRUITMENT', 'EDIT') && p.status === 'PUBLISHED' && screeningSummary[p.id] !== undefined ? null : can('RECRUITMENT', 'EDIT') && (
                            <button onClick={() => handleScreenPosting(p.id)} disabled={screenLoading === p.id}
                              className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-purple-600 transition-colors" title={`AI Screen (threshold: ${screenThreshold}%)`}>
                              <Brain size={15} />
                            </button>
                          )}
                          {can('RECRUITMENT', 'EDIT') && (
                            <button onClick={() => setDeleteTarget(p.id)} disabled={!!actionLoading}
                              className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-red-500 transition-colors">
                              <Trash size={15} />
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

      {/* Applications tab */}
      {tab === 'applications' && (
        <>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Filters</p>
              {hasAppFilter && <button onClick={() => setAppStatusFilter('')} className="text-xs font-bold text-muted-foreground hover:text-red-500 px-3 py-1.5 rounded-full border border-border hover:border-red-200 hover:bg-red-50 transition-colors">× Clear filters</button>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <Dropdown
                trigger={(isOpen) => (
                  <button className="w-full bg-primary border border-border rounded-2xl px-4 py-3 text-sm font-medium shadow-sm flex items-center justify-between hover:border-accent-green transition-colors">
                    <span className="truncate">{appStatusFilter || 'All Statuses'}</span>
                    <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </button>
                )}
                sections={[{ items: [{ label: 'All Statuses', onClick: () => setAppStatusFilter('') }, ...APP_STATUS_OPTS.map(s => ({ label: s, onClick: () => setAppStatusFilter(s) }))] }]}
              />
            </div>
          </div>

          <div className="bg-primary rounded-2xl border border-border shadow-sm overflow-hidden">
            {loading ? <SkeletonTable headers={["", "", "", "", "", ""]} rows={6} /> : allApplications.length === 0 ? (
              <EmptyState variant="no-data" icon={UserPlus} title="No applications" description="Add applications to job postings to see them here."
                action={can('RECRUITMENT', 'EDIT') ? { label: 'Add Application', onClick: () => setShowAddApp(true) } : undefined} />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted border-b border-border">
                  <tr>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Candidate</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Job</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Score</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Source</th>
                    <th className="px-5 py-4 text-left text-xs font-bold text-muted-foreground uppercase tracking-wider">Date</th>
                    <th className="px-5 py-4 text-right text-xs font-bold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {allApplications.map(a => (
                    <tr key={a.id} className="hover:bg-muted/70 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-medium text-navy">{a.candidateName}</p>
                        <p className="text-xs text-muted-foreground">{a.candidateEmail}{a.candidatePhone ? ` · ${a.candidatePhone}` : ''}</p>
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{(a as any).jobPosting?.title || '—'}</td>
                      <td className="px-5 py-4">
                        <StatusBadge status={a.status} />
                        {a.shortlisted && (
                          <span className="ml-1.5 inline-flex items-center gap-0.5 text-amber-600 text-[11px] font-bold">
                            <Star size={11} className="fill-amber-400" /> Shortlisted
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {a.matchScore !== null && a.matchScore !== undefined ? (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${
                            a.matchScore >= 80 ? 'bg-emerald-50 text-emerald-700' :
                            a.matchScore >= 65 ? 'bg-amber-50 text-amber-700' :
                            'bg-red-50 text-red-700'
                          }`}>{a.matchScore}%</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{a.source || '—'}</td>
                      <td className="px-5 py-4 text-muted-foreground">{fmtDate(a.createdAt)}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {a.resumeUrl && (
                            <a href={a.resumeUrl} target="_blank" rel="noopener noreferrer"
                              className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-navy transition-colors" title="View resume">
                              <FileText size={15} />
                            </a>
                          )}
                          {can('RECRUITMENT', 'EDIT') && !a.resumeUrl && (
                            <>
                              <input type="file" accept=".pdf,.docx,.doc,.txt"
                                ref={el => { fileInputRefs.current[a.id] = el; }}
                                className="hidden"
                                onChange={e => {
                                  const file = e.target.files?.[0];
                                  if (file) handleResumeUpload(a.id, file);
                                }}
                              />
                              <button onClick={() => fileInputRefs.current[a.id]?.click()}
                                disabled={resumeUploading === a.id}
                                className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-navy transition-colors" title="Upload CV">
                                <Upload size={15} />
                              </button>
                            </>
                          )}
                          {can('RECRUITMENT', 'EDIT') && a.resumeUrl && (!a.skills || a.skills.length === 0) && (
                            <button onClick={() => handleParseResume(a.id)} disabled={parseLoading === a.id}
                              className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-purple-600 transition-colors" title="Parse Resume">
                              <Brain size={15} />
                            </button>
                          )}
                          {can('RECRUITMENT', 'EDIT') && a.matchScore !== null && a.matchScore !== undefined && (
                            <button onClick={() => handleToggleShortlist(a.id, !!a.shortlisted)} disabled={!!actionLoading}
                              className={`p-2 hover:bg-muted rounded-lg transition-colors ${a.shortlisted ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500'}`} title={a.shortlisted ? 'Remove from shortlist' : 'Shortlist'}>
                              <Star size={15} className={a.shortlisted ? 'fill-amber-400' : ''} />
                            </button>
                          )}
                          {can('RECRUITMENT', 'EDIT') && a.status !== 'HIRED' && a.status !== 'REJECTED' && a.status !== 'WITHDRAWN' && (
                            <button onClick={() => { setStatusChangeTarget({ appId: a.id, toStatus: 'REJECTED' }); setChangeNotes(''); }}
                              className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-red-500 transition-colors" title="Reject">
                              <X size={15} />
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

      {/* Create posting modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowCreate(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="modal-title-posting" className="bg-primary rounded-2xl shadow-xl w-full max-w-lg flex flex-col" onKeyDown={(e) => { if (e.key === 'Escape') setShowCreate(false); }} tabIndex={-1}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 id="modal-title-posting" className="text-lg font-bold text-navy">New Job Posting</h2>
              <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Title *</span>
                <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={formTitle} onChange={e => setFormTitle(e.target.value)} required placeholder="e.g. Senior Software Engineer" />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Department</span>
                  <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={formDept} onChange={e => setFormDept(e.target.value)} placeholder="e.g. Engineering" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Location</span>
                  <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={formLocation} onChange={e => setFormLocation(e.target.value)} placeholder="e.g. Harare" />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Type</span>
                  <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={formType} onChange={e => setFormType(e.target.value)}>
                    <option value="">Select type</option>
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Internship">Internship</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Salary Range</span>
                  <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                    value={formSalary} onChange={e => setFormSalary(e.target.value)} placeholder="e.g. $50k-$70k" />
                </label>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Description *</span>
                <textarea className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green min-h-[80px]"
                  value={formDesc} onChange={e => setFormDesc(e.target.value)} required placeholder="Job description..." />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Requirements</span>
                <textarea className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green min-h-[60px]"
                  value={formReq} onChange={e => setFormReq(e.target.value)} placeholder="Key requirements (used for AI matching)..." />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Closes At</span>
                <input type="date" className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={formCloses} onChange={e => setFormCloses(e.target.value)} />
              </label>
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleCreate as any} disabled={submitting} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
                <Plus size={16} /> {submitting ? 'Creating...' : 'Create Posting'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add application modal */}
      {showAddApp && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setShowAddApp(false); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="modal-title-application" className="bg-primary rounded-2xl shadow-xl w-full max-w-md flex flex-col" onKeyDown={(e) => { if (e.key === 'Escape') setShowAddApp(false); }} tabIndex={-1}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 id="modal-title-application" className="text-lg font-bold text-navy">Add Application</h2>
              <button onClick={() => setShowAddApp(false)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <form onSubmit={handleAddApplication} className="p-6 flex flex-col gap-4 overflow-y-auto max-h-[70vh]">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Job Posting *</span>
                <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={addAppPostingId} onChange={e => setAddAppPostingId(e.target.value)} required>
                  <option value="">Select posting</option>
                  {postings.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Candidate Name *</span>
                <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={appName} onChange={e => setAppName(e.target.value)} required />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Email *</span>
                <input type="email" className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={appEmail} onChange={e => setAppEmail(e.target.value)} required />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Phone</span>
                <input className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={appPhone} onChange={e => setAppPhone(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Source</span>
                <select className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green"
                  value={appSource} onChange={e => setAppSource(e.target.value)}>
                  <option value="">Select source</option>
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="Company Website">Company Website</option>
                  <option value="Referral">Referral</option>
                  <option value="Job Board">Job Board</option>
                  <option value="Agency">Agency</option>
                  <option value="Other">Other</option>
                </select>
              </label>
            </form>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setShowAddApp(false)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleAddApplication as any} disabled={submitting} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90 flex items-center gap-1.5">
                <Plus size={16} /> {submitting ? 'Adding...' : 'Add Application'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status change modal */}
      {statusChangeTarget && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setStatusChangeTarget(null); }}>
          <div role="dialog" aria-modal="true" aria-labelledby="modal-title-status" className="bg-primary rounded-2xl shadow-xl w-full max-w-md flex flex-col" onKeyDown={(e) => { if (e.key === 'Escape') setStatusChangeTarget(null); }} tabIndex={-1}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <h2 id="modal-title-status" className="text-lg font-bold text-navy">Change Status to {statusChangeTarget.toStatus}</h2>
              <button onClick={() => setStatusChangeTarget(null)} className="p-2 hover:bg-muted rounded-lg text-muted-foreground"><X size={18} /></button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Notes (optional)</span>
                <textarea className="bg-primary border border-border rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent-green/20 focus:border-accent-green min-h-[80px]"
                  value={changeNotes} onChange={e => setChangeNotes(e.target.value)} placeholder="Reason for this change..." />
              </label>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-border">
              <button onClick={() => setStatusChangeTarget(null)} className="px-4 py-2 rounded-full border border-border text-sm font-bold hover:bg-muted transition-colors">Cancel</button>
              <button onClick={handleStatusChange} disabled={!!actionLoading} className="bg-brand text-navy px-4 py-2 rounded-full font-bold shadow hover:opacity-90">
                {actionLoading ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Job Posting"
          message="Are you sure you want to delete this job posting and all its applications? This cannot be undone."
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
};

export default Recruitment;
