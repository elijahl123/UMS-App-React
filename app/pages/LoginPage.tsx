import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
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

const schema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type FormValues = z.infer<typeof schema>;

function LoginPage() {
  const { user, isLoading, login, googleSignInError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const requestedFrom = (location.state as { from?: string } | null)?.from ?? '/';
  const from = requestedFrom === '/login' || requestedFrom === '/signup' ? '/' : requestedFrom;

  useEffect(() => {
    if (!isLoading && user && !isSubmitting) {
      navigate(from, { replace: true });
    }
  }, [from, isLoading, isSubmitting, navigate, user]);

  const handleSubmit = async (values: FormValues) => {
    setFormError(null);
    setIsSubmitting(true);
    try {
      const result = await login(values.email, values.password);
      if (result.success) {
        navigate(result.trialStartedNow ? '/billing?trial=started' : from, { replace: true });
      } else {
        setFormError(result.error ?? 'Unable to log in.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-secondary/40 p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <GraduationCap className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">Welcome back</CardTitle>
          <CardDescription>Log in to your schoolwork dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4">
              <FormField
                control={form.control}
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
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel>Password</FormLabel>
                      <Link to="/forgot-password" className="text-xs font-medium text-primary hover:underline">
                        Forgot password?
                      </Link>
                    </div>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {(formError || googleSignInError) && (
                <p className="text-sm font-medium text-destructive">{formError ?? googleSignInError}</p>
              )}
              <Button type="submit" className="mt-1 w-full gap-2" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSubmitting ? 'Logging in...' : 'Log In'}
              </Button>
            </form>
          </Form>
          <div className="mt-4">
            <GoogleSignInButton label="Continue with Google" />
          </div>
          <p className="mt-5 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link to="/signup" className="font-semibold text-primary hover:underline">
              Sign up
            </Link>
          </p>
          <p className="mt-3 text-center text-xs text-muted-foreground">
            By using UMS, you agree to our{' '}
            <Link to="/privacy-policy" className="font-semibold text-primary hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default LoginPage;
