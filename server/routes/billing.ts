import { Router, type Request, type Response } from 'express';
import Stripe from 'stripe';
import { config } from '../config';
import { ApiError, required } from '../errors';
import {
  formatPaymentMethod,
  getBillingReference,
  getBillingStatus,
  getDefaultPaymentMethodForUser,
  getOrCreateCustomer,
  isSubscribed,
  priceIdForInterval,
  stripeClient,
  subscriptionPeriodEnd,
  updateSubscriptionByStripeSubscription,
  upsertSubscriptionForUser,
  type BillingInterval,
} from '../billing';

export const billingRouter = Router();
export const billingWebhookRouter = Router();

function errorResponse(res: Response, err: unknown) {
  console.error('[Billing] Request failed:', err);
  const message = err instanceof Error ? err.message : 'SERVER_ERROR';
  const status = err instanceof ApiError ? err.status : 500;
  return res.status(status).json({ error: { message } });
}

function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'yearly';
}

function publicPriceConfig() {
  return {
    publishableKey: config.stripePublishableKey ?? null,
    prices: {
      monthly: config.stripeMonthlyPriceId ?? null,
      yearly: config.stripeYearlyPriceId ?? null,
    },
  };
}

billingRouter.get('/config', (_req, res) => {
  res.json(publicPriceConfig());
});

billingRouter.get('/status', async (req, res) => {
  try {
    const userId = required(req.query, 'userId') as string;
    const status = await getBillingStatus(userId);
    return res.json(status);
  } catch (err) {
    return errorResponse(res, err);
  }
});

billingRouter.get('/status/refresh', async (req, res) => {
  try {
    const userId = required(req.query, 'userId') as string;
    const status = await getBillingStatus(userId);
    if (status.stripeSubscriptionId) {
      const subscription = await stripeClient().subscriptions.retrieve(status.stripeSubscriptionId);
      await updateSubscriptionByStripeSubscription(subscription);
      return res.json(await getBillingStatus(userId));
    }
    return res.json(status);
  } catch (err) {
    return errorResponse(res, err);
  }
});

billingRouter.post('/create-subscription', async (req, res) => {
  try {
    const userId = required(req.body, 'userId') as string;
    const email = required(req.body, 'email') as string;
    const interval = req.body.interval;

    if (!isBillingInterval(interval)) {
      throw new ApiError('interval must be monthly or yearly', 400);
    }

    const currentStatus = await getBillingStatus(userId);
    if (isSubscribed(currentStatus.status)) {
      return res.json({ alreadySubscribed: true, status: currentStatus });
    }

    const priceId = priceIdForInterval(interval);
    const customerId = await getOrCreateCustomer({
      userId,
      email,
      name: req.body.name as string | undefined,
    });

    const stripe = stripeClient();
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
      },
      metadata: {
        firebase_user_id: userId,
      },
      expand: ['latest_invoice.confirmation_secret', 'pending_setup_intent'],
    });

    const latestInvoice = typeof subscription.latest_invoice === 'string' ? null : (subscription.latest_invoice as Stripe.Invoice | null);
    const setupIntent = subscription.pending_setup_intent as Stripe.SetupIntent | null | undefined;
    const clientSecret = latestInvoice?.confirmation_secret?.client_secret ?? setupIntent?.client_secret;

    if (!clientSecret) {
      throw new ApiError('Unable to start Stripe payment. No client secret was returned.', 500);
    }

    await upsertSubscriptionForUser({
      userId,
      email,
      customerId,
      subscriptionId: subscription.id,
      priceId,
      status: subscription.status,
      currentPeriodEnd: subscriptionPeriodEnd(subscription),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    });

    return res.json({
      clientSecret,
      subscriptionId: subscription.id,
      status: subscription.status,
      publishableKey: config.stripePublishableKey ?? null,
    });
  } catch (err) {
    return errorResponse(res, err);
  }
});

billingRouter.post('/cancel-subscription', async (req, res) => {
  try {
    const userId = required(req.body, 'userId') as string;
    const status = await getBillingStatus(userId);

    if (!status.stripeSubscriptionId) {
      throw new ApiError('No subscription found for this user.', 404);
    }

    const subscription = await stripeClient().subscriptions.update(status.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });
    await updateSubscriptionByStripeSubscription(subscription);

    return res.json(await getBillingStatus(userId));
  } catch (err) {
    return errorResponse(res, err);
  }
});

billingRouter.post('/resume-subscription', async (req, res) => {
  try {
    const userId = required(req.body, 'userId') as string;
    const status = await getBillingStatus(userId);

    if (!status.stripeSubscriptionId) {
      throw new ApiError('No subscription found for this user.', 404);
    }

    const subscription = await stripeClient().subscriptions.update(status.stripeSubscriptionId, {
      cancel_at_period_end: false,
    });
    await updateSubscriptionByStripeSubscription(subscription);

    return res.json(await getBillingStatus(userId));
  } catch (err) {
    return errorResponse(res, err);
  }
});

billingRouter.post('/update-subscription', async (req, res) => {
  try {
    const userId = required(req.body, 'userId') as string;
    const interval = req.body.interval;

    if (!isBillingInterval(interval)) {
      throw new ApiError('interval must be monthly or yearly', 400);
    }

    const status = await getBillingStatus(userId);
    if (!status.stripeSubscriptionId) {
      throw new ApiError('No subscription found for this user.', 404);
    }

    const priceId = priceIdForInterval(interval);
    const stripe = stripeClient();
    const existing = await stripe.subscriptions.retrieve(status.stripeSubscriptionId);
    const item = existing.items.data[0];

    if (!item) {
      throw new ApiError('This subscription has no editable subscription item.', 500);
    }

    if (item.price.id === priceId && !existing.cancel_at_period_end) {
      return res.json(status);
    }

    if (existing.cancel_at_period_end) {
      await stripe.subscriptions.update(existing.id, {
        cancel_at_period_end: false,
      });
    }

    const subscription = await stripe.subscriptions.update(existing.id, {
      items: [
        {
          id: item.id,
          price: priceId,
        },
      ],
      payment_behavior: 'pending_if_incomplete',
      proration_behavior: 'create_prorations',
    });

    await updateSubscriptionByStripeSubscription(subscription);
    return res.json(await getBillingStatus(userId));
  } catch (err) {
    return errorResponse(res, err);
  }
});

billingRouter.get('/payment-method', async (req, res) => {
  try {
    const userId = required(req.query, 'userId') as string;
    return res.json({ paymentMethod: await getDefaultPaymentMethodForUser(userId) });
  } catch (err) {
    return errorResponse(res, err);
  }
});

billingRouter.post('/payment-method/setup-intent', async (req, res) => {
  try {
    const userId = required(req.body, 'userId') as string;
    const reference = await getBillingReference(userId);

    if (!reference.customerId) {
      throw new ApiError('No Stripe customer found for this user.', 404);
    }

    const setupIntent = await stripeClient().setupIntents.create({
      customer: reference.customerId,
      usage: 'off_session',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        firebase_user_id: userId,
      },
    });

    if (!setupIntent.client_secret) {
      throw new ApiError('Unable to start Stripe payment method update. No client secret was returned.', 500);
    }

    return res.json({ clientSecret: setupIntent.client_secret });
  } catch (err) {
    return errorResponse(res, err);
  }
});

billingRouter.post('/payment-method', async (req, res) => {
  try {
    const userId = required(req.body, 'userId') as string;
    const setupIntentId = required(req.body, 'setupIntentId') as string;
    const reference = await getBillingReference(userId);

    if (!reference.customerId) {
      throw new ApiError('No Stripe customer found for this user.', 404);
    }

    const stripe = stripeClient();
    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);
    const setupCustomerId = typeof setupIntent.customer === 'string' ? setupIntent.customer : setupIntent.customer?.id;

    if (setupCustomerId !== reference.customerId) {
      throw new ApiError('Payment method update does not belong to this user.', 403);
    }

    if (setupIntent.status !== 'succeeded') {
      throw new ApiError('Payment method setup is not complete.', 400);
    }

    const paymentMethodId = typeof setupIntent.payment_method === 'string' ? setupIntent.payment_method : setupIntent.payment_method?.id;
    if (!paymentMethodId) {
      throw new ApiError('Stripe did not return a payment method.', 500);
    }

    await stripe.customers.update(reference.customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    if (reference.subscriptionId) {
      await stripe.subscriptions.update(reference.subscriptionId, {
        default_payment_method: paymentMethodId,
      });
    }

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    return res.json({ paymentMethod: formatPaymentMethod(paymentMethod) });
  } catch (err) {
    return errorResponse(res, err);
  }
});

billingWebhookRouter.post('/', async (req: Request, res: Response) => {
  if (!config.stripeWebhookSecret) {
    return res.status(500).json({ error: { message: 'STRIPE_WEBHOOK_SECRET is required' } });
  }

  const signature = req.header('stripe-signature');
  if (!signature) {
    return res.status(400).json({ error: { message: 'Missing Stripe signature' } });
  }

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(req.body, signature, config.stripeWebhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid webhook signature';
    return res.status(400).json({ error: { message } });
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await updateSubscriptionByStripeSubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        break;
    }
    return res.json({ received: true });
  } catch (err) {
    return errorResponse(res, err);
  }
});
