import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type StripeElementsOptions } from '@stripe/stripe-js';
import { ArrowLeft, Check, CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { appEnv } from '@/app/lib/env';
import {
  cancelSubscription,
  createPaymentMethodSetupIntent,
  createSubscription,
  getBillingConfig,
  getPaymentMethod,
  refreshBillingStatus,
  resumeSubscription,
  savePaymentMethod,
  updateSubscriptionPlan,
  type BillingConfig,
  type BillingInterval,
  type BillingPaymentMethod,
  type BillingStatus,
} from '@/app/lib/billing/client';

const isProductionApp = appEnv === 'production';
const showStripeTestCardHelp = !isProductionApp;

const planCopy: Record<BillingInterval, { title: string; price: string; cadence: string; note: string }> = {
  monthly: {
    title: 'Monthly',
    price: '$6',
    cadence: 'per month',
    note: 'Flexible month-to-month access.',
  },
  yearly: {
    title: 'Yearly',
    price: '$60',
    cadence: 'per year',
    note: 'Best value for the full school year.',
  },
};

function CheckoutForm({ onComplete }: { onComplete: () => Promise<void> }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/#/billing?payment=complete`,
        },
        redirect: 'if_required',
      });

      if (result.error) {
        setError(result.error.message ?? 'Payment could not be confirmed.');
        return;
      }

      await onComplete();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement />
      {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
      <Button type="submit" className="gap-2" disabled={!stripe || submitting}>
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        {submitting ? 'Confirming...' : 'Subscribe'}
      </Button>
    </form>
  );
}

function PaymentMethodForm({
  onComplete,
  onCancel,
}: {
  onComplete: (setupIntentId: string) => Promise<void>;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await stripe.confirmSetup({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/#/billing?payment_method=complete`,
        },
        redirect: 'if_required',
      });

      if (result.error) {
        setError(result.error.message ?? 'Payment method could not be saved.');
        return;
      }

      const setupIntentId = result.setupIntent?.id;
      if (!setupIntentId) {
        setError('Stripe did not return a setup confirmation.');
        return;
      }

      await onComplete(setupIntentId);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <PaymentElement />
      {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="gap-2" disabled={!stripe || submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
          {submitting ? 'Saving...' : 'Save payment method'}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function stripeElementsOptions(clientSecret: string | null): StripeElementsOptions | undefined {
  return clientSecret
    ? {
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#f08080',
            borderRadius: '8px',
            fontFamily: 'Poppins, sans-serif',
          },
        },
      }
    : undefined;
}

function titleCase(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function paymentMethodTitle(paymentMethod: BillingPaymentMethod | null) {
  if (!paymentMethod) {
    return 'No payment method on file';
  }

  if (paymentMethod.type === 'card') {
    const brand = paymentMethod.brand ? titleCase(paymentMethod.brand) : 'Card';
    return paymentMethod.last4 ? `${brand} ending in ${paymentMethod.last4}` : brand;
  }

  return titleCase(paymentMethod.type);
}

function paymentMethodDescription(paymentMethod: BillingPaymentMethod | null) {
  if (!paymentMethod) {
    return 'Add a saved payment method for future renewals.';
  }

  const details: string[] = [];
  if (paymentMethod.expMonth && paymentMethod.expYear) {
    details.push(`Expires ${String(paymentMethod.expMonth).padStart(2, '0')}/${paymentMethod.expYear}`);
  }
  if (paymentMethod.billingName) {
    details.push(paymentMethod.billingName);
  }
  if (paymentMethod.wallet) {
    details.push(titleCase(paymentMethod.wallet));
  }

  return details.length > 0 ? details.join(' · ') : 'Used for future subscription renewals.';
}

function BillingPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<BillingPaymentMethod | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval>('monthly');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentMethodClientSecret, setPaymentMethodClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [updatingPlan, setUpdatingPlan] = useState<BillingInterval | null>(null);
  const [resuming, setResuming] = useState(false);
  const [preparingPaymentMethod, setPreparingPaymentMethod] = useState(false);
  const [savingPaymentMethod, setSavingPaymentMethod] = useState(false);
  const [paymentMethodSuccess, setPaymentMethodSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stripePromise = useMemo(() => (config?.publishableKey ? loadStripe(config.publishableKey) : null), [config?.publishableKey]);
  const elementsOptions = useMemo(() => stripeElementsOptions(clientSecret), [clientSecret]);
  const paymentMethodElementsOptions = useMemo(() => stripeElementsOptions(paymentMethodClientSecret), [paymentMethodClientSecret]);

  const refreshStatus = async () => {
    if (!user) return;
    const [nextStatus, nextPaymentMethod] = await Promise.all([refreshBillingStatus(user.id), getPaymentMethod(user.id)]);
    setStatus(nextStatus);
    setPaymentMethod(nextPaymentMethod.paymentMethod);
    if (nextStatus.subscribed) {
      setClientSecret(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user) return;

      setLoading(true);
      try {
        const [nextConfig, nextStatus, nextPaymentMethod] = await Promise.all([
          getBillingConfig(),
          refreshBillingStatus(user.id),
          getPaymentMethod(user.id),
        ]);
        if (!cancelled) {
          setConfig(nextConfig);
          setStatus(nextStatus);
          setPaymentMethod(nextPaymentMethod.paymentMethod);
        }
      } catch (err) {
        if (!cancelled) {
          const message = (err as { error?: { message?: string } })?.error?.message ?? 'Unable to load billing.';
          setError(message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleCreateSubscription = async () => {
    if (!user) return;

    setCreating(true);
    setError(null);
    try {
      const result = await createSubscription({
        userId: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`.trim(),
        interval: selectedInterval,
      });

      if (result.alreadySubscribed) {
        await refreshStatus();
        return;
      }

      if (!result.clientSecret) {
        setError('Stripe did not return a payment secret. Check the subscription price configuration.');
        return;
      }

      setClientSecret(result.clientSecret);
    } catch (err) {
      const message = (err as { error?: { message?: string } })?.error?.message ?? 'Unable to start subscription.';
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  const handleCancel = async () => {
    if (!user) return;
    setCancelling(true);
    setError(null);
    try {
      setStatus(await cancelSubscription(user.id));
    } catch (err) {
      const message = (err as { error?: { message?: string } })?.error?.message ?? 'Unable to cancel subscription.';
      setError(message);
    } finally {
      setCancelling(false);
    }
  };

  const handleResume = async () => {
    if (!user) return;
    setResuming(true);
    setError(null);
    try {
      setStatus(await resumeSubscription(user.id));
    } catch (err) {
      const message = (err as { error?: { message?: string } })?.error?.message ?? 'Unable to resume subscription.';
      setError(message);
    } finally {
      setResuming(false);
    }
  };

  const handleUpdatePlan = async (interval: BillingInterval) => {
    if (!user) return;
    setUpdatingPlan(interval);
    setError(null);
    try {
      setStatus(await updateSubscriptionPlan({ userId: user.id, interval }));
    } catch (err) {
      const message = (err as { error?: { message?: string } })?.error?.message ?? 'Unable to update subscription.';
      setError(message);
    } finally {
      setUpdatingPlan(null);
    }
  };

  const handleStartPaymentMethodUpdate = async () => {
    if (!user) return;
    setPreparingPaymentMethod(true);
    setPaymentMethodSuccess(null);
    setError(null);
    try {
      const result = await createPaymentMethodSetupIntent(user.id);
      setPaymentMethodClientSecret(result.clientSecret);
    } catch (err) {
      const message = (err as { error?: { message?: string } })?.error?.message ?? 'Unable to start payment method update.';
      setError(message);
    } finally {
      setPreparingPaymentMethod(false);
    }
  };

  const handleSavePaymentMethod = async (setupIntentId: string) => {
    if (!user) return;
    setSavingPaymentMethod(true);
    setPaymentMethodSuccess(null);
    setError(null);
    try {
      const result = await savePaymentMethod({ userId: user.id, setupIntentId });
      setPaymentMethod(result.paymentMethod);
      setPaymentMethodClientSecret(null);
      setPaymentMethodSuccess('Payment method updated.');
    } catch (err) {
      const message = (err as { error?: { message?: string } })?.error?.message ?? 'Unable to save payment method.';
      setError(message);
    } finally {
      setSavingPaymentMethod(false);
    }
  };

  if (!user) {
    return null;
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading billing...</div>;
  }

  const missingSetup = !config?.publishableKey || !config.prices.monthly || !config.prices.yearly;
  const missingPublishableKey = !config?.publishableKey;
  const activeInterval: BillingInterval | null =
    status?.stripePriceId === config?.prices.yearly ? 'yearly' : status?.stripePriceId === config?.prices.monthly ? 'monthly' : null;
  const trialStartedNotice = new URLSearchParams(location.search).get('trial') === 'started';
  const trialEndsLabel = status?.trialEndsAt ? new Date(status.trialEndsAt).toLocaleDateString() : null;
  const isTrialOnlyAccess = Boolean(status?.trialActive && !status.subscribed);
  const hasExpiredTrial = Boolean(status?.trialStartedAt && !status.trialActive && !status.subscribed);
  const trialDaysRemaining = status?.trialDaysRemaining ?? 0;

  return (
    <div className="min-h-screen bg-secondary/40 p-4 sm:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <Button variant="ghost" className="gap-2" onClick={() => logout()}>
            <ArrowLeft className="h-4 w-4" />
            Log out
          </Button>
          {status?.hasAccess && (
            <Button onClick={() => navigate('/')} className="gap-2">
              Open app
            </Button>
          )}
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Subscribe to UMS</CardTitle>
            <CardDescription>{isProductionApp ? 'Choose a subscription to unlock the app.' : 'Choose a test-mode subscription to unlock the app.'}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 overflow-visible">
            {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p>}

            {trialStartedNotice && isTrialOnlyAccess && (
              <div className="flex flex-col gap-2 rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm text-foreground">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-full bg-white p-1 text-primary">
                    <Check className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-bold text-primary">Your 14-day free trial has started.</p>
                    <p className="mt-1 text-muted-foreground">
                      You can upgrade now, or keep using UMS free
                      {trialEndsLabel ? ` until ${trialEndsLabel}` : ' for 14 days'}.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {isTrialOnlyAccess && !trialStartedNotice && (
              <div className="rounded-lg border border-[var(--border-light)] bg-white p-4 text-sm">
                <p className="font-bold text-primary">Free trial active</p>
                <p className="mt-1 text-muted-foreground">
                  {trialDaysRemaining > 0
                    ? `${trialDaysRemaining} day${trialDaysRemaining === 1 ? '' : 's'} remaining`
                    : 'Your trial is active'}
                  {trialEndsLabel ? `, ending ${trialEndsLabel}` : ''}. Upgrade any time to keep access after the trial.
                </p>
              </div>
            )}

            {hasExpiredTrial && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
                <p className="font-bold text-destructive">Your free trial has ended.</p>
                <p className="mt-1 text-muted-foreground">Choose a subscription below to keep using UMS.</p>
              </div>
            )}

            {missingSetup && (
              <div className="rounded-md border border-primary/40 bg-primary/10 p-4 text-sm text-foreground">
                Stripe billing is missing setup. Add <code>VITE_STRIPE_PUBLISHABLE_KEY</code> or <code>STRIPE_PUBLISHABLE_KEY</code>, plus monthly and yearly price IDs, to the env file.
              </div>
            )}

            {status?.subscribed ? (
              <div className="flex flex-col gap-5 rounded-lg border border-[var(--border-light)] p-5">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className="rounded-full bg-[#cfe8da] p-2 text-[#24553D]">
                      <Check className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-primary">Your subscription is active.</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Current plan:{' '}
                        <span className="font-semibold text-foreground">
                          {activeInterval ? planCopy[activeInterval].title : 'Subscription'}
                        </span>
                        {status.currentPeriodEnd ? ` · Renews ${new Date(status.currentPeriodEnd).toLocaleDateString()}` : ''}
                      </p>
                      {status.cancelAtPeriodEnd && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          Cancellation is scheduled. Access remains active until{' '}
                          {status.currentPeriodEnd ? new Date(status.currentPeriodEnd).toLocaleDateString() : 'the end of the period'}.
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {status.cancelAtPeriodEnd ? (
                      <Button variant="outline" onClick={handleResume} disabled={resuming}>
                        {resuming ? 'Resuming...' : 'Resume subscription'}
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={handleCancel} disabled={cancelling}>
                        {cancelling ? 'Cancelling...' : 'Cancel at period end'}
                      </Button>
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-sm font-bold text-foreground">Edit plan</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {(['monthly', 'yearly'] as BillingInterval[]).map((interval) => {
                      const plan = planCopy[interval];
                      const current = activeInterval === interval;
                      return (
                        <button
                          key={interval}
                          type="button"
                          onClick={() => void handleUpdatePlan(interval)}
                          disabled={current || updatingPlan !== null || missingSetup}
                          className={`rounded-lg border-2 p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                            current ? 'border-primary bg-primary/10' : 'border-[var(--border-light)] bg-white hover:border-primary/50'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold text-primary">{plan.title}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {plan.price} {plan.cadence}
                              </p>
                            </div>
                            {current && <Check className="h-5 w-5 text-primary" />}
                            {updatingPlan === interval && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    Plan changes use Stripe prorations and take effect immediately when Stripe accepts the update.
                  </p>
                </div>

                <div>
                  <p className="mb-3 text-sm font-bold text-foreground">Payment method</p>
                  <div className="rounded-lg border border-[var(--border-light)] bg-white p-4">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="flex items-start gap-3">
                        <div className="rounded-full bg-secondary p-2 text-primary">
                          <CreditCard className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-bold text-foreground">{paymentMethodTitle(paymentMethod)}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{paymentMethodDescription(paymentMethod)}</p>
                          {paymentMethodSuccess && <p className="mt-2 text-sm font-semibold text-[#0F8F5A]">{paymentMethodSuccess}</p>}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleStartPaymentMethodUpdate}
                        disabled={preparingPaymentMethod || savingPaymentMethod || missingPublishableKey}
                      >
                        {preparingPaymentMethod ? 'Preparing...' : paymentMethod ? 'Change payment method' : 'Add payment method'}
                      </Button>
                    </div>

                    {missingPublishableKey && (
                      <p className="mt-3 text-xs text-muted-foreground">Add a Stripe publishable key to change payment methods.</p>
                    )}

                    {paymentMethodClientSecret && stripePromise && paymentMethodElementsOptions && (
                      <div className="mt-4 rounded-lg border border-[var(--border-light)] p-4">
                        <Elements stripe={stripePromise} options={paymentMethodElementsOptions}>
                          <PaymentMethodForm
                            onComplete={handleSavePaymentMethod}
                            onCancel={() => {
                              setPaymentMethodClientSecret(null);
                            }}
                          />
                        </Elements>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {isTrialOnlyAccess && (
                  <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-light)] bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-bold text-foreground">You do not have to upgrade today.</p>
                      <p className="mt-1 text-sm text-muted-foreground">Your trial includes full app access.</p>
                    </div>
                    <Button onClick={() => navigate('/')}>Continue to app</Button>
                  </div>
                )}

                <div className="grid gap-4 md:grid-cols-2">
                  {(['monthly', 'yearly'] as BillingInterval[]).map((interval) => {
                    const plan = planCopy[interval];
                    const selected = selectedInterval === interval;
                    return (
                      <button
                        key={interval}
                        type="button"
                        onClick={() => {
                          setSelectedInterval(interval);
                          setClientSecret(null);
                        }}
                        className={`rounded-lg border-2 p-5 text-left transition-colors ${
                          selected ? 'border-primary bg-primary/10' : 'border-[var(--border-light)] bg-white hover:border-primary/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-lg font-bold text-primary">{plan.title}</p>
                            <p className="mt-1 text-sm text-muted-foreground">{plan.note}</p>
                          </div>
                          {selected && <Check className="h-5 w-5 text-primary" />}
                        </div>
                        <p className="mt-4 text-3xl font-bold text-foreground">
                          {plan.price} <span className="text-sm font-semibold text-muted-foreground">{plan.cadence}</span>
                        </p>
                      </button>
                    );
                  })}
                </div>

                {!clientSecret && (
                  <Button className="w-full gap-2 sm:w-auto" onClick={handleCreateSubscription} disabled={creating || missingSetup}>
                    {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                    {creating ? 'Preparing payment...' : 'Continue to payment'}
                  </Button>
                )}

                {clientSecret && stripePromise && elementsOptions && (
                  <div className="rounded-lg border border-[var(--border-light)] bg-white p-5">
                    <Elements stripe={stripePromise} options={elementsOptions}>
                      <CheckoutForm onComplete={refreshStatus} />
                    </Elements>
                  </div>
                )}

                {showStripeTestCardHelp && (
                  <p className="text-xs text-muted-foreground">
                    Test mode: use Stripe test cards such as <code>4242 4242 4242 4242</code> with any future expiry and CVC.
                  </p>
                )}
              </>
            )}

            <p className="text-xs text-muted-foreground">
              Already paid in another tab?{' '}
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => void refreshStatus()}>
                Refresh subscription status
              </button>
              {status?.hasAccess ? (
                <>
                  . Return to <Link to="/" className="font-semibold text-primary hover:underline">the app</Link> when you are ready.
                </>
              ) : (
                '.'
              )}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default BillingPage;
