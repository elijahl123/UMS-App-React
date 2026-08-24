import { Capacitor } from '@capacitor/core';
import { Purchases, type CustomerInfo, type PurchasesError, type PurchasesOffering, type PurchasesPackage } from '@revenuecat/purchases-capacitor';

const REVENUECAT_IOS_API_KEY = import.meta.env.VITE_REVENUECAT_IOS_API_KEY ?? '';
const DEFAULT_ENTITLEMENT_ID = 'premium';

let configuredForUserId: string | null = null;

export function isIOSNativeApp(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

export function isPurchaseCancelledError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && (err as PurchasesError).userCancelled);
}

export async function configureRevenueCat(appUserId: string): Promise<void> {
  if (!isIOSNativeApp() || !REVENUECAT_IOS_API_KEY || configuredForUserId === appUserId) {
    return;
  }

  await Purchases.configure({ apiKey: REVENUECAT_IOS_API_KEY, appUserID: appUserId });
  configuredForUserId = appUserId;
}

export async function logOutRevenueCat(): Promise<void> {
  if (!isIOSNativeApp() || !configuredForUserId) {
    return;
  }

  await Purchases.logOut();
  configuredForUserId = null;
}

export async function getOfferings(): Promise<PurchasesOffering | null> {
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.restorePurchases();
  return customerInfo;
}

export function hasActiveEntitlement(customerInfo: CustomerInfo, entitlementId = DEFAULT_ENTITLEMENT_ID): boolean {
  return Boolean(customerInfo.entitlements.active[entitlementId]);
}
