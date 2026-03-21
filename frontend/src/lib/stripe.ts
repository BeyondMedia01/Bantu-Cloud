import api from '../api/client';

export async function createCheckoutSession(plan: string, billingCycle = 'MONTHLY'): Promise<string> {
  const res = await api.post('/subscription/create', { plan, billingCycle });
  return res.data.url;
}

export async function getCustomerPortalUrl(): Promise<string> {
  const res = await api.get('/subscription/portal');
  return res.data.url;
}
