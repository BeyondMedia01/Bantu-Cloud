import { http } from './http';

export interface TrialStatus {
  status: 'ACTIVE' | 'EXPIRED' | 'CONVERTED';
  expiresAt: string;
  daysRemaining: number;
  onboardingStep: number;
  employeeCap: number;
  employeeCount: number;
}

export interface TrialStatusResponse {
  trial: TrialStatus | null;
}

export const TrialAPI = {
  getStatus: () => http.get<TrialStatusResponse>('/trial/status'),
  advanceStep: (step: number) =>
    http.patch<{ onboardingStep: number }>('/trial/onboarding-step', { step }),
  upgradeRequest: (data: { name: string; message: string }) =>
    http.post<{ sent: boolean }>('/trial/upgrade-request', data),
};
