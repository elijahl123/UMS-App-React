import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { GraduationCap, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/app/lib/auth/AuthContext';
import GoogleSignInButton from '@/app/components/auth/GoogleSignInButton';
import {
  captureLaunchAttribution,
  getLaunchInstitution,
  institutionForLaunchSource,
  isExactInstitutionEmail,
} from '@/app/lib/launch/attribution';
import { joinLaunchWaitlist } from '@/app/lib/launch/client';

const schema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type FormValues = z.infer<typeof schema>;

function SignupPage() {
  const { user, signup, googleSignInError } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [waitlistConsent, setWaitlistConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [waitlistPending, setWaitlistPending] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: '', lastName: '', email: '', password: '' },
  });

  useEffect(() => {
    captureLaunchAttribution(searchParams);
  }, [searchParams]);

  const launchInstitution = institutionForLaunchSource(searchParams.get('source')) ?? getLaunchInstitution();
  const enteredEmail = form.watch('email');
  const isPersonalJourneyEmail = Boolean(launchInstitution)
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enteredEmail)
    && !isExactInstitutionEmail(enteredEmail, launchInstitution!);

  const requestWaitlist = async (email: string) => {
    if (!waitlistConsent) {
      setFormError(`Confirm that you want to join the incoming ${launchInstitution?.name ?? 'student'} student waitlist.`);
      return;
    }
    setFormError(null);
    setIsSubmitting(true);
    try {
      if (!launchInstitution) throw new Error('Launch institution is missing.');
      await joinLaunchWaitlist({ email, list: launchInstitution.incomingList, consent: true, marketingConsent });
      setWaitlistPending(true);
    } catch (err) {
      const message = (err as { error?: { message?: string } })?.error?.message;
      setFormError(message ?? 'We could not save your waitlist request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (values: FormValues) => {
    setFormError(null);
    setIsSubmitting(true);
    try {
      const result = await signup(values);
      if (result.success) {
        const verificationPending = Boolean(launchInstitution && isExactInstitutionEmail(values.email, launchInstitution));
        const verificationFailed = result.verificationEmailSent === false;
        navigate(verificationPending || verificationFailed
          ? `/verify-email?pending=1${verificationFailed ? '&send=failed' : ''}`
          : result.trialStartedNow ? '/billing?trial=started' : '/', { replace: true });
      } else {
        setFormError(result.error ?? 'Unable to create account.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitForm = (event: FormEvent<HTMLFormElement>) => {
    if (isPersonalJourneyEmail) {
      event.preventDefault();
      void requestWaitlist(enteredEmail);
      return;
    }
    void form.handleSubmit(handleSubmit)(event);
  };

  const waitlistFields = (
    <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
      <label className="flex items-start gap-2">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={waitlistConsent} onChange={(event) => setWaitlistConsent(event.target.checked)} />
        <span>I want to join the incoming {launchInstitution?.name ?? 'student'} student waitlist and receive the confirmation email.</span>
      </label>
      <label className="flex items-start gap-2 text-muted-foreground">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={marketingConsent} onChange={(event) => setMarketingConsent(event.target.checked)} />
        <span>Also send me occasional general UMS product news (optional).</span>
      </label>
    </div>
  );

  if (launchInstitution && user && !isExactInstitutionEmail(user.email, launchInstitution)) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-secondary/40 p-4">
        <Card className="w-full max-w-sm shadow-lg">
          <CardHeader className="items-center text-center">
            <GraduationCap className="h-10 w-10 text-primary" />
            <CardTitle>Verify a {launchInstitution.name} address for free access</CardTitle>
            <CardDescription>{user.email} is not a {launchInstitution.emailDomain} address. You can join the incoming-student waitlist now or add a verified {launchInstitution.name} secondary email in Account.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {waitlistPending ? (
              <p role="status" className="rounded-lg border border-[color-mix(in_srgb,var(--course-emerald)_64%,var(--surface))] bg-[color-mix(in_srgb,var(--course-emerald)_34%,var(--surface))] p-3 text-sm text-[color-mix(in_srgb,var(--course-emerald)_68%,var(--secondary-accent))]">Check your inbox to confirm your place.</p>
            ) : (
              <>{waitlistFields}<Button disabled={isSubmitting} onClick={() => void requestWaitlist(user.email)}>{isSubmitting ? 'Sending…' : 'Join waitlist'}</Button></>
            )}
            {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
            <Button variant="outline" onClick={() => navigate('/account')}>Add a {launchInstitution.name} email</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-secondary/40 p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <GraduationCap className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">{launchInstitution ? `Get ${launchInstitution.name} student access` : 'Create your account'}</CardTitle>
          <CardDescription>{launchInstitution ? `Use a verified ${launchInstitution.emailDomain} address. Personal emails can join the incoming-student waitlist.` : 'Start managing your schoolwork today'}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={submitForm} className="flex flex-col gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{launchInstitution ? `${launchInstitution.name} email` : 'Email'}</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder={launchInstitution ? `you@${launchInstitution.emailDomain}` : 'you@example.com'} autoComplete="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!isPersonalJourneyEmail && <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={form.control}
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
                  control={form.control}
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
              </div>}
              {!isPersonalJourneyEmail && <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="At least 8 characters" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />}
              {isPersonalJourneyEmail && waitlistFields}
              {waitlistPending && <p role="status" className="rounded-lg border border-[color-mix(in_srgb,var(--course-emerald)_64%,var(--surface))] bg-[color-mix(in_srgb,var(--course-emerald)_34%,var(--surface))] p-3 text-sm text-[color-mix(in_srgb,var(--course-emerald)_68%,var(--secondary-accent))]">Check your inbox to confirm your place.</p>}
              {(formError || googleSignInError) && (
                <p className="text-sm font-medium text-destructive">{formError ?? googleSignInError}</p>
              )}
              <Button type="submit" className="mt-1 w-full gap-2" disabled={isSubmitting || waitlistPending}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Submitting...' : waitlistPending ? 'Confirmation sent' : isPersonalJourneyEmail ? 'Join incoming-student waitlist' : 'Create Account'}
              </Button>
            </form>
          </Form>
          {!isPersonalJourneyEmail && <div className="mt-4">
            <GoogleSignInButton label="Sign up with Google" />
          </div>}
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-primary hover:underline">
              Log in
            </Link>
          </p>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            You must be at least 16. By creating an account, you agree to our{' '}
            <a href="https://untitledmanagementsoftware.com/terms/" className="font-semibold text-primary hover:underline">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="https://untitledmanagementsoftware.com/privacy-policy/" className="font-semibold text-primary hover:underline">
              Privacy Policy
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default SignupPage;
