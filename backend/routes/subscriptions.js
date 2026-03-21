const express = require('express');
const prisma = require('../lib/prisma');
const { requireRole } = require('../lib/auth');

const router = express.Router();

// Helper — get Stripe instance lazily (only if STRIPE_SECRET_KEY is set)
function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in .env');
  }
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// GET /api/subscription — current subscription status
router.get('/', async (req, res) => {
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });

  try {
    const subscription = await prisma.subscription.findUnique({
      where: { clientId: req.clientId },
    });

    if (!subscription) return res.json({ active: false });

    const employeeCount = await prisma.employee.count({
      where: { company: { clientId: req.clientId } },
    });

    res.json({
      ...subscription,
      employeeCount,
      atCap: subscription.employeeCap ? employeeCount >= subscription.employeeCap : false,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/subscription/usage — employee count vs cap
router.get('/usage', async (req, res) => {
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });

  try {
    const [subscription, employeeCount] = await Promise.all([
      prisma.subscription.findUnique({ where: { clientId: req.clientId } }),
      prisma.employee.count({ where: { company: { clientId: req.clientId } } }),
    ]);

    res.json({
      employeeCount,
      employeeCap: subscription?.employeeCap ?? null,
      plan: subscription?.plan ?? null,
      isActive: subscription?.isActive ?? false,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/subscription/create — create Stripe checkout session
router.post('/create', requireRole('CLIENT_ADMIN', 'PLATFORM_ADMIN'), async (req, res) => {
  const { plan, billingCycle = 'MONTHLY' } = req.body;
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });
  if (!plan) return res.status(400).json({ message: 'plan is required' });

  try {
    const stripe = getStripe();
    const client = await prisma.client.findUnique({ where: { id: req.clientId } });

    const PRICE_MAP = {
      BASIC_MONTHLY: process.env.STRIPE_PRICE_BASIC_MONTHLY,
      STANDARD_MONTHLY: process.env.STRIPE_PRICE_STANDARD_MONTHLY,
      PREMIUM_MONTHLY: process.env.STRIPE_PRICE_PREMIUM_MONTHLY,
      ENTERPRISE_MONTHLY: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
      BASIC_ANNUALLY: process.env.STRIPE_PRICE_BASIC_ANNUALLY,
      STANDARD_ANNUALLY: process.env.STRIPE_PRICE_STANDARD_ANNUALLY,
      PREMIUM_ANNUALLY: process.env.STRIPE_PRICE_PREMIUM_ANNUALLY,
      ENTERPRISE_ANNUALLY: process.env.STRIPE_PRICE_ENTERPRISE_ANNUALLY,
    };

    const priceId = PRICE_MAP[`${plan}_${billingCycle}`];
    if (!priceId) return res.status(400).json({ message: `No Stripe price configured for ${plan} ${billingCycle}` });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      metadata: { clientId: req.clientId, plan, billingCycle },
      success_url: `${process.env.FRONTEND_URL}/subscription?success=true`,
      cancel_url: `${process.env.FRONTEND_URL}/subscription?cancelled=true`,
      customer_email: client?.email || req.user.email,
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (error) {
    if (error.message.includes('Stripe is not configured')) {
      return res.status(503).json({ message: error.message });
    }
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/subscription/upgrade — upgrade/change plan
router.post('/upgrade', requireRole('CLIENT_ADMIN', 'PLATFORM_ADMIN'), async (req, res) => {
  const { plan } = req.body;
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });

  try {
    const stripe = getStripe();
    const subscription = await prisma.subscription.findUnique({ where: { clientId: req.clientId } });
    if (!subscription?.stripeSubId) {
      return res.status(400).json({ message: 'No active Stripe subscription found' });
    }

    const stripeSub = await stripe.subscriptions.retrieve(subscription.stripeSubId);
    const itemId = stripeSub.items.data[0]?.id;
    if (!itemId) return res.status(400).json({ message: 'Could not find subscription item' });

    const PRICE_MAP = {
      BASIC: process.env.STRIPE_PRICE_BASIC_MONTHLY,
      STANDARD: process.env.STRIPE_PRICE_STANDARD_MONTHLY,
      PREMIUM: process.env.STRIPE_PRICE_PREMIUM_MONTHLY,
      ENTERPRISE: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY,
    };

    const priceId = PRICE_MAP[plan];
    if (!priceId) return res.status(400).json({ message: `No Stripe price configured for ${plan}` });

    await stripe.subscriptions.update(subscription.stripeSubId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: 'always_invoice',
    });

    const updated = await prisma.subscription.update({
      where: { clientId: req.clientId },
      data: { plan },
    });

    res.json(updated);
  } catch (error) {
    if (error.message.includes('Stripe is not configured')) {
      return res.status(503).json({ message: error.message });
    }
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// GET /api/subscription/portal — Stripe customer portal URL
router.get('/portal', requireRole('CLIENT_ADMIN', 'PLATFORM_ADMIN'), async (req, res) => {
  if (!req.clientId) return res.status(400).json({ message: 'Client context required' });

  try {
    const stripe = getStripe();
    const subscription = await prisma.subscription.findUnique({ where: { clientId: req.clientId } });
    if (!subscription?.stripeCustomerId) {
      return res.status(400).json({ message: 'No Stripe customer found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/subscription`,
    });

    res.json({ url: session.url });
  } catch (error) {
    if (error.message.includes('Stripe is not configured')) {
      return res.status(503).json({ message: error.message });
    }
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// POST /api/subscription/webhook — Stripe webhook
// NOTE: This route needs raw body — mount separately in index.js with express.raw()
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ message: 'Stripe webhook not configured' });
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ message: `Webhook error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { clientId, plan, billingCycle } = session.metadata || {};
        if (!clientId) break;

        const stripeSub = await getStripe().subscriptions.retrieve(session.subscription);
        await prisma.subscription.upsert({
          where: { clientId },
          create: {
            clientId,
            stripeSubId: session.subscription,
            stripeCustomerId: session.customer,
            plan: plan || 'BASIC',
            billingCycle: billingCycle || 'MONTHLY',
            isActive: true,
            startDate: new Date(),
          },
          update: {
            stripeSubId: session.subscription,
            stripeCustomerId: session.customer,
            plan: plan || 'BASIC',
            billingCycle: billingCycle || 'MONTHLY',
            isActive: true,
            endDate: stripeSub.current_period_end
              ? new Date(stripeSub.current_period_end * 1000)
              : null,
          },
        });
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await prisma.subscription.updateMany({
          where: { stripeSubId: sub.id },
          data: { isActive: false, endDate: new Date() },
        });
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        await prisma.subscription.updateMany({
          where: { stripeSubId: invoice.subscription },
          data: { isActive: true },
        });
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await prisma.subscription.updateMany({
          where: { stripeSubId: invoice.subscription },
          data: { isActive: false },
        });
        break;
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
});

module.exports = router;
