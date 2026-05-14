import { Hono } from 'hono';
import { prisma } from '../lib/prisma';

type Env = {
  STRIPE_WEBHOOK_SECRET?: string;
};

const router = new Hono<{ Bindings: Env }>();

async function verifyStripeSignature(
  payload: string,
  sigHeader: string | null,
  webhookSecret: string,
): Promise<Record<string, any> | null> {
  if (!sigHeader) return null;

  const parts = sigHeader.split(',');
  let timestamp = '';
  let signature = '';
  for (const p of parts) {
    const [k, v] = p.split('=');
    if (k === 't') timestamp = v;
    if (k === 'v1') signature = v;
  }
  if (!timestamp || !signature) return null;

  const signedPayload = `${timestamp}.${payload}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(webhookSecret), { name: 'HMAC', hash: 'SHA-256' },
    false, ['verify'],
  );
  const sigBytes = hexToBytes(signature);
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(signedPayload));
  if (!valid) return null;

  return JSON.parse(payload);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

router.post('/stripe', async (c) => {
  const webhookSecret = c.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return c.json({ message: 'Webhook not configured' }, 500);
  }

  try {
    const payload = await c.req.text();
    const sigHeader = c.req.header('stripe-signature') || null;
    const event = await verifyStripeSignature(payload, sigHeader, webhookSecret);
    if (!event) {
      return c.json({ message: 'Webhook signature verification failed' }, 400);
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const { clientId, plan, billingCycle } = session.metadata || {};
        if (clientId && session.subscription) {
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
        const deletedSub = event.data.object;
        await prisma.subscription.updateMany({
          where: { stripeSubId: deletedSub.id },
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
        const failedInvoice = event.data.object;
        console.warn(`Payment failed for subscription ${failedInvoice.subscription} — customer ${failedInvoice.customer}`);
        break;
      }

      default:
        break;
    }

    return c.json({ received: true });
  } catch (err: any) {
    console.error('Webhook handler error:', err);
    return c.json({ message: 'Webhook processing failed' }, 500);
  }
});

export default router;
