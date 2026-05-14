import { http } from '../api/http';

export interface LicenseValidationResult {
  valid: boolean;
  clientId?: string;
  clientName?: string;
  message?: string;
}

export async function validateLicense(token: string): Promise<LicenseValidationResult> {
  try {
    const res = await http.post('/license/validate', { token });
    return res.data;
  } catch (err: any) {
    return { valid: false, message: err.message || 'Validation failed' };
  }
}
