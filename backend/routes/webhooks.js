const express = require('express');
const prisma = require('../lib/prisma');

const router = express.Router();

// POST /api/webhooks/stripe
// Must be mounted BEFORE express.json() so we receive the raw body for sig verification.
// index.js mounts this with express.raw({ type: 'application/json' }).
router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ message: 'Webhook not configured' });
  }

  let event;
  try {
    // Lazy-load stripe to avoid crashing if STRIPE_SECRET_KEY is absent at startup
    const Stripe = require('stripe');
    const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err.message);
    return res.status(400).json({ message: `Webhook error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const clientId = session.metadata?.clientId;
        if (clientId && session.subscription) {
          await prisma.subscription.upsert({
            where: { clientId },
            create: {
              clientId,
              stripeSubId: session.subscription,
              stripeCustomerId: session.customer,
              isActive: true,
            },
            update: {
              stripeSubId: session.subscription,
              stripeCustomerId: session.customer,
              isActive: true,
            },
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        await prisma.subscription.updateMany({
          where: { stripeSubId: sub.id },
          data: {
            isActive: sub.status === 'active' || sub.status === 'trialing',
            endDate: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
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
        console.warn(`Payment failed for subscription ${invoice.subscription} — customer ${invoice.customer}`);
        // Subscription stays active through Stripe's dunning grace period.
        // After max retries Stripe fires customer.subscription.deleted.
        break;
      }

      default:
        // Unhandled event types are fine — just acknowledge receipt
        break;
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(500).json({ message: 'Webhook processing failed' });
  }
});

module.exports = router;
