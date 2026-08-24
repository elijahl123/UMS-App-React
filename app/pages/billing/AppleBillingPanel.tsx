import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PACKAGE_TYPE, type PurchasesOffering, type PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { ArrowLeft, Check, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { openExternalUrl } from '@/app/lib/externalLinks';
import { getOfferings, isPurchaseCancelledError, purchasePackage, restorePurchases } from '@/app/lib/billing/revenuecat';
import type { BillingStatus } from '@/app/lib/billing/client';

function packageTitle(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case PACKAGE_TYPE.ANNUAL:
      return 'Yearly';
    case PACKAGE_TYPE.MONTHLY:
      return 'Monthly';
    default:
      return pkg.product.title;
  }
}

function packageCadence(pkg: PurchasesPackage): string {
  switch (pkg.packageType) {
    case PACKAGE_TYPE.ANNUAL:
      return 'per year';
    case PACKAGE_TYPE.MONTHLY:
      return 'per month';
    default:
      return '';
  }
}

function AppleBillingPanel({
  status,
  logout,
  onRefresh,
}: {
  status: BillingStatus | null;
  logout: () => void;
  onRefresh: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const current = await getOfferings();
        if (!cancelled) {
          setOffering(current);
          setSelectedPackage(current?.availablePackages[0] ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unable to load subscription plans.');
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
  }, []);

  const alreadySubscribedElsewhere = status?.subscribed && status.provider === 'stripe';

  const handlePurchase = async () => {
    if (!selectedPackage) return;
    setPurchasing(true);
    setError(null);
    try {
      await purchasePackage(selectedPackage);
      await onRefresh();
    } catch (err) {
      if (!isPurchaseCancelledError(err)) {
        setError(err instanceof Error ? err.message : 'Purchase could not be completed.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    try {
      await restorePurchases();
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to restore purchases.');
    } finally {
      setRestoring(false);
    }
  };

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

        <div className="rounded-lg border border-[var(--border-light)] bg-card p-5 shadow-lg">
          <h1 className="text-lg font-bold text-primary">Subscribe to UMS</h1>
          <p className="mt-1 text-sm text-muted-foreground">Choose a subscription to unlock the app.</p>

          <div className="mt-6 flex flex-col gap-6">
            {error && <p className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p>}

            {alreadySubscribedElsewhere && (
              <div className="rounded-lg border border-[var(--border-light)] bg-secondary/40 p-4 text-sm">
                <p className="font-bold text-foreground">You're already subscribed via the web.</p>
                <p className="mt-1 text-muted-foreground">Manage your existing subscription from your account settings.</p>
              </div>
            )}

            {status?.subscribed && status.provider === 'apple' ? (
              <div className="flex flex-col gap-4 rounded-lg border border-[var(--border-light)] p-5">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-[var(--course-emerald)] p-2 text-[var(--course-emerald-text)]">
                    <Check className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-primary">Your subscription is active.</p>
                    <p className="mt-1 text-sm text-muted-foreground">Manage or cancel it through your Apple ID subscriptions page.</p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  className="w-fit"
                  onClick={() => void openExternalUrl('https://apps.apple.com/account/subscriptions')}
                >
                  Manage subscription
                </Button>
              </div>
            ) : (
              !alreadySubscribedElsewhere && (
                <>
                  {loading ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : offering && offering.availablePackages.length > 0 ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        {offering.availablePackages.map((pkg) => {
                          const selected = selectedPackage?.identifier === pkg.identifier;
                          return (
                            <button
                              key={pkg.identifier}
                              type="button"
                              onClick={() => setSelectedPackage(pkg)}
                              className={`rounded-lg border-2 p-5 text-left transition-colors ${
                                selected ? 'border-primary bg-primary/10' : 'border-[var(--border-light)] bg-card hover:border-primary/50'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <p className="text-lg font-bold text-primary">{packageTitle(pkg)}</p>
                                {selected && <Check className="h-5 w-5 text-primary" />}
                              </div>
                              <p className="mt-4 text-3xl font-bold text-foreground">
                                {pkg.product.priceString}{' '}
                                <span className="text-sm font-semibold text-muted-foreground">{packageCadence(pkg)}</span>
                              </p>
                            </button>
                          );
                        })}
                      </div>

                      <Button className="w-full gap-2 sm:w-auto" onClick={handlePurchase} disabled={!selectedPackage || purchasing}>
                        {purchasing && <Loader2 className="h-4 w-4 animate-spin" />}
                        {purchasing ? 'Completing purchase...' : 'Subscribe'}
                      </Button>
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">Subscription plans are not available right now.</p>
                  )}
                </>
              )
            )}

            <Button variant="ghost" className="w-fit gap-2 text-sm" onClick={handleRestore} disabled={restoring}>
              {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              {restoring ? 'Restoring...' : 'Restore purchases'}
            </Button>

            <p className="text-xs text-muted-foreground">
              Already paid in another tab?{' '}
              <button type="button" className="font-semibold text-primary hover:underline" onClick={() => void onRefresh()}>
                Refresh subscription status
              </button>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AppleBillingPanel;
