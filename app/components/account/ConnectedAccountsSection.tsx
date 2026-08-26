import { useState, type Dispatch, type SetStateAction } from 'react';
import { z } from 'zod';
import { FcGoogle } from 'react-icons/fc';
import { CheckCircle2, Link2, Loader2, Mail, Plus, Send } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  addAccountEmail,
  resendAccountEmailVerification,
  type AccountEmailAddress,
} from '@/app/lib/accountEmails/client';
import type { AppUser } from '@/app/data/types';
import type { useAuth } from '@/app/lib/auth/AuthContext';
import { requestError } from './shared';

const addEmailSchema = z.string().min(1, 'Email is required').email('Enter a valid email address');

interface ConnectedAccountsSectionProps {
  user: AppUser;
  displayedPrimaryEmail: string;
  accountEmails: AccountEmailAddress[];
  accountEmailsLoading: boolean;
  accountEmailsLoadError: string | null;
  setAccountEmails: Dispatch<SetStateAction<AccountEmailAddress[]>>;
  accountLoginEmail: string | null;
  signInWithGoogle: ReturnType<typeof useAuth>['signInWithGoogle'];
  isGoogleSignInAvailable: boolean;
  isProcessingGoogleRedirect: boolean;
  googleSignInError: string | null;
}

function ConnectedAccountsSection({
  user,
  displayedPrimaryEmail,
  accountEmails,
  accountEmailsLoading,
  accountEmailsLoadError,
  setAccountEmails,
  accountLoginEmail,
  signInWithGoogle,
  isGoogleSignInAvailable,
  isProcessingGoogleRedirect,
  googleSignInError,
}: ConnectedAccountsSectionProps) {
  const [accountEmailInput, setAccountEmailInput] = useState('');
  const [accountEmailSubmitting, setAccountEmailSubmitting] = useState(false);
  const [accountEmailResendingId, setAccountEmailResendingId] = useState<string | null>(null);
  const [accountEmailError, setAccountEmailError] = useState<string | null>(null);
  const [accountEmailSuccess, setAccountEmailSuccess] = useState<string | null>(null);

  const [googleConnectSubmitting, setGoogleConnectSubmitting] = useState(false);
  const [googleConnectError, setGoogleConnectError] = useState<string | null>(null);

  const googleConnected = user.connectedProviders.includes('google.com');
  const googleAccountEmails = accountEmails.filter((email) => email.source === 'google');
  const additionalEmailAccounts = accountEmails.filter((email) => email.source !== 'google');
  const googleAccountEmail = googleAccountEmails[0]?.email ?? accountLoginEmail ?? user.email;

  const handleGoogleConnect = async () => {
    setGoogleConnectError(null);
    setGoogleConnectSubmitting(true);
    try {
      const result = await signInWithGoogle();
      if (!result.success) {
        setGoogleConnectError(result.error ?? 'Unable to connect Google.');
      }
    } finally {
      setGoogleConnectSubmitting(false);
    }
  };

  const handleAddAccountEmail = async () => {
    setAccountEmailError(null);
    setAccountEmailSuccess(null);
    const parsed = addEmailSchema.safeParse(accountEmailInput);
    if (!parsed.success) {
      setAccountEmailError(parsed.error.issues[0]?.message ?? 'Enter a valid email address.');
      return;
    }

    setAccountEmailSubmitting(true);
    try {
      const result = await addAccountEmail(parsed.data);
      setAccountEmails((emails) => {
        const remaining = emails.filter((email) => email.id !== result.email.id);
        return [result.email, ...remaining];
      });
      setAccountEmailInput('');
      setAccountEmailSuccess(result.email.verified ? 'That email is already verified.' : 'Verification email sent.');
    } catch (err) {
      setAccountEmailError(requestError(err, 'Unable to add that email address.'));
    } finally {
      setAccountEmailSubmitting(false);
    }
  };

  const handleResendAccountEmail = async (email: AccountEmailAddress) => {
    setAccountEmailError(null);
    setAccountEmailSuccess(null);
    setAccountEmailResendingId(email.id);
    try {
      const result = await resendAccountEmailVerification(email.id);
      setAccountEmails((emails) => emails.map((existing) => (existing.id === result.email.id ? result.email : existing)));
      setAccountEmailSuccess(`Verification email sent to ${result.email.email}.`);
    } catch (err) {
      setAccountEmailError(requestError(err, 'Unable to resend that verification email.'));
    } finally {
      setAccountEmailResendingId(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          <CardTitle>Connected accounts</CardTitle>
        </div>
        <CardDescription>See the sign-in methods attached to this account.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col divide-y rounded-md border">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
              <Mail className="h-4 w-4 text-secondary-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Email</p>
              <p className="truncate text-sm text-muted-foreground">{displayedPrimaryEmail}</p>
            </div>
          </div>
          <Badge variant="secondary" className="w-fit">Primary</Badge>
        </div>

        {additionalEmailAccounts.map((email) => (
          <div key={email.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                <Mail className="h-4 w-4 text-secondary-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Additional email</p>
                <p className="truncate text-sm text-muted-foreground">{email.email}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <Badge variant={email.verified ? 'secondary' : 'outline'} className="w-fit">
                {email.verified ? 'Verified' : 'Pending'}
              </Badge>
              {!email.verified && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 sm:w-auto"
                  disabled={accountEmailResendingId === email.id}
                  onClick={() => handleResendAccountEmail(email)}
                >
                  {accountEmailResendingId === email.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Resend
                </Button>
              )}
            </div>
          </div>
        ))}

        <div className="flex flex-col gap-3 p-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              id="additional-email"
              type="email"
              value={accountEmailInput}
              onChange={(event) => setAccountEmailInput(event.target.value)}
              placeholder="add another email"
              aria-label="Additional email"
              autoComplete="email"
              disabled={accountEmailSubmitting}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2 sm:w-auto"
              disabled={accountEmailSubmitting || accountEmailsLoading}
              onClick={handleAddAccountEmail}
            >
              {accountEmailSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add email
            </Button>
          </div>
          {accountEmailsLoading && <p className="text-sm text-muted-foreground">Loading email addresses...</p>}
          {accountEmailsLoadError && <p className="text-sm font-medium text-destructive">{accountEmailsLoadError}</p>}
          {accountEmailError && <p className="text-sm font-medium text-destructive">{accountEmailError}</p>}
          {accountEmailSuccess && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-[color-mix(in_srgb,var(--course-emerald)_68%,var(--secondary-accent))]">
              <CheckCircle2 className="h-4 w-4" />
              {accountEmailSuccess}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
              <FcGoogle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Google account</p>
              <p className="truncate text-sm text-muted-foreground">
                {googleConnected ? googleAccountEmail : 'Connect Google for one-click sign in.'}
              </p>
            </div>
          </div>
          {googleConnected ? (
            <Badge variant="secondary" className="w-fit">Connected</Badge>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full gap-2 sm:w-auto"
              disabled={!isGoogleSignInAvailable || isProcessingGoogleRedirect || googleConnectSubmitting}
              onClick={handleGoogleConnect}
            >
              {isProcessingGoogleRedirect || googleConnectSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FcGoogle className="h-4 w-4" />}
              Connect Google
            </Button>
          )}
        </div>
        {!googleConnected && !isGoogleSignInAvailable && (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Google sign-in is not configured yet for this app.</p>
        )}
        {(googleConnectError || googleSignInError) && (
          <p className="px-4 pb-4 text-sm font-medium text-destructive">{googleConnectError ?? googleSignInError}</p>
        )}
        {googleAccountEmails.length > 0 && (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            {googleAccountEmails.length} Google {googleAccountEmails.length === 1 ? 'account' : 'accounts'} connected.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default ConnectedAccountsSection;
