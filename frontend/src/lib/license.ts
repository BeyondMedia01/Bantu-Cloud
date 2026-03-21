import api from '../api/client';

export interface LicenseValidationResult {
  valid: boolean;
  clientId?: string;
  clientName?: string;
  message?: string;
}

export async function validateLicense(token: string): Promise<LicenseValidationResult> {
  try {
    const res = await api.post('/license/validate', { token });
    return res.data;
  } catch (err: any) {
    return { valid: false, message: err.response?.data?.message || 'Validation failed' };
  }
}
