import { http } from './http';
import type {
  Shift, RosterEntry, AttendanceLog, AttendanceSummary, Device,
} from '../types/domain';

export const ShiftAPI = {
  getAll: (params?: Record<string, string>) => http.get<Shift[]>('/shifts', { params }),
  getById: (id: string) => http.get<Shift>(`/shifts/${id}`),
  create: (data: Partial<Shift>) => http.post<Shift>('/shifts', data),
  update: (id: string, data: Partial<Shift>) => http.put<Shift>(`/shifts/${id}`, data),
  delete: (id: string) => http.delete(`/shifts/${id}`),
};

export const RosterAPI = {
  getAll: (params?: Record<string, string>) => http.get<RosterEntry[]>('/roster', { params }),
  getCalendar: (startDate: string, endDate: string) =>
    http.get<Record<string, RosterEntry[]>>('/roster/calendar', { params: { startDate, endDate } }),
  assign: (data: { employeeIds: string[]; shiftId: string; startDate: string; endDate?: string; daysOfWeek?: number[]; notes?: string }) =>
    http.post('/roster', data),
  update: (id: string, data: Partial<RosterEntry>) => http.put<RosterEntry>(`/roster/${id}`, data),
  delete: (id: string) => http.delete(`/roster/${id}`),
};

export const AttendanceAPI = {
  getAll: (params?: Record<string, string>) => http.get<any>('/attendance', { params }),
  getLogs: (params?: Record<string, string>) => http.get<any>('/attendance/logs', { params }),
  getSummary: (startDate: string, endDate: string) =>
    http.get<AttendanceSummary[]>('/attendance/summary', { params: { startDate, endDate } }),
  process: (data: { startDate: string; endDate: string; employeeIds?: string[] }) =>
    http.post('/attendance/process', data),
  manual: (data: Partial<AttendanceLog>) => http.post<AttendanceLog>('/attendance/manual', data),
  update: (id: string, data: Partial<AttendanceLog>) => http.put<AttendanceLog>(`/attendance/${id}`, data),
  generateInputs: (data: {
    startDate: string; endDate: string; period: string;
    normalTcId?: string; ot0TcId?: string; ot1TcId?: string; ot2TcId?: string;
    payrollRunId?: string; employeeIds?: string[];
  }) => http.post('/attendance/generate-inputs', data),
};

export const DeviceAPI = {
  getAll: (params?: Record<string, string>) => http.get<Device[]>('/devices', { params }),
  getById: (id: string) => http.get<Device>(`/devices/${id}`),
  create: (data: Partial<Device>) => http.post<Device>('/devices', data),
  update: (id: string, data: Partial<Device>) => http.put<Device>(`/devices/${id}`, data),
  delete: (id: string) => http.delete(`/devices/${id}`),
  sync: (id: string, data?: Record<string, unknown>) => http.post(`/devices/${id}/sync`, data),
  test: (id: string) => http.post(`/devices/${id}/test`),
};
