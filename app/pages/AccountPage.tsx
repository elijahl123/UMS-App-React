import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CreditCard, Loader2, MailWarning } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { listAccountEmails, type AccountEmailAddress } from '@/app/lib/accountEmails/client';
import { requestError } from '@/app/components/account/shared';
import ProfileSection from '@/app/components/account/ProfileSection';
import PasswordSection from '@/app/components/account/PasswordSection';
import ConnectedAccountsSection from '@/app/components/account/ConnectedAccountsSection';
import NotificationsSection from '@/app/components/account/NotificationsSection';
import GoogleCalendarSection from '@/app/components/account/GoogleCalendarSection';
import DataPrivacySection from '@/app/components/account/DataPrivacySection';
import PreferencesSection from '@/app/components/account/PreferencesSection';

function AccountPage() {
  const {
    user,
    updateProfile,
    changePassword,
    resendVerificationEmail,
    signInWithGoogle,
    isGoogleSignInAvailable,
    isProcessingGoogleRedirect,
    googleSignInError,
    deleteAccount,
  } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [resendSubmitting, setResendSubmitting] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);

  const [accountEmails, setAccountEmails] = useState<AccountEmailAddress[]>([]);
  const [accountPrimaryEmail, setAccountPrimaryEmail] = useState<string | null>(null);
  const [accountLoginEmail, setAccountLoginEmail] = useState<string | null>(null);
  const [accountEmailsLoading, setAccountEmailsLoading] = useState(false);
  const [accountEmailsLoadError, setAccountEmailsLoadError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState('profile-security');

  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    setAccountEmailsLoading(true);
    listAccountEmails()
      .then((result) => {
        if (isMounted) {
          setAccountEmails(result.emails);
          setAccountPrimaryEmail(result.primaryEmail ?? user.email);
          setAccountLoginEmail(result.loginEmail ?? user.email);
          setAccountEmailsLoadError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setAccountEmailsLoadError(requestError(err, 'Unable to load account email addresses.'));
        }
      })
      .finally(() => {
        if (isMounted) {
          setAccountEmailsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
    const result = searchParams.get('googleCalendar');
    if (result === 'connected' || result === 'error') {
      setActiveTab('calendar');
    }
  }, [searchParams]);

  const handleResendVerification = async () => {
    setResendError(null);
    setResendSuccess(false);
    setResendSubmitting(true);
    try {
      const result = await resendVerificationEmail();
      if (result.success) {
        setResendSuccess(true);
      } else {
        setResendError(result.error ?? 'Unable to resend verification email.');
      }
    } finally {
      setResendSubmitting(false);
    }
  };

  if (!user) {
    return null;
  }

  const displayedPrimaryEmail = accountPrimaryEmail ?? user.email;

  return (
    <div data-tour="account" className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Account</h1>
          <p className="text-sm text-muted-foreground">Manage your profile, subscription, connected accounts, and password.</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
            <a href="https://untitledmanagementsoftware.com/terms/" className="font-semibold text-primary hover:underline">
              Terms of Service
            </a>
            <a href="https://untitledmanagementsoftware.com/privacy-policy/" className="font-semibold text-primary hover:underline">
              Privacy Policy
            </a>
          </div>
        </div>

        {!user.emailVerified && (
          <Card className="border-[color-mix(in_srgb,var(--course-citrine)_64%,var(--surface))] bg-[color-mix(in_srgb,var(--course-citrine)_34%,var(--surface))]">
            <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-[color-mix(in_srgb,var(--course-citrine)_62%,var(--secondary-accent))]" />
                <div>
                  <p className="text-sm font-semibold text-[color-mix(in_srgb,var(--course-citrine)_68%,var(--secondary-accent))]">Your email address is not verified</p>
                  <p className="text-sm text-[color-mix(in_srgb,var(--course-citrine)_62%,var(--secondary-accent))]">
                    {resendSuccess
                      ? "We've sent a new verification link. Please check your inbox."
                      : 'Please verify your email to secure your account.'}
                  </p>
                  {resendError && <p className="mt-1 text-sm font-medium text-destructive">{resendError}</p>}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 gap-2 border-[color-mix(in_srgb,var(--course-citrine)_70%,var(--surface))] text-[color-mix(in_srgb,var(--course-citrine)_68%,var(--secondary-accent))] hover:bg-[color-mix(in_srgb,var(--course-citrine)_24%,var(--surface))]"
                onClick={handleResendVerification}
                disabled={resendSubmitting || resendSuccess}
              >
                {resendSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {resendSuccess ? 'Sent' : 'Resend verification'}
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <CardTitle>Subscription</CardTitle>
            </div>
            <CardDescription>Update your plan, resume access, or cancel at the end of your billing period.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full gap-2 sm:w-auto">
              <Link to="/billing">
                <CreditCard className="h-4 w-4" />
                Manage Subscription
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="profile-security">Profile & Security</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="calendar">Calendar & Imports</TabsTrigger>
            <TabsTrigger value="privacy-data">Privacy & Data</TabsTrigger>
            <TabsTrigger value="preferences">Preferences & Support</TabsTrigger>
          </TabsList>

          <TabsContent value="profile-security">
            <ProfileSection user={user} updateProfile={updateProfile} accountPrimaryEmail={accountPrimaryEmail} />
            <PasswordSection changePassword={changePassword} />
            <ConnectedAccountsSection
              user={user}
              displayedPrimaryEmail={displayedPrimaryEmail}
              accountEmails={accountEmails}
              accountEmailsLoading={accountEmailsLoading}
              accountEmailsLoadError={accountEmailsLoadError}
              setAccountEmails={setAccountEmails}
              accountLoginEmail={accountLoginEmail}
              signInWithGoogle={signInWithGoogle}
              isGoogleSignInAvailable={isGoogleSignInAvailable}
              isProcessingGoogleRedirect={isProcessingGoogleRedirect}
              googleSignInError={googleSignInError}
            />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationsSection />
          </TabsContent>

          <TabsContent value="calendar">
            <GoogleCalendarSection />
          </TabsContent>

          <TabsContent value="privacy-data">
            <DataPrivacySection
              user={user}
              displayedPrimaryEmail={displayedPrimaryEmail}
              deleteAccount={deleteAccount}
              navigate={navigate}
            />
          </TabsContent>

          <TabsContent value="preferences">
            <PreferencesSection user={user} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default AccountPage;
