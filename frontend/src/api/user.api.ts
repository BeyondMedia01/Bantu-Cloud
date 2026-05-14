import { http } from './http';

export const UserAPI = {
  me: () => http.get<{ id: string; name: string; email: string; role: string; preferences?: any }>('/user/me'),
  companies: () => http.get('/user/companies'),
  update: (data: { name?: string; preferences?: any }) => http.put('/user/me', data),
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    http.put('/user/change-password', data),
};

export const EmployeeSelfAPI = {
  getProfile: () => http.get('/employee/profile'),
  updateProfile: (data: any) => http.put('/employee/profile', data),
  getPayslips: () => http.get('/employee/payslips'),
  getLeave: () => http.get('/employee/leave'),
  getAttendance: (params?: Record<string, string>) => http.get('/employee/attendance', { params }),
  getDocuments: () => http.get('/employee/documents'),
};
