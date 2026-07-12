import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, User as UserIcon, KeyRound, CheckCircle2, MailWarning, CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/app/lib/auth/AuthContext';

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

function AccountPage() {
  const { user, updateProfile, changePassword, resendVerificationEmail } = useAuth();

  const [resendSubmitting, setResendSubmitting] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);

  const [profileSubmitting, setProfileSubmitting] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);

  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

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

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Account</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, subscription, and password.</p>
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
      </div>
    </div>
  );
}

export default AccountPage;
