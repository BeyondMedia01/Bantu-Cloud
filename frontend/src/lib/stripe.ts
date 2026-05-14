import { http } from '../api/http';

export async function createCheckoutSession(plan: string, billingCycle = 'MONTHLY'): Promise<string> {
  const res = await http.post('/subscription/create', { plan, billingCycle });
  return res.data.url;
}

export async function getCustomerPortalUrl(): Promise<string> {
  const res = await http.get('/subscription/portal');
  return res.data.url;
}
