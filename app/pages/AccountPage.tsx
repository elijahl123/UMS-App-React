import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FcGoogle } from 'react-icons/fc';
import {
  AlertTriangle,
  Loader2,
  User as UserIcon,
  KeyRound,
  CheckCircle2,
  MailWarning,
  CreditCard,
  Link2,
  Mail,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/app/lib/auth/AuthContext';
import {
  addAccountEmail,
  listAccountEmails,
  resendAccountEmailVerification,
  type AccountEmailAddress,
} from '@/app/lib/accountEmails/client';
import BrightspacePdfImportCard from '@/app/components/BrightspacePdfImportCard';

const profileSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type PasswordFormValues = z.infer<typeof passwordSchema>;

const addEmailSchema = z.string().min(1, 'Email is required').email('Enter a valid email address');

function requestError(err: unknown, fallback: string): string {
  const response = err as { error?: { message?: string } };
  return response?.error?.message ?? fallback;
}

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

  const [resendSubmitting, setResendSubmitting] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);

  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const [googleConnectSubmitting, setGoogleConnectSubmitting] = useState(false);
  const [googleConnectError, setGoogleConnectError] = useState<string | null>(null);

  const [accountEmails, setAccountEmails] = useState<AccountEmailAddress[]>([]);
  const [accountPrimaryEmail, setAccountPrimaryEmail] = useState<string | null>(null);
  const [accountLoginEmail, setAccountLoginEmail] = useState<string | null>(null);
  const [accountEmailsLoading, setAccountEmailsLoading] = useState(false);
  const [accountEmailInput, setAccountEmailInput] = useState('');
  const [accountEmailSubmitting, setAccountEmailSubmitting] = useState(false);
  const [accountEmailResendingId, setAccountEmailResendingId] = useState<string | null>(null);
  const [accountEmailError, setAccountEmailError] = useState<string | null>(null);
  const [accountEmailSuccess, setAccountEmailSuccess] = useState<string | null>(null);

  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: user?.firstName ?? '',
      lastName: user?.lastName ?? '',
      email: user?.email ?? '',
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

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
          setAccountEmailError(null);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setAccountEmailError(requestError(err, 'Unable to load account email addresses.'));
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
    if (!user) return;
    const primaryEmail = accountPrimaryEmail ?? user.email;
    profileForm.setValue('email', primaryEmail);
  }, [accountPrimaryEmail, profileForm, user]);

  const handleProfileSubmit = async (values: ProfileFormValues) => {
    setProfileError(null);
    setProfileSuccess(false);
    setProfileSubmitting(true);
    try {
      const result = await updateProfile(values);
      if (result.success) {
        setProfileSuccess(true);
      } else {
        setProfileError(result.error ?? 'Unable to update profile.');
      }
    } finally {
      setProfileSubmitting(false);
    }
  };

  const handlePasswordSubmit = async (values: PasswordFormValues) => {
    setPasswordError(null);
    setPasswordSuccess(false);
    setPasswordSubmitting(true);
    try {
      const result = await changePassword(values);
      if (result.success) {
        setPasswordSuccess(true);
        passwordForm.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setPasswordError(result.error ?? 'Unable to update password.');
      }
    } finally {
      setPasswordSubmitting(false);
    }
  };

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

  const handleDeleteAccount = async () => {
    const acceptableEmails = [accountPrimaryEmail, user?.email].filter((email): email is string => Boolean(email));
    const normalizedConfirmation = deleteConfirmation.trim().toLowerCase();
    const confirmationMatchesAccountEmail = acceptableEmails.some(
      (email) => normalizedConfirmation === email.trim().toLowerCase()
    );

    if (!confirmationMatchesAccountEmail) {
      setDeleteError('Type your account email to confirm deletion.');
      return;
    }

    const confirmed = window.confirm('This permanently deletes your account and all app data. This cannot be undone.');
    if (!confirmed) {
      return;
    }

    setDeleteError(null);
    setDeleteSubmitting(true);
    try {
      const result = await deleteAccount({ confirmationEmail: deleteConfirmation });
      if (result.success) {
        navigate('/login', { replace: true });
      } else {
        setDeleteError(result.error ?? 'Unable to delete account.');
      }
    } finally {
      setDeleteSubmitting(false);
    }
  };

  if (!user) {
    return null;
  }

  const googleConnected = user.connectedProviders.includes('google.com');
  const displayedPrimaryEmail = accountPrimaryEmail ?? user.email;
  const normalizedDeleteConfirmation = deleteConfirmation.trim().toLowerCase();
  const deleteConfirmationMatches = [displayedPrimaryEmail, user.email].some(
    (email) => normalizedDeleteConfirmation === email.trim().toLowerCase()
  );
  const googleAccountEmails = accountEmails.filter((email) => email.source === 'google');
  const additionalEmailAccounts = accountEmails.filter((email) => email.source !== 'google');
  const googleAccountEmail = googleAccountEmails[0]?.email ?? accountLoginEmail ?? user.email;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, subscription, connected accounts, and password.</p>
      </div>

      {!user.emailVerified && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-amber-800">Your email address is not verified</p>
                <p className="text-sm text-amber-700">
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
              className="shrink-0 gap-2 border-amber-400 text-amber-800 hover:bg-amber-100"
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

      <BrightspacePdfImportCard />

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
            {accountEmailError && <p className="text-sm font-medium text-destructive">{accountEmailError}</p>}
            {accountEmailSuccess && (
              <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserIcon className="h-5 w-5 text-primary" />
            <CardTitle>Profile</CardTitle>
          </div>
          <CardDescription>Update your name and email address.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...profileForm}>
            <form onSubmit={profileForm.handleSubmit(handleProfileSubmit)} className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={profileForm.control}
                  name="firstName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Jane" autoComplete="given-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={profileForm.control}
                  name="lastName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Doe" autoComplete="family-name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={profileForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="you@example.com" autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {profileError && <p className="text-sm font-medium text-destructive">{profileError}</p>}
              {profileSuccess && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Profile updated successfully.
                </p>
              )}
              <Button type="submit" className="mt-1 w-full gap-2 sm:w-auto" disabled={profileSubmitting}>
                {profileSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {profileSubmitting ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            <CardTitle>Password</CardTitle>
          </div>
          <CardDescription>Change your account password.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...passwordForm}>
            <form onSubmit={passwordForm.handleSubmit(handlePasswordSubmit)} className="flex flex-col gap-4">
              <FormField
                control={passwordForm.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField
                  control={passwordForm.control}
                  name="newPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="At least 8 characters" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={passwordForm.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              {passwordError && <p className="text-sm font-medium text-destructive">{passwordError}</p>}
              {passwordSuccess && (
                <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                  <CheckCircle2 className="h-4 w-4" />
                  Password updated successfully.
                </p>
              )}
              <Button type="submit" className="mt-1 w-full gap-2 sm:w-auto" disabled={passwordSubmitting}>
                {passwordSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {passwordSubmitting ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <CardTitle>Delete account</CardTitle>
          </div>
          <CardDescription>Permanently delete your profile, courses, assignments, notes, events, connected emails, and billing records.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-foreground" htmlFor="delete-account-confirmation">
              Type {displayedPrimaryEmail} to confirm
            </label>
            {user.email !== displayedPrimaryEmail && (
              <p className="text-sm text-muted-foreground">Your current sign-in email, {user.email}, also works.</p>
            )}
            <Input
              id="delete-account-confirmation"
              type="email"
              value={deleteConfirmation}
              onChange={(event) => setDeleteConfirmation(event.target.value)}
              autoComplete="off"
              disabled={deleteSubmitting}
            />
          </div>
          {deleteError && <p className="text-sm font-medium text-destructive">{deleteError}</p>}
          <Button
            type="button"
            variant="destructive"
            className="w-full gap-2 sm:w-auto"
            disabled={deleteSubmitting || !deleteConfirmationMatches}
            onClick={handleDeleteAccount}
          >
            {deleteSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {deleteSubmitting ? 'Deleting...' : 'Delete account'}
          </Button>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

export default AccountPage;
