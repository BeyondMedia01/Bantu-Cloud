import { http } from './http';
import type { Loan, LoanRepayment } from '../types/domain';

export const LoanAPI = {
  getAll: (params?: Record<string, string>) => http.get<Loan[]>('/loans', { params }),
  getById: (id: string) => http.get<Loan>(`/loans/${id}`),
  create: (data: Partial<Loan>) => http.post<Loan>('/loans', data),
  update: (id: string, data: Partial<Loan>) => http.put<Loan>(`/loans/${id}`, data),
  delete: (id: string) => http.delete(`/loans/${id}`),
  getRepayments: (id: string) => http.get<LoanRepayment[]>(`/loans/${id}/repayments`),
  markRepaymentPaid: (repaymentId: string) =>
    http.patch(`/loans/repayments/${repaymentId}`),
};
