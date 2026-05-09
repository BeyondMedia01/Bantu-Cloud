import React, { useEffect, useState, useRef } from 'react';
import {
  UserPlus, Plus, Send, X, Users, Briefcase, Upload, FileText,
  Brain, Star,
} from 'lucide-react';
import { RecruitmentAPI } from '../api/client';
import { useToast } from '../context/ToastContext';
import { usePermissions } from '../hooks/usePermissions';
import SkeletonTable from '../components/common/SkeletonTable';
import type {
  JobPosting, JobApplication, JobStatus, ApplicationStatus,
  ScreeningSummary,
} from '../types/domain';

const POSTING_STATUS_OPTS: JobStatus[] = ['DRAFT', 'PUBLISHED', 'CLOSED', 'FILLED'];
const POSTING_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  PUBLISHED: 'bg-green-50 text-green-700 border-green-200',
  CLOSED: 'bg-red-50 text-red-600 border-red-200',
  FILLED: 'bg-blue-50 text-blue-700 border-blue-200',
};
const APP_STATUS_OPTS: ApplicationStatus[] = ['NEW', 'SCREENING', 'INTERVIEWING', 'OFFERED', 'HIRED', 'REJECTED', 'WITHDRAWN'];
const APP_STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-50 text-blue-700 border-blue-200',
  SCREENING: 'bg-amber-50 text-amber-700 border-amber-200',
  INTERVIEWING: 'bg-purple-50 text-purple-700 border-purple-200',
  OFFERED: 'bg-teal-50 text-teal-700 border-teal-200',
  HIRED: 'bg-green-50 text-green-700 border-green-200',
  REJECTED: 'bg-red-50 text-red-600 border-red-200',
  WITHDRAWN: 'bg-slate-100 text-slate-500 border-slate-200',
};

const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Recruitment: React.FC = () => {
  const { showToast } = useToast();
  const { can } = usePermissions();

  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedPosting, setExpandedPosting] = useState<string | null>(null);
  const [applications, setApplications] = useState<Record<string, JobApplication[]>>({});
  const [appLoading, setAppLoading] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState('');

  // Screening state per posting
  const [screeningSummary, setScreeningSummary] = useState<Record<string, ScreeningSummary>>({});
  const [screenLoading, setScreenLoading] = useState<string | null>(null);
  const [showShortlist, setShowShortlist] = useState<string | null>(null);
  const [shortlistData, setShortlistData] = useState<Record<string, JobApplication[]>>({});
  const [shortlistLoading, setShortlistLoading] = useState<string | null>(null);

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

  // Screen threshold config
  const [screenThreshold, setScreenThreshold] = useState(50);

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

  useEffect(() => { loadPostings(); }, [statusFilter]);

  const loadApplications = async (postingId: string) => {
    setAppLoading(postingId);
    try {
      const res = await RecruitmentAPI.getApplications({ postingId });
      setApplications(prev => ({ ...prev, [postingId]: res.data.data || [] }));
    } catch {
      showToast('Failed to load applications', 'error');
    } finally {
      setAppLoading(null);
    }
  };

  const loadScreeningSummary = async (postingId: string) => {
    try {
      const res = await RecruitmentAPI.getScreeningSummary(postingId);
      setScreeningSummary(prev => ({ ...prev, [postingId]: res.data.data }));
    } catch { /* ignore */ }
  };

  const loadShortlist = async (postingId: string) => {
    setShortlistLoading(postingId);
    try {
      const res = await RecruitmentAPI.getShortlist(postingId);
      setShortlistData(prev => ({ ...prev, [postingId]: res.data.data || [] }));
    } catch {
      showToast('Failed to load shortlist', 'error');
    } finally {
      setShortlistLoading(null);
    }
  };

  const toggleExpand = (id: string) => {
    if (expandedPosting === id) {
      setExpandedPosting(null);
      setShowShortlist(null);
      return;
    }
    setExpandedPosting(id);
    setShowShortlist(null);
    if (!applications[id]) loadApplications(id);
    loadScreeningSummary(id);
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
      showToast(err.response?.data?.message || 'Failed to create posting', 'error');
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
      showToast(err.response?.data?.message || 'Failed to publish', 'error');
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
      showToast(err.response?.data?.message || 'Failed to close', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this job posting and all its applications?')) return;
    setActionLoading('del-' + id);
    try {
      await RecruitmentAPI.deletePosting(id);
      showToast('Job posting deleted', 'success');
      if (expandedPosting === id) setExpandedPosting(null);
      loadPostings();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to delete', 'error');
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
      if (expandedPosting) {
        loadApplications(expandedPosting);
        loadScreeningSummary(expandedPosting);
      }
      loadPostings();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to add application', 'error');
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
      if (expandedPosting) {
        loadApplications(expandedPosting);
        loadScreeningSummary(expandedPosting);
      }
      loadPostings();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to update status', 'error');
    } finally {
      setActionLoading('');
    }
  };

  // ─── ATS: Resume Upload ──────────────────────────────────────────────────────

  const handleResumeUpload = async (appId: string, file: File) => {
    setResumeUploading(appId);
    try {
      await RecruitmentAPI.uploadResume(appId, file);
      showToast('Resume uploaded', 'success');
      if (expandedPosting) loadApplications(expandedPosting);
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Upload failed', 'error');
    } finally {
      setResumeUploading(null);
    }
  };

  // ─── ATS: Parse Resume ───────────────────────────────────────────────────────

  const handleParseResume = async (appId: string) => {
    setParseLoading(appId);
    try {
      const res = await RecruitmentAPI.parseResume(appId);
      showToast(`Parsed: ${res.data.data.skills.length} skills, ${res.data.data.totalYears}y experience`, 'success');
      if (expandedPosting) loadApplications(expandedPosting);
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Parse failed', 'error');
    } finally {
      setParseLoading(null);
    }
  };

  // ─── ATS: Screen All ─────────────────────────────────────────────────────────

  const handleScreenPosting = async (postingId: string) => {
    setScreenLoading(postingId);
    try {
      const res = await RecruitmentAPI.screenPosting(postingId, screenThreshold);
      showToast(`Screened ${res.data.data.total} candidates — ${res.data.data.shortlisted} shortlisted (≥${res.data.data.threshold}%)`, 'success');
      if (expandedPosting) {
        loadApplications(expandedPosting);
        loadScreeningSummary(expandedPosting);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Screening failed', 'error');
    } finally {
      setScreenLoading(null);
    }
  };

  // ─── ATS: Shortlist Toggle ───────────────────────────────────────────────────

  const handleToggleShortlist = async (appId: string, current: boolean) => {
    setActionLoading('sl-' + appId);
    try {
      await RecruitmentAPI.toggleShortlist(appId, !current);
      if (expandedPosting) {
        loadApplications(expandedPosting);
        loadScreeningSummary(expandedPosting);
        if (showShortlist === expandedPosting) loadShortlist(expandedPosting);
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to update', 'error');
    } finally {
      setActionLoading('');
    }
  };

  const handleShowShortlist = (postingId: string) => {
    if (showShortlist === postingId) {
      setShowShortlist(null);
      return;
    }
    setShowShortlist(postingId);
    if (!shortlistData[postingId]) loadShortlist(postingId);
  };

  const canManage = can('RECRUITMENT');

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <UserPlus size={28} className="text-navy" />
          <h1 className="text-2xl font-semibold text-navy">Recruitment</h1>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(true)} className="btn btn-primary flex items-center gap-2">
            <Plus size={18} /> New Posting
          </button>
        )}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto">
        {['', ...POSTING_STATUS_OPTS].map(s => (
          <button key={s || 'all'} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-lg border whitespace-nowrap transition-colors ${
              statusFilter === s
                ? 'bg-navy text-white border-navy'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {loading ? <SkeletonTable headers={['Title', 'Department', 'Status', 'Applications', 'Actions']} rows={5} /> : (
        <div className="space-y-3">
          {postings.length === 0 && (
            <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-500">
              <Briefcase size={48} className="mx-auto mb-3 text-slate-300" />
              <p className="text-lg font-medium text-slate-400 mb-1">No job postings yet</p>
              <p>Create your first posting to start recruiting.</p>
            </div>
          )}

          {postings.map(p => (
            <div key={p.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              {/* Posting header — always visible */}
              <div className="p-4 flex items-start justify-between cursor-pointer hover:bg-slate-50 transition-colors"
                onClick={() => toggleExpand(p.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-slate-900 truncate">{p.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${POSTING_STATUS_COLORS[p.status] || ''}`}>
                      {p.status}
                    </span>
                    {screeningSummary[p.id] && screeningSummary[p.id].shortlisted > 0 && (
                      <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                        <Star size={12} />{screeningSummary[p.id].shortlisted} shortlisted
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
                    {p.department && <span>{p.department}</span>}
                    {p.location && <span>{p.location}</span>}
                    {p.type && <span>{p.type}</span>}
                    {p._count && <span><Users size={14} className="inline mr-1" />{p._count.applications} apps</span>}
                    {screeningSummary[p.id] && (
                      <span><Brain size={14} className="inline mr-1" />{screeningSummary[p.id].screened} screened</span>
                    )}
                    <span>Created {fmtDate(p.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-4 shrink-0" onClick={e => e.stopPropagation()}>
                  {canManage && p.status === 'DRAFT' && (
                    <button onClick={() => handlePublish(p.id)} disabled={!!actionLoading}
                      className="btn btn-sm btn-success flex items-center gap-1"
                    >
                      <Send size={14} /> Publish
                    </button>
                  )}
                  {canManage && p.status === 'PUBLISHED' && (
                    <button onClick={() => handleClose(p.id)} disabled={!!actionLoading}
                      className="btn btn-sm bg-slate-100 text-slate-600 border border-slate-200"
                    >
                      Close
                    </button>
                  )}
                  {canManage && (
                    <button onClick={() => handleDelete(p.id)} disabled={!!actionLoading}
                      className="btn btn-sm text-red-500"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded ATS dashboard */}
              {expandedPosting === p.id && (
                <div className="border-t border-slate-100">
                  {/* Screening controls */}
                  {canManage && (
                    <div className="bg-indigo-50/50 px-4 py-3 flex items-center gap-3 flex-wrap border-b border-slate-100">
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-slate-600 font-medium">Threshold:</label>
                        <input type="number" min={0} max={100} value={screenThreshold}
                          onChange={e => setScreenThreshold(Number(e.target.value))}
                          className="w-16 text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                        />
                        <span className="text-xs text-slate-400">%</span>
                      </div>
                      <button onClick={() => handleScreenPosting(p.id)} disabled={screenLoading === p.id}
                        className="btn btn-sm bg-indigo-600 text-white hover:bg-indigo-700 flex items-center gap-1"
                      >
                        <Brain size={14} /> {screenLoading === p.id ? 'Screening...' : 'AI Screen All'}
                      </button>
                      {screeningSummary[p.id]?.shortlisted > 0 && (
                        <button onClick={() => handleShowShortlist(p.id)}
                          className={`btn btn-sm flex items-center gap-1 ${showShortlist === p.id ? 'bg-green-600 text-white' : 'bg-green-100 text-green-700 border border-green-200'}`}
                        >
                          <Star size={14} /> View Shortlist ({screeningSummary[p.id]?.shortlisted || 0})
                        </button>
                      )}
                      <span className="text-xs text-slate-500 ml-auto">
                        {screeningSummary[p.id]?.screened || 0}/{screeningSummary[p.id]?.total || 0} screened
                      </span>
                    </div>
                  )}

                  {/* Shortlist view */}
                  {showShortlist === p.id && (
                    <div className="bg-green-50/50 p-4 border-b border-slate-100">
                      <h4 className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-1.5">
                        <Star size={16} /> Shortlisted Candidates
                      </h4>
                      {shortlistLoading === p.id ? <SkeletonTable headers={['Candidate', 'Score', 'Status', 'Actions']} rows={3} /> : (
                        !shortlistData[p.id] || shortlistData[p.id].length === 0 ? (
                          <p className="text-sm text-slate-500 text-center py-4">No candidates shortlisted yet. Run AI screening first.</p>
                        ) : (
                          <div className="space-y-2">
                            {shortlistData[p.id].map(a => (
                              <div key={a.id} className="bg-white rounded-lg border border-green-200 p-3">
                                <div className="flex items-start justify-between">
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-medium text-slate-800">{a.candidateName}</span>
                                      {a.matchScore !== null && (
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${
                                          (a.matchScore || 0) >= 80 ? 'bg-green-100 text-green-700 border-green-200' :
                                          (a.matchScore || 0) >= 65 ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                          'bg-red-100 text-red-600 border-red-200'
                                        }`}>
                                          {a.matchScore}%
                                        </span>
                                      )}
                                      <span className={`text-xs px-2 py-0.5 rounded-full border ${APP_STATUS_COLORS[a.status] || ''}`}>
                                        {a.status}
                                      </span>
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5">{a.candidateEmail}</div>

                                    {/* Skills */}
                                    {a.skills && a.skills.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1.5">
                                        {a.skills.slice(0, 8).map(s => (
                                          <span key={s.id} className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                                            {s.name}
                                          </span>
                                        ))}
                                        {a.skills.length > 8 && (
                                          <span className="text-xs text-slate-400">+{a.skills.length - 8}</span>
                                        )}
                                      </div>
                                    )}

                                    {/* Experience summary */}
                                    {a.experiences && a.experiences.length > 0 && (
                                      <div className="text-xs text-slate-500 mt-1">
                                        {a.experiences.map((e, i) => (
                                          <span key={i}>{e.title}{e.company ? ` @ ${e.company}` : ''}{i < a.experiences!.length - 1 ? ' → ' : ''}</span>
                                        ))}
                                      </div>
                                    )}

                                    {/* Education */}
                                    {a.educations && a.educations.length > 0 && (
                                      <div className="text-xs text-slate-400 mt-0.5">
                                        {a.educations[0].degree ? `${a.educations[0].degree}${a.educations[0].field ? ` in ${a.educations[0].field}` : ''}` : ''}
                                        {a.educations[0].institution ? ` — ${a.educations[0].institution}` : ''}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1 ml-3 shrink-0">
                                    <button onClick={() => handleToggleShortlist(a.id, true)}
                                      className="btn btn-sm text-amber-500 hover:text-amber-700"
                                      disabled={!!actionLoading}
                                      title="Remove from shortlist"
                                    >
                                      <Star size={16} className="fill-amber-400" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )
                      )}
                    </div>
                  )}

                  {/* Applications list */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-slate-700">Applications</h4>
                      {canManage && p.status !== 'FILLED' && (
                        <button onClick={() => { setAddAppPostingId(p.id); setShowAddApp(true); }}
                          className="btn btn-sm btn-primary flex items-center gap-1"
                        >
                          <Plus size={14} /> Add Application
                        </button>
                      )}
                    </div>
                    {appLoading === p.id ? <SkeletonTable headers={['Candidate', 'Email', 'Status', 'Actions']} rows={3} /> : (
                      (!applications[p.id] || applications[p.id].length === 0) ? (
                        <p className="text-sm text-slate-400 text-center py-4">No applications yet</p>
                      ) : (
                        <div className="space-y-2">
                          {applications[p.id].map(a => (
                            <div key={a.id} className="bg-white rounded border border-slate-200 p-3">
                              <div className="flex items-start justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-medium text-slate-800 text-sm">{a.candidateName}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${APP_STATUS_COLORS[a.status] || ''}`}>
                                      {a.status}
                                    </span>
                                    {a.matchScore !== null && a.matchScore !== undefined && (
                                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold border ${
                                        a.matchScore >= 80 ? 'bg-green-100 text-green-700 border-green-200' :
                                        a.matchScore >= 65 ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                        a.matchScore >= 50 ? 'bg-orange-100 text-orange-600 border-orange-200' :
                                        'bg-red-100 text-red-500 border-red-200'
                                      }`}>
                                        {a.matchScore}%
                                      </span>
                                    )}
                                    {a.shortlisted && (
                                      <span className="text-xs text-amber-600 font-medium flex items-center gap-0.5">
                                        <Star size={12} className="fill-amber-400" /> Shortlisted
                                      </span>
                                    )}
                                    {a.resumeUrl && (
                                      <a href={a.resumeUrl} target="_blank" rel="noopener noreferrer"
                                        className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
                                      >
                                        <FileText size={12} /> Resume
                                      </a>
                                    )}
                                  </div>
                                  <div className="text-xs text-slate-500 mt-0.5">
                                    {a.candidateEmail}{a.candidatePhone ? ` • ${a.candidatePhone}` : ''}
                                    {a.source && <span className="ml-2">via {a.source}</span>}
                                    <span className="ml-2">{fmtDate(a.createdAt)}</span>
                                  </div>

                                  {/* ATS: parsed data preview */}
                                  {a.skills && a.skills.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1.5">
                                      {a.skills.slice(0, 6).map(s => (
                                        <span key={s.id} className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                                          {s.name}
                                        </span>
                                      ))}
                                      {a.skills.length > 6 && (
                                        <span className="text-[10px] text-slate-400">+{a.skills.length - 6}</span>
                                      )}
                                    </div>
                                  )}

                                  {/* Screening notes */}
                                  {a.screeningNotes && (
                                    <div className="text-xs text-slate-500 mt-1 italic border-l-2 border-slate-200 pl-2">
                                      {a.screeningNotes}
                                    </div>
                                  )}
                                </div>

                                {/* Actions column */}
                                <div className="flex flex-col items-end gap-1 ml-3 shrink-0">
                                  {/* Resume upload */}
                                  {canManage && !a.resumeUrl && (
                                    <div>
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
                                        className="btn btn-sm text-xs flex items-center gap-1 bg-slate-100 text-slate-600 border border-slate-200"
                                      >
                                        <Upload size={12} /> {resumeUploading === a.id ? 'Uploading...' : 'Upload CV'}
                                      </button>
                                    </div>
                                  )}

                                  {/* Parse resume */}
                                  {canManage && a.resumeUrl && (!a.skills || a.skills.length === 0) && (
                                    <button onClick={() => handleParseResume(a.id)} disabled={parseLoading === a.id}
                                      className="btn btn-sm text-xs flex items-center gap-1 bg-indigo-50 text-indigo-600 border border-indigo-200"
                                    >
                                      <Brain size={12} /> {parseLoading === a.id ? 'Parsing...' : 'Parse Resume'}
                                    </button>
                                  )}

                                  {/* Shortlist toggle */}
                                  {canManage && a.matchScore !== null && a.matchScore !== undefined && (
                                    <button onClick={() => handleToggleShortlist(a.id, !!a.shortlisted)} disabled={!!actionLoading}
                                      className={`btn btn-sm text-xs flex items-center gap-1 ${
                                        a.shortlisted ? 'text-amber-600 bg-amber-50 border border-amber-200' : 'text-slate-500 bg-slate-50 border border-slate-200'
                                      }`}
                                    >
                                      <Star size={12} className={a.shortlisted ? 'fill-amber-400' : ''} />
                                      {a.shortlisted ? 'Shortlisted' : 'Shortlist'}
                                    </button>
                                  )}

                                  {/* Status change */}
                                  {canManage && a.status !== 'HIRED' && a.status !== 'REJECTED' && a.status !== 'WITHDRAWN' && (
                                    <select
                                      value=""
                                      onChange={e => {
                                        const val = e.target.value as ApplicationStatus;
                                        if (!val) return;
                                        if (val === 'REJECTED') {
                                          setStatusChangeTarget({ appId: a.id, toStatus: val });
                                          setChangeNotes('');
                                        } else {
                                          setActionLoading('status-' + a.id);
                                          RecruitmentAPI.updateApplicationStatus(a.id, val).then(() => {
                                            showToast(`Status updated to ${val}`, 'success');
                                            if (expandedPosting) {
                                              loadApplications(expandedPosting);
                                              loadScreeningSummary(expandedPosting);
                                            }
                                            loadPostings();
                                          }).catch(err => showToast(err.response?.data?.message || 'Failed', 'error'))
                                          .finally(() => setActionLoading(''));
                                        }
                                      }}
                                      className="text-xs border border-slate-200 rounded px-2 py-1 bg-white w-28"
                                      disabled={!!actionLoading}
                                    >
                                      <option value="">Change status...</option>
                                      {APP_STATUS_OPTS.filter(s => s !== a.status).map(s => (
                                        <option key={s} value={s}>{s}</option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create posting modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">New Job Posting</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title *</label>
                <input className="input" value={formTitle} onChange={e => setFormTitle(e.target.value)} required placeholder="e.g. Senior Software Engineer" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Department</label>
                  <input className="input" value={formDept} onChange={e => setFormDept(e.target.value)} placeholder="e.g. Engineering" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                  <input className="input" value={formLocation} onChange={e => setFormLocation(e.target.value)} placeholder="e.g. Harare" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                  <select className="input" value={formType} onChange={e => setFormType(e.target.value)}>
                    <option value="">Select type</option>
                    <option value="Full-time">Full-time</option>
                    <option value="Part-time">Part-time</option>
                    <option value="Contract">Contract</option>
                    <option value="Internship">Internship</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Salary Range</label>
                  <input className="input" value={formSalary} onChange={e => setFormSalary(e.target.value)} placeholder="e.g. $50k-$70k" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description *</label>
                <textarea className="input min-h-[100px]" value={formDesc} onChange={e => setFormDesc(e.target.value)} required placeholder="Job description..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Requirements</label>
                <textarea className="input min-h-[80px]" value={formReq} onChange={e => setFormReq(e.target.value)} placeholder="Key requirements (used for AI matching)..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Closes At</label>
                <input type="date" className="input" value={formCloses} onChange={e => setFormCloses(e.target.value)} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? 'Creating...' : 'Create Posting'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add application modal */}
      {showAddApp && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowAddApp(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">Add Application</h2>
              <button onClick={() => setShowAddApp(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <form onSubmit={handleAddApplication} className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Candidate Name *</label>
                <input className="input" value={appName} onChange={e => setAppName(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                <input type="email" className="input" value={appEmail} onChange={e => setAppEmail(e.target.value)} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                <input className="input" value={appPhone} onChange={e => setAppPhone(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Source</label>
                <select className="input" value={appSource} onChange={e => setAppSource(e.target.value)}>
                  <option value="">Select source</option>
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="Company Website">Company Website</option>
                  <option value="Referral">Referral</option>
                  <option value="Job Board">Job Board</option>
                  <option value="Agency">Agency</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowAddApp(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" disabled={submitting} className="btn btn-primary">
                  {submitting ? 'Adding...' : 'Add Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status change with notes (for REJECTED) */}
      {statusChangeTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setStatusChangeTarget(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-navy">Change Status to {statusChangeTarget.toStatus}</h2>
              <button onClick={() => setStatusChangeTarget(null)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
                <textarea className="input min-h-[80px]" value={changeNotes} onChange={e => setChangeNotes(e.target.value)}
                  placeholder="Reason for this change..." />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setStatusChangeTarget(null)} className="btn btn-ghost">Cancel</button>
                <button onClick={handleStatusChange} disabled={!!actionLoading} className="btn btn-primary">
                  {actionLoading ? 'Updating...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Recruitment;
