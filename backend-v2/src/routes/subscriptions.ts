import { Hono } from 'hono';
import { prisma } from '../lib/prisma';
import { requireRole } from '../lib/auth';

type Env = {
  STRIPE_SECRET_KEY?: string;
  STRIPE_PRICE_BASIC_MONTHLY?: string;
  STRIPE_PRICE_STANDARD_MONTHLY?: string;
  STRIPE_PRICE_PREMIUM_MONTHLY?: string;
  STRIPE_PRICE_ENTERPRISE_MONTHLY?: string;
  STRIPE_PRICE_BASIC_ANNUALLY?: string;
  STRIPE_PRICE_STANDARD_ANNUALLY?: string;
  STRIPE_PRICE_PREMIUM_ANNUALLY?: string;
  STRIPE_PRICE_ENTERPRISE_ANNUALLY?: string;
  FRONTEND_URL?: string;
};

const router = new Hono<{ Bindings: Env }>();

const FRONTEND_URL = 'https://payroll.thinkbantu.com';

async function getStripe(env: Env) {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured');
  }
  const Stripe = (await Function('return import("stripe")')())?.default;
  if (!Stripe) throw new Error('Stripe SDK not installed');
  return new Stripe(env.STRIPE_SECRET_KEY);
}

const PRICE_MAP_KEYS: Record<string, keyof Env> = {
  BASIC_MONTHLY: 'STRIPE_PRICE_BASIC_MONTHLY',
  STANDARD_MONTHLY: 'STRIPE_PRICE_STANDARD_MONTHLY',
  PREMIUM_MONTHLY: 'STRIPE_PRICE_PREMIUM_MONTHLY',
  ENTERPRISE_MONTHLY: 'STRIPE_PRICE_ENTERPRISE_MONTHLY',
  BASIC_ANNUALLY: 'STRIPE_PRICE_BASIC_ANNUALLY',
  STANDARD_ANNUALLY: 'STRIPE_PRICE_STANDARD_ANNUALLY',
  PREMIUM_ANNUALLY: 'STRIPE_PRICE_PREMIUM_ANNUALLY',
  ENTERPRISE_ANNUALLY: 'STRIPE_PRICE_ENTERPRISE_ANNUALLY',
};

const UPGRADE_PRICE_MAP_KEYS: Record<string, keyof Env> = {
  BASIC: 'STRIPE_PRICE_BASIC_MONTHLY',
  STANDARD: 'STRIPE_PRICE_STANDARD_MONTHLY',
  PREMIUM: 'STRIPE_PRICE_PREMIUM_MONTHLY',
  ENTERPRISE: 'STRIPE_PRICE_ENTERPRISE_MONTHLY',
};

router.get('/', async (c) => {
  const clientId = c.get('clientId');
  if (!clientId) return c.json({ active: false });

  try {
    const subscription = await prisma.subscription.findUnique({ where: { clientId } });
    if (!subscription) return c.json({ active: false });

    const employeeCount = await prisma.employee.count({
      where: { company: { clientId } },
    });

    return c.json({
      ...subscription,
      employeeCount,
      atCap: subscription.employeeCap ? employeeCount >= subscription.employeeCap : false,
    });
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/usage', async (c) => {
  const clientId = c.get('clientId');
  if (!clientId) return c.json({ message: 'Client context required' }, 400);

  try {
    const [subscription, employeeCount] = await Promise.all([
      prisma.subscription.findUnique({ where: { clientId } }),
      prisma.employee.count({ where: { company: { clientId } } }),
    ]);

    return c.json({
      employeeCount,
      employeeCap: subscription?.employeeCap ?? null,
      plan: subscription?.plan ?? null,
      isActive: subscription?.isActive ?? false,
    });
  } catch (err) {
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.post('/create', requireRole('CLIENT_ADMIN', 'PLATFORM_ADMIN'), async (c) => {
  const clientId = c.get('clientId');
  if (!clientId) return c.json({ message: 'Client context required' }, 400);

  try {
    const { plan, billingCycle = 'MONTHLY' } = await c.req.json();
    if (!plan) return c.json({ message: 'plan is required' }, 400);

    const stripe = await getStripe(c.env);

    const priceKey = PRICE_MAP_KEYS[`${plan}_${billingCycle}`];
    const priceId = priceKey ? c.env[priceKey] : undefined;
    if (!priceId) {
      return c.json({ message: `No Stripe price configured for ${plan} ${billingCycle}` }, 400);
    }

    const client = await prisma.client.findUnique({ where: { id: clientId } });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { clientId, plan, billingCycle },
      success_url: `${c.env.FRONTEND_URL || FRONTEND_URL}/subscription?success=true`,
      cancel_url: `${c.env.FRONTEND_URL || FRONTEND_URL}/subscription?cancelled=true`,
    });

    return c.json({ url: session.url, sessionId: session.id });
  } catch (err: any) {
    if (err.message?.includes('Stripe is not configured')) {
      return c.json({ message: err.message }, 503);
    }
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.post('/upgrade', requireRole('CLIENT_ADMIN', 'PLATFORM_ADMIN'), async (c) => {
  const clientId = c.get('clientId');
  if (!clientId) return c.json({ message: 'Client context required' }, 400);

  try {
    const { plan } = await c.req.json();
    const stripe = await getStripe(c.env);

    const subscription = await prisma.subscription.findUnique({ where: { clientId } });
    if (!subscription?.stripeSubId) {
      return c.json({ message: 'No active Stripe subscription found' }, 400);
    }

    const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubId);
    const itemId = stripeSub.items.data[0]?.id;
    if (!itemId) return c.json({ message: 'Could not find subscription item' }, 400);

    const priceKey = UPGRADE_PRICE_MAP_KEYS[plan];
    const priceId = priceKey ? c.env[priceKey] : undefined;
    if (!priceId) return c.json({ message: `No Stripe price configured for ${plan}` }, 400);

    await stripe.subscriptions.update(subscription.stripeSubId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: 'always_invoice',
    });

    const updated = await prisma.subscription.update({
      where: { clientId },
      data: { plan },
    });

    return c.json(updated);
  } catch (err: any) {
    if (err.message?.includes('Stripe is not configured')) {
      return c.json({ message: err.message }, 503);
    }
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

router.get('/portal', requireRole('CLIENT_ADMIN', 'PLATFORM_ADMIN'), async (c) => {
  const clientId = c.get('clientId');
  if (!clientId) return c.json({ message: 'Client context required' }, 400);

  try {
    const stripe = await getStripe(c.env);
    const subscription = await prisma.subscription.findUnique({ where: { clientId } });
    if (!subscription?.stripeCustomerId) {
      return c.json({ message: 'No Stripe customer found' }, 400);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${c.env.FRONTEND_URL || FRONTEND_URL}/subscription`,
    });

    return c.json({ url: session.url });
  } catch (err: any) {
    if (err.message?.includes('Stripe is not configured')) {
      return c.json({ message: err.message }, 503);
    }
    console.error(err);
    return c.json({ message: 'Internal server error' }, 500);
  }
});

export default router;
