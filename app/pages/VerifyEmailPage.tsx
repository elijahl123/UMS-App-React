import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { GraduationCap, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/app/lib/auth/AuthContext';

function VerifyEmailPage() {
  const { verifyEmailWithToken } = useAuth();
  const [searchParams] = useSearchParams();
  const oobCode = searchParams.get('oobCode') ?? '';
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [error, setError] = useState<string | null>(null);
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;

    if (!oobCode) {
      setStatus('error');
      setError('This verification link is missing or invalid.');
      return;
    }

    (async () => {
      const result = await verifyEmailWithToken(oobCode);
      if (result.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setError(result.error ?? 'Could not verify your email. Please try again.');
      }
    })();
  }, [oobCode, verifyEmailWithToken]);

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-secondary/40 p-4">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <GraduationCap className="h-6 w-6" />
          </div>
          <CardTitle className="text-xl">Email verification</CardTitle>
          <CardDescription>Confirming your email address</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-3 py-2 text-center">
            {status === 'verifying' && (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Verifying your email address...</p>
              </>
            )}
            {status === 'success' && (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <p className="text-sm text-muted-foreground">Your email address has been verified. Thank you!</p>
                <Button asChild className="mt-2 w-full">
                  <Link to="/">Go to dashboard</Link>
                </Button>
              </>
            )}
            {status === 'error' && (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                  <XCircle className="h-6 w-6" />
                </div>
                <p className="text-sm text-muted-foreground">{error}</p>
                <Button asChild variant="outline" className="mt-2 w-full">
                  <Link to="/account">Go to account settings</Link>
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default VerifyEmailPage;
