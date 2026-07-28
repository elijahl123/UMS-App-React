import Stripe from 'stripe';

export function isMissingStripeCustomerError(err: unknown): boolean {
  if (!(err instanceof Stripe.errors.StripeInvalidRequestError)) {
    return false;
  }

  return err.code === 'resource_missing' && err.param === 'customer';
}
