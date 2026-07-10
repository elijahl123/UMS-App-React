import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/app/lib/auth/AuthContext';

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3.02h3.88c2.27-2.09 3.57-5.17 3.57-8.84Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3.02c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.27v3.11A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28V6.61H1.27A12 12 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4-3.11Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.59 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.61l4 3.11C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

interface GoogleSignInButtonProps {
  label?: string;
}

function GoogleSignInButton({ label = 'Continue with Google' }: GoogleSignInButtonProps) {
  const { signInWithGoogle, isGoogleSignInAvailable, isProcessingGoogleRedirect } = useAuth();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2"
        disabled={!isGoogleSignInAvailable || isProcessingGoogleRedirect}
        onClick={() => signInWithGoogle()}
      >
        {isProcessingGoogleRedirect ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon />}
        {label}
      </Button>
      {!isGoogleSignInAvailable && (
        <p className="text-center text-xs text-muted-foreground">
          Google sign-in isn&apos;t configured yet for this app.
        </p>
      )}
    </div>
  );
}

export default GoogleSignInButton;
