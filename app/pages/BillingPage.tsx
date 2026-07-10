import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type StripeElementsOptions } from '@stripe/stripe-js';
import { ArrowLeft, Check, CreditCard, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/app/lib/auth/AuthContext';
import {
  cancelSubscription,
  createSubscription,
  getBillingConfig,
  getBillingStatus,
  refreshBillingStatus,
  resumeSubscription,
  updateSubscriptionPlan,
  type BillingConfig,
  type BillingInterval,
  type BillingStatus,
} from '@/app/lib/billing/client';

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

function BillingPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval>('monthly');
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [updatingPlan, setUpdatingPlan] = useState<BillingInterval | null>(null);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stripePromise = useMemo(() => (config?.publishableKey ? loadStripe(config.publishableKey) : null), [config?.publishableKey]);
  const elementsOptions = useMemo<StripeElementsOptions | undefined>(
    () =>
      clientSecret
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
        : undefined,
    [clientSecret]
  );

  const refreshStatus = async () => {
    if (!user) return;
    const nextStatus = await refreshBillingStatus(user.id);
    setStatus(nextStatus);
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
        const [nextConfig, nextStatus] = await Promise.all([getBillingConfig(), refreshBillingStatus(user.id)]);
        if (!cancelled) {
          setConfig(nextConfig);
          setStatus(nextStatus);
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

  if (!user) {
    return null;
  }

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading billing...</div>;
  }

  const missingSetup = !config?.publishableKey || !config.prices.monthly || !config.prices.yearly;
  const activeInterval: BillingInterval | null =
    status?.stripePriceId === config?.prices.yearly ? 'yearly' : status?.stripePriceId === config?.prices.monthly ? 'monthly' : null;

  return (
    <div className="min-h-screen bg-secondary/40 p-4 sm:p-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <Button variant="ghost" className="gap-2" onClick={() => logout()}>
            <ArrowLeft className="h-4 w-4" />
            Log out
          </Button>
          {status?.subscribed && (
            <Button onClick={() => navigate('/')} className="gap-2">
              Open app
            </Button>
          )}
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Subscribe to UMS</CardTitle>
            <CardDescription>Choose a test-mode subscription to unlock the app.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6 overflow-visible">
            {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p>}

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
              </div>
            ) : (
              <>
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

                <p className="text-xs text-muted-foreground">
                  Test mode: use Stripe test cards such as <code>4242 4242 4242 4242</code> with any future expiry and CVC.
                </p>
              </>
            )}

            <p className="text-xs text-muted-foreground">
              Already paid in another tab?{' '}
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => void refreshStatus()}>
                Refresh subscription status
              </button>
              . Return to <Link to="/" className="font-semibold text-primary hover:underline">the app</Link> after your subscription is active.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default BillingPage;
