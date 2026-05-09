// Domain entity types for the Bantu payroll platform

// ─── Tax Bands (PAYE progressive bands, separate from TaxTable brackets) ──────

export interface TaxBand {
  id: string;
  bandNumber: number;
  description?: string | null;
  lowerLimitUSD: number;
  upperLimitUSD?: number | null;
  taxRatePercent: number;
  fixedAmountUSD: number;
  effectiveFrom?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Org Structure ────────────────────────────────────────────────────────────

export interface SubCompany {
  id: string;
  name: string;
  companyId: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Grade ────────────────────────────────────────────────────────────────────

export interface Grade {
  id: string;
  clientId: string;
  companyId?: string | null;
  name: string;
  description?: string | null;
  minSalary?: number | null;
  maxSalary?: number | null;
  createdAt: string;
  updatedAt: string;
}

// ─── NEC Tables ───────────────────────────────────────────────────────────────

export interface NecGrade {
  id: string;
  necTableId: string;
  gradeCode: string;
  description?: string | null;
  minWage?: number | null;
  minRate?: number | null;
  necLevyRate?: number | null;
  createdAt: string;
  updatedAt: string;
  tableName?: string; // injected client-side when flattening tables
}

export interface NecTable {
  id: string;
  name: string;
  sector?: string | null;
  currency?: string | null;
  effectiveFrom?: string | null;
  effectiveDate?: string | null;
  expiryDate?: string | null;
  grades: NecGrade[];
  createdAt: string;
  updatedAt: string;
}

// ─── Tax Tables ───────────────────────────────────────────────────────────────

export interface TaxBracket {
  id: string;
  taxTableId: string;
  lowerBound: number;
  upperBound?: number | null;
  rate: number;
  fixedAmount?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaxTable {
  id: string;
  clientId?: string;
  name: string;
  currency: string;
  isActive: boolean;
  isAnnual?: boolean;
  effectiveFrom?: string | null;
  effectiveDate?: string | null;
  expiryDate?: string | null;
  brackets?: TaxBracket[];
  createdAt: string;
  updatedAt: string;
}

// ─── Transaction Codes ────────────────────────────────────────────────────────

export interface TransactionRule {
  id: string;
  transactionCodeId: string;
  name: string;
  condition?: string | null;
  formula?: string | null;
  valueOverride?: number | null;
  capAmount?: number | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionCode {
  id: string;
  clientId: string;
  code: string;
  name: string;
  type: string;
  calculationType: string;
  defaultValue?: number | null;
  incomeCategory?: string | null;
  affectsGross?: boolean;
  affectsNssa?: boolean;
  affectsPension?: boolean;
  isActive?: boolean;
  rules?: TransactionRule[];
  createdAt: string;
  updatedAt: string;
}

// ─── Payroll ──────────────────────────────────────────────────────────────────

export interface PayrollRun {
  id: string;
  clientId: string;
  companyId: string;
  name: string;
  period: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'PROCESSED' | 'CLOSED' | 'COMPLETED';
  currency?: string | null;
  totalGross?: number | null;
  totalNet?: number | null;
  exchangeRate?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  data?: PayrollRun[];
  total?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Payslip {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeCode?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  gross?: number;
  grossUSD?: number | null;
  grossZIG?: number | null;
  paye?: number;
  netPay?: number;
  netPayUSD?: number | null;
  currency?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PayrollInput {
  id: string;
  payrollRunId: string;
  employeeId: string;
  transactionCodeId: string;
  value: number;
  amount?: number | null;
  period?: string | null;
  units?: number | null;
  currency?: string | null;
  employeeUSD?: number | null;
  employeeZiG?: number | null;
  employerUSD?: number | null;
  employerZiG?: number | null;
  unitsType?: string | null;
  duration?: string | null;
  balance?: number | null;
  processed?: boolean;
  notes?: string | null;
  employee?: { firstName?: string; lastName?: string; employeeCode?: string } | null;
  transactionCode?: { code?: string; name?: string } | null;
  createdAt: string;
  updatedAt: string;
}

// ─── System Settings ──────────────────────────────────────────────────────────

export interface SystemSetting {
  id: string;
  key?: string;
  value?: string;
  settingName?: string;
  settingValue?: string;
  dataType?: string;
  isActive?: boolean;
  effectiveFrom?: string | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Leave ────────────────────────────────────────────────────────────────────

export interface LeaveRecord {
  id: string;
  employeeId: string;
  leaveType: string;
  type?: string;
  startDate: string;
  endDate: string;
  days: number;
  totalDays?: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  notes?: string | null;
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeavePolicy {
  id: string;
  clientId: string;
  leaveType: string;
  entitlementDays: number;
  carryOverDays?: number | null;
  carryOverLimit?: number | null;
  accrualRate?: number | null;
  maxAccumulation?: number | null;
  encashable?: boolean;
  encashCap?: number | null;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveBalance {
  id: string;
  employeeId: string;
  leaveType: string;
  year: number;
  entitled: number;
  taken: number;
  balance: number;
  accrued?: number | null;
  leavePolicy?: LeavePolicy | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveEncashment {
  id: string;
  employeeId: string;
  leaveType: string;
  days: number;
  amount?: number | null;
  currency?: string | null;
  totalAmount?: number | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PROCESSED';
  reason?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Loans ────────────────────────────────────────────────────────────────────

export interface LoanRepayment {
  id: string;
  loanId: string;
  dueDate: string;
  amount: number;
  status?: string;
  paid: boolean;
  paidDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Loan {
  id: string;
  employeeId: string;
  amount: number;
  balance: number;
  monthlyInstalment?: number | null;
  interestRate?: number | null;
  termMonths?: number | null;
  description?: string | null;
  startDate: string;
  status: 'ACTIVE' | 'PAID_OFF' | 'WRITTEN_OFF';
  notes?: string | null;
  employee?: { firstName?: string; lastName?: string } | null;
  repayments?: LoanRepayment[];
  createdAt: string;
  updatedAt: string;
}

// ─── Expenses ──────────────────────────────────────────────────────────────────

export interface ExpenseCategory {
  id: string;
  companyId: string;
  name: string;
  description?: string | null;
}

export interface Expense {
  id: string;
  employeeId: string;
  categoryId: string;
  amount: number;
  currency: string;
  description: string;
  receiptUrl?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID';
  notes?: string | null;
  paidInPayroll: boolean;
  payrollRunId?: string | null;
  createdAt: string;
  updatedAt: string;
  employee?: { firstName?: string; lastName?: string; employeeCode?: string } | null;
  category?: { name: string } | null;
  approvedBy?: { name: string } | null;
}

// ─── Recruitment ───────────────────────────────────────────────────────────────

export type JobStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'FILLED';
export type ApplicationStatus = 'NEW' | 'SCREENING' | 'INTERVIEWING' | 'OFFERED' | 'HIRED' | 'REJECTED' | 'WITHDRAWN';

export interface JobPosting {
  id: string;
  companyId: string;
  title: string;
  department?: string | null;
  location?: string | null;
  type?: string | null;
  description: string;
  requirements?: string | null;
  salaryRange?: string | null;
  status: JobStatus;
  postedAt?: string | null;
  closesAt?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { applications: number };
  applications?: Pick<JobApplication, 'id' | 'candidateName' | 'candidateEmail' | 'status' | 'createdAt'>[];
}

export interface CandidateSkill {
  id: string;
  applicationId: string;
  name: string;
  level?: string | null;
}

export interface CandidateExperience {
  id: string;
  applicationId: string;
  title: string;
  company?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  current?: boolean;
  durationMonths?: number | null;
  description?: string | null;
}

export interface CandidateEducation {
  id: string;
  applicationId: string;
  institution: string;
  degree?: string | null;
  field?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  gpa?: string | null;
}

export interface JobApplication {
  id: string;
  jobPostingId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string | null;
  resumeUrl?: string | null;
  resumeText?: string | null;
  coverLetter?: string | null;
  source?: string | null;
  status: ApplicationStatus;
  matchScore?: number | null;
  shortlisted?: boolean;
  shortlistedAt?: string | null;
  screeningNotes?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  jobPosting?: { title: string; department?: string | null };
  skills?: CandidateSkill[];
  experiences?: CandidateExperience[];
  educations?: CandidateEducation[];
}

export interface ScreenResult {
  applicationId: string;
  candidateName: string;
  score: number;
  shortlisted: boolean;
}

export interface ScreeningSummary {
  total: number;
  screened: number;
  shortlisted: number;
}

// ─── Recruitment (ATS) ─────────────────────────────────────────────────────────

export interface CandidateSkill {
  id: string;
  applicationId: string;
  name: string;
  level?: string | null;
}

export interface CandidateExperience {
  id: string;
  applicationId: string;
  title: string;
  company?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  current?: boolean;
  durationMonths?: number | null;
  description?: string | null;
}

export interface CandidateEducation {
  id: string;
  applicationId: string;
  institution: string;
  degree?: string | null;
  field?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  gpa?: string | null;
}

// ─── Onboarding ────────────────────────────────────────────────────────────────

export type OnboardingStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface OnboardingTemplateTask {
  id: string;
  templateId: string;
  title: string;
  description?: string | null;
  assigneeRole?: string | null;
  dueDaysFromStart?: number | null;
  order: number;
}

export interface OnboardingTemplate {
  id: string;
  companyId: string;
  name: string;
  description?: string | null;
  createdAt: string;
  tasks?: OnboardingTemplateTask[];
  _count?: { onboardings: number };
}

export interface OnboardingTask {
  id: string;
  onboardingId: string;
  title: string;
  description?: string | null;
  assigneeId?: string | null;
  dueDate?: string | null;
  completed: boolean;
  completedAt?: string | null;
  notes?: string | null;
  order: number;
}

export interface Onboarding {
  id: string;
  companyId: string;
  employeeId: string;
  templateId?: string | null;
  startDate: string;
  status: OnboardingStatus;
  buddyId?: string | null;
  notes?: string | null;
  completedAt?: string | null;
  createdAt: string;
  employee?: { firstName?: string; lastName?: string; employeeCode?: string } | null;
  template?: { name: string } | null;
  tasks?: OnboardingTask[];
  _count?: { tasks: number };
  completedTasks?: number;
}

// ─── Assets ────────────────────────────────────────────────────────────────────

export type AssetStatus = 'AVAILABLE' | 'ASSIGNED' | 'MAINTENANCE' | 'RETIRED' | 'LOST';

export interface AssetCategory {
  id: string;
  companyId: string;
  name: string;
  description?: string | null;
  _count?: { assets: number };
}

export interface Asset {
  id: string;
  companyId: string;
  categoryId: string;
  name: string;
  serialNumber?: string | null;
  model?: string | null;
  purchaseDate?: string | null;
  purchasePrice?: number | null;
  currency: string;
  status: AssetStatus;
  assignedToId?: string | null;
  assignedAt?: string | null;
  condition?: string | null;
  notes?: string | null;
  createdAt: string;
  category?: { name: string } | null;
  assignedTo?: { firstName?: string; lastName?: string; employeeCode?: string } | null;
}

// ─── Training ─────────────────────────────────────────────────────────────────

export type TrainingStatus = 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
export type EnrollmentStatus = 'ENROLLED' | 'IN_PROGRESS' | 'COMPLETED' | 'PASSED' | 'FAILED' | 'CANCELLED';

export interface TrainingCourse {
  id: string;
  companyId: string;
  title: string;
  description?: string | null;
  provider?: string | null;
  duration?: string | null;
  type?: string | null;
  cost?: number | null;
  currency: string;
  maxAttendees?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  status: TrainingStatus;
  createdAt: string;
  _count?: { enrollments: number; certificates: number };
  enrollments?: TrainingEnrollment[];
  certificates?: TrainingCertificate[];
}

export interface TrainingEnrollment {
  id: string;
  courseId: string;
  employeeId: string;
  status: EnrollmentStatus;
  enrolledAt: string;
  completedAt?: string | null;
  score?: number | null;
  notes?: string | null;
  employee?: { firstName?: string; lastName?: string; employeeCode?: string } | null;
}

export interface TrainingCertificate {
  id: string;
  courseId: string;
  employeeId: string;
  issuedAt: string;
  expiryDate?: string | null;
  certificateUrl?: string | null;
  certificateNo?: string | null;
  employee?: { firstName?: string; lastName?: string; employeeCode?: string } | null;
}

// ─── Performance ──────────────────────────────────────────────────────────────

export type GoalStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'ACHIEVED' | 'CANCELLED';
export type ReviewStatus = 'DRAFT' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'COMPLETED';

export interface PerformanceGoal {
  id: string;
  companyId: string;
  employeeId: string;
  title: string;
  description?: string | null;
  category?: string | null;
  startDate?: string | null;
  targetDate?: string | null;
  status: GoalStatus;
  progress?: number | null;
  notes?: string | null;
  createdAt: string;
  employee?: { firstName?: string; lastName?: string; employeeCode?: string } | null;
}

export interface ReviewSkill {
  id: string;
  reviewId: string;
  name: string;
  rating?: number | null;
  notes?: string | null;
}

export interface PerformanceReview {
  id: string;
  companyId: string;
  employeeId: string;
  reviewerId: string;
  period: string;
  rating?: number | null;
  summary?: string | null;
  achievements?: string | null;
  areasForImprovement?: string | null;
  employeeComments?: string | null;
  status: ReviewStatus;
  submittedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  employee?: { firstName?: string; lastName?: string; employeeCode?: string } | null;
  reviewer?: { name?: string; email?: string } | null;
  skills?: ReviewSkill[];
}

// ─── Succession ───────────────────────────────────────────────────────────────

export type SuccessionStatus = 'ACTIVE' | 'FILLED' | 'CANCELLED';
export const READINESS_OPTIONS = ['READY_NOW', 'READY_1_2_YEARS', 'READY_3_5_YEARS', 'LONG_TERM'];

export interface SuccessionPlan {
  id: string;
  companyId: string;
  positionTitle: string;
  department?: string | null;
  description?: string | null;
  status: SuccessionStatus;
  riskLevel?: string | null;
  createdAt: string;
  _count?: { candidates: number };
  candidates?: SuccessionCandidate[];
}

export interface SuccessionCandidate {
  id: string;
  planId: string;
  employeeId: string;
  readiness?: string | null;
  rating?: number | null;
  notes?: string | null;
  strengths?: string | null;
  areasForGrowth?: string | null;
  order: number;
  employee?: { firstName?: string; lastName?: string; employeeCode?: string } | null;
}

// ─── Surveys ──────────────────────────────────────────────────────────────────

export type SurveyStatus = 'DRAFT' | 'ACTIVE' | 'CLOSED';

export interface SurveyQuestion {
  id: string;
  surveyId: string;
  text: string;
  type: string;
  options?: string | null;
  required: boolean;
  order: number;
}

export interface Survey {
  id: string;
  companyId: string;
  title: string;
  description?: string | null;
  status: SurveyStatus;
  anonymous: boolean;
  dueDate?: string | null;
  createdAt: string;
  _count?: { questions: number; responses: number };
  questions?: SurveyQuestion[];
}

export interface SurveyResult {
  questionId: string;
  text: string;
  type: string;
  count?: number;
  average?: number | null;
  distribution?: { value: number; count: number }[];
  yes?: number; no?: number; total?: number;
  responses?: { value: string; count: number }[];
}

export interface SurveyResults {
  totalResponses: number;
  results: SurveyResult[];
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface AnalyticsOverview {
  employees: { total: number; active: number };
  departments: number;
  leave: { pending: number };
  payroll: { totalProcessed: number };
  recruitment: { openPostings: number; applications: number };
  training: { activeCourses: number };
  performance: { pendingReviews: number; achievedGoals: number };
  assets: { total: number };
}

export interface WorkforceData {
  departments: { name: string; count: number }[];
  employmentTypes: { type: string; count: number }[];
}

export interface AnalyticsRecruitment {
  postings: { title: string; status: string; applications: number }[];
  applicationsByStatus: { status: string; count: number }[];
}

export interface AnalyticsTraining {
  coursesByStatus: { status: string; count: number }[];
  enrollmentsByStatus: { status: string; count: number }[];
}

export interface AnalyticsPerformance {
  reviewsByStatus: { status: string; count: number }[];
  goalsByStatus: { status: string; count: number }[];
  averageRating: number | null;
}

// ─── Shifts & Roster ──────────────────────────────────────────────────────────

export interface Shift {
  id: string;
  clientId: string;
  name: string;
  code?: string | null;
  startTime: string;
  endTime: string;
  breakMinutes?: number | null;
  normalHours?: number | null;
  ot0Threshold?: number | null;
  ot1Threshold?: number | null;
  ot0Multiplier?: number | null;
  ot1Multiplier?: number | null;
  ot2Multiplier?: number | null;
  isOvernight?: boolean;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RosterEntry {
  id: string;
  employeeId: string;
  shiftId: string;
  date: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Attendance ───────────────────────────────────────────────────────────────

export interface AttendanceLog {
  id: string;
  employeeId: string;
  deviceId?: string | null;
  deviceUserId?: string | null;
  timestamp: string;
  punchTime?: string | null;
  punchType?: string | null;
  type?: 'IN' | 'OUT' | string;
  source?: string | null;
  processed?: boolean;
  employee?: { firstName?: string; lastName?: string; employeeCode?: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceSummary {
  id?: string;
  employeeId: string;
  date: string;
  checkIn?: string | null;
  checkOut?: string | null;
  clockIn?: string | null;
  clockOut?: string | null;
  hoursWorked?: number | null;
  overtime?: number | null;
  breakMinutes?: number | null;
  normalMinutes?: number | null;
  ot0Minutes?: number | null;
  ot1Minutes?: number | null;
  ot2Minutes?: number | null;
  status?: string | null;
  isManualOverride?: boolean;
  isPublicHoliday?: boolean;
  employee?: { firstName?: string; lastName?: string; employeeCode?: string } | null;
}

// ─── Devices ──────────────────────────────────────────────────────────────────

export interface Device {
  id: string;
  clientId: string;
  name: string;
  vendor?: string | null;
  ipAddress?: string | null;
  port?: number | null;
  username?: string | null;
  password?: string | null;
  location?: string | null;
  serialNumber?: string | null;
  webhookKey?: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'ERROR' | string;
  isActive?: boolean;
  lastSync?: string | null;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  _count?: { logs?: number } | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Payroll Support ──────────────────────────────────────────────────────────

export interface PayrollLog {
  id: string;
  payrollRunId: string;
  action: string;
  message?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  userId?: string | null;
  createdAt: string;
}

export interface PayrollUser {
  id: string;
  clientId: string;
  userId: string;
  role: string;
  companyIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface NSSAContribution {
  id: string;
  payrollRunId: string;
  employeeId: string;
  employeeContribution: number;
  employerContribution: number;
  submittedToNSSA?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SalaryStructure {
  id: string;
  employeeId: string;
  transactionCodeId: string;
  value: number;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  isActive?: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Documents (renamed to avoid conflict with browser DOM Document) ──────────

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  name: string;
  type?: string | null;
  url: string;
  fileUrl?: string | null;
  size?: number | null;
  createdAt: string;
  updatedAt: string;
}

// Alias for backwards compatibility
export type Document = EmployeeDocument;
