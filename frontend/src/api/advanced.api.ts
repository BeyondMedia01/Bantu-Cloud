import { http } from './http';
import type {
  JobPosting, JobApplication, CandidateSkill, CandidateExperience, CandidateEducation,
  ScreenResult, ScreeningSummary,
  Onboarding, OnboardingTask, OnboardingTemplate, OnboardingTemplateTask,
  Asset, AssetCategory,
  TrainingCourse, TrainingEnrollment, TrainingCertificate,
  PerformanceGoal, PerformanceReview,
  SuccessionPlan, SuccessionCandidate,
  Survey, SurveyResults,
  AnalyticsOverview, WorkforceData, AnalyticsRecruitment, AnalyticsTraining, AnalyticsPerformance,
} from '../types/domain';

export const PayslipExportAPI = {
  getAll: (params?: Record<string, string>) => http.get<any[]>('/payslip-exports', { params }),
  getById: (id: string) => http.get<any>(`/payslip-exports/${id}`),
  create: (data: any) => http.post('/payslip-exports', data),
  delete: (id: string) => http.delete(`/payslip-exports/${id}`),
};

export const PayslipSummaryAPI = {
  getAll: (params?: Record<string, string>) => http.get<any[]>('/payslip-summaries', { params }),
  getById: (id: string) => http.get<any>(`/payslip-summaries/${id}`),
  create: (data: any) => http.post('/payslip-summaries', data),
  update: (id: string, data: any) => http.put(`/payslip-summaries/${id}`, data),
  delete: (id: string) => http.delete(`/payslip-summaries/${id}`),
};

export const PayslipTransactionAPI = {
  getAll: (params?: Record<string, string>) => http.get<any[]>('/payslip-transactions', { params }),
  getById: (id: string) => http.get<any>(`/payslip-transactions/${id}`),
  create: (data: any) => http.post('/payslip-transactions', data),
  update: (id: string, data: any) => http.put(`/payslip-transactions/${id}`, data),
  delete: (id: string) => http.delete(`/payslip-transactions/${id}`),
};

export const RecruitmentAPI = {
  getPostings: (params?: Record<string, string>) =>
    http.get<{ data: JobPosting[] }>('/recruitment/postings', { params }),
  getPosting: (id: string) =>
    http.get<{ data: JobPosting }>(`/recruitment/postings/${id}`),
  createPosting: (data: Partial<JobPosting>) =>
    http.post<JobPosting>('/recruitment/postings', data),
  updatePosting: (id: string, data: Partial<JobPosting>) =>
    http.put<{ data: JobPosting }>(`/recruitment/postings/${id}`, data),
  deletePosting: (id: string) =>
    http.delete(`/recruitment/postings/${id}`),
  getApplications: (params?: Record<string, string>) =>
    http.get<{ data: JobApplication[] }>('/recruitment/applications', { params }),
  createApplication: (data: Partial<JobApplication>) =>
    http.post<JobApplication>('/recruitment/applications', data),
  updateApplicationStatus: (id: string, status: string, notes?: string) =>
    http.put<{ data: JobApplication }>(`/recruitment/applications/${id}/status`, { status, notes }),
  uploadResume: (id: string, file: File) => {
    const form = new FormData();
    form.append('resume', file);
    return http.post<{ data: { resumeUrl: string } }>(`/recruitment/applications/${id}/resume`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  parseResume: (id: string) =>
    http.post<{ data: { skills: CandidateSkill[]; experiences: CandidateExperience[]; educations: CandidateEducation[]; totalYears: number } }>(`/recruitment/applications/${id}/parse`),
  screenPosting: (id: string, threshold?: number) =>
    http.post<{ data: { results: ScreenResult[]; total: number; shortlisted: number; threshold: number } }>(`/recruitment/postings/${id}/screen`, { threshold }),
  getShortlist: (id: string) =>
    http.get<{ data: JobApplication[] }>(`/recruitment/postings/${id}/shortlist`),
  toggleShortlist: (id: string, shortlisted: boolean) =>
    http.put<{ data: JobApplication }>(`/recruitment/applications/${id}/shortlist`, { shortlisted }),
  updateScreeningNotes: (id: string, screeningNotes: string) =>
    http.put(`/recruitment/applications/${id}/screening-notes`, { screeningNotes }),
  getScreeningSummary: (id: string) =>
    http.get<{ data: ScreeningSummary }>(`/recruitment/postings/${id}/screening-summary`),
};

export const OnboardingAPI = {
  getAll: (params?: Record<string, string>) =>
    http.get<{ data: Onboarding[] }>('/onboarding', { params }),
  getById: (id: string) =>
    http.get<{ data: Onboarding }>(`/onboarding/${id}`),
  create: (data: { employeeId: string; templateId?: string; startDate: string; buddyId?: string; notes?: string }) =>
    http.post<{ data: Onboarding }>('/onboarding', data),
  update: (id: string, data: { buddyId?: string; notes?: string; status?: string }) =>
    http.put<{ data: Onboarding }>(`/onboarding/${id}`, data),
  updateTask: (id: string, taskId: string, data: { title?: string; completed?: boolean; assigneeId?: string; dueDate?: string; notes?: string; description?: string }) =>
    http.put<{ data: OnboardingTask }>(`/onboarding/${id}/tasks/${taskId}`, data),
  getTemplates: () =>
    http.get<{ data: OnboardingTemplate[] }>('/onboarding/templates'),
  createTemplate: (data: { name: string; description?: string; tasks?: Omit<OnboardingTemplateTask, 'id' | 'templateId' | 'createdAt'>[] }) =>
    http.post<{ data: OnboardingTemplate }>('/onboarding/templates', data),
  updateTemplate: (id: string, data: { name?: string; description?: string; tasks?: OnboardingTemplateTask[] }) =>
    http.put<{ data: OnboardingTemplate }>(`/onboarding/templates/${id}`, data),
  deleteTemplate: (id: string) =>
    http.delete(`/onboarding/templates/${id}`),
  getEmployees: () =>
    http.get<{ data: { id: string; firstName: string; lastName: string; employeeCode: string }[] }>('/onboarding/employees/list'),
};

export const AssetAPI = {
  getAll: (params?: Record<string, string>) =>
    http.get<{ data: Asset[] }>('/assets', { params }),
  getById: (id: string) =>
    http.get<{ data: Asset }>(`/assets/${id}`),
  create: (data: Partial<Asset>) =>
    http.post<{ data: Asset }>('/assets', data),
  update: (id: string, data: Partial<Asset>) =>
    http.put<{ data: Asset }>(`/assets/${id}`, data),
  delete: (id: string) =>
    http.delete(`/assets/${id}`),
  assign: (id: string, employeeId: string) =>
    http.post<{ data: Asset }>(`/assets/${id}/assign`, { employeeId }),
  return: (id: string) =>
    http.post<{ data: Asset }>(`/assets/${id}/return`),
  getCategories: () =>
    http.get<{ data: AssetCategory[] }>('/assets/categories'),
  createCategory: (data: { name: string; description?: string }) =>
    http.post<{ data: AssetCategory }>('/assets/categories', data),
  deleteCategory: (id: string) =>
    http.delete(`/assets/categories/${id}`),
  getEmployees: () =>
    http.get<{ data: { id: string; firstName: string; lastName: string; employeeCode: string; department?: { name: string } }[] }>('/assets/employees/list'),
};

export const TrainingAPI = {
  getCourses: (params?: Record<string, string>) =>
    http.get<{ data: TrainingCourse[] }>('/training/courses', { params }),
  createCourse: (data: Partial<TrainingCourse>) =>
    http.post<{ data: TrainingCourse }>('/training/courses', data),
  updateCourse: (id: string, data: Partial<TrainingCourse>) =>
    http.put<{ data: TrainingCourse }>(`/training/courses/${id}`, data),
  deleteCourse: (id: string) =>
    http.delete(`/training/courses/${id}`),
  getEnrollments: (courseId: string) =>
    http.get<{ data: TrainingEnrollment[] }>(`/training/courses/${courseId}/enrollments`),
  enrollEmployees: (courseId: string, employeeIds: string[]) =>
    http.post<{ data: TrainingEnrollment[] }>(`/training/courses/${courseId}/enroll`, { employeeIds }),
  updateEnrollment: (id: string, data: { status?: string; score?: number; notes?: string }) =>
    http.put<{ data: TrainingEnrollment }>(`/training/enrollments/${id}`, data),
  getCertificates: (courseId: string) =>
    http.get<{ data: TrainingCertificate[] }>(`/training/courses/${courseId}/certificates`),
  issueCertificate: (courseId: string, data: { employeeId: string; expiryDate?: string; certificateNo?: string; certificateUrl?: string }) =>
    http.post<{ data: TrainingCertificate }>(`/training/courses/${courseId}/certificate`, data),
  getEmployees: () =>
    http.get<{ data: { id: string; firstName: string; lastName: string; employeeCode: string }[] }>('/training/employees/list'),
};

export const PerformanceAPI = {
  getGoals: (params?: Record<string, string>) =>
    http.get<{ data: PerformanceGoal[] }>('/performance/goals', { params }),
  createGoal: (data: Partial<PerformanceGoal>) =>
    http.post<{ data: PerformanceGoal }>('/performance/goals', data),
  updateGoal: (id: string, data: Partial<PerformanceGoal>) =>
    http.put<{ data: PerformanceGoal }>(`/performance/goals/${id}`, data),
  deleteGoal: (id: string) =>
    http.delete(`/performance/goals/${id}`),
  getReviews: (params?: Record<string, string>) =>
    http.get<{ data: PerformanceReview[] }>('/performance/reviews', { params }),
  getReview: (id: string) =>
    http.get<{ data: PerformanceReview }>(`/performance/reviews/${id}`),
  createReview: (data: { employeeId: string; reviewerId: string; period: string }) =>
    http.post<{ data: PerformanceReview }>('/performance/reviews', data),
  updateReview: (id: string, data: Partial<PerformanceReview> & { skills?: { name: string; rating?: number; notes?: string }[] }) =>
    http.put<{ data: PerformanceReview }>(`/performance/reviews/${id}`, data),
  deleteReview: (id: string) =>
    http.delete(`/performance/reviews/${id}`),
  getEmployees: () =>
    http.get<{ data: { id: string; firstName: string; lastName: string; employeeCode: string }[] }>('/performance/employees/list'),
  getReviewers: () =>
    http.get<{ data: { id: string; name: string; email: string }[] }>('/performance/reviewers/list'),
};

export const SuccessionAPI = {
  getPlans: (params?: Record<string, string>) =>
    http.get<{ data: SuccessionPlan[] }>('/succession/plans', { params }),
  createPlan: (data: Partial<SuccessionPlan>) =>
    http.post<{ data: SuccessionPlan }>('/succession/plans', data),
  updatePlan: (id: string, data: Partial<SuccessionPlan>) =>
    http.put<{ data: SuccessionPlan }>(`/succession/plans/${id}`, data),
  deletePlan: (id: string) =>
    http.delete(`/succession/plans/${id}`),
  addCandidate: (planId: string, data: { employeeId: string; readiness?: string; rating?: number; notes?: string; strengths?: string; areasForGrowth?: string }) =>
    http.post<{ data: SuccessionCandidate }>(`/succession/plans/${planId}/candidates`, data),
  updateCandidate: (id: string, data: Partial<SuccessionCandidate>) =>
    http.put<{ data: SuccessionCandidate }>(`/succession/candidates/${id}`, data),
  deleteCandidate: (id: string) =>
    http.delete(`/succession/candidates/${id}`),
  getEmployees: () =>
    http.get<{ data: { id: string; firstName: string; lastName: string; employeeCode: string }[] }>('/succession/employees/list'),
};

export const SurveyAPI = {
  getAll: (params?: Record<string, string>) =>
    http.get<{ data: Survey[] }>('/surveys', { params }),
  getById: (id: string) =>
    http.get<{ data: Survey }>(`/surveys/${id}`),
  create: (data: { title: string; description?: string; anonymous?: boolean; dueDate?: string }) =>
    http.post<{ data: Survey }>('/surveys', data),
  update: (id: string, data: Partial<Survey> & { questions?: { text: string; type: string; options?: string; required?: boolean; order?: number }[] }) =>
    http.put<{ data: Survey }>(`/surveys/${id}`, data),
  delete: (id: string) =>
    http.delete(`/surveys/${id}`),
  respond: (id: string, data: { employeeId?: string; answers: { questionId: string; value: string }[] }) =>
    http.post<{ data: { id: string } }>(`/surveys/${id}/respond`, data),
  getResults: (id: string) =>
    http.get<{ data: SurveyResults }>(`/surveys/${id}/results`),
};

export const AnalyticsAPI = {
  getOverview: () => http.get<AnalyticsOverview>('/analytics/overview'),
  getWorkforce: () => http.get<WorkforceData>('/analytics/workforce'),
  getRecruitment: () => http.get<AnalyticsRecruitment>('/analytics/recruitment'),
  getTraining: () => http.get<AnalyticsTraining>('/analytics/training'),
  getPerformance: () => http.get<AnalyticsPerformance>('/analytics/performance'),
};
