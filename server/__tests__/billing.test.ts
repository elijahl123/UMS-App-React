import Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { isMissingStripeCustomerError } from '../stripeErrors';

describe('Stripe customer recovery', () => {
  it('recognizes a missing customer response that can be repaired', () => {
    const err = new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      message: "No such customer: 'cus_missing'",
      code: 'resource_missing',
      param: 'customer',
    });

    expect(isMissingStripeCustomerError(err)).toBe(true);
  });

  it('does not hide unrelated Stripe request failures', () => {
    const err = new Stripe.errors.StripeInvalidRequestError({
      type: 'invalid_request_error',
      message: 'No such price',
      code: 'resource_missing',
      param: 'items[0][price]',
    });

    expect(isMissingStripeCustomerError(err)).toBe(false);
    expect(isMissingStripeCustomerError(new Error('network failure'))).toBe(false);
  });
});
