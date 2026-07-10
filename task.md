# Add Google Sign-In via Firebase Auth (Identity Toolkit REST, OAuth redirect flow)

- [x] Add firebaseSignInWithIdp action (POST /accounts:signInWithIdp) to actions/firebaseSignInWithIdp.ts
- [x] Add app/lib/auth/googleOAuth.ts helper: build Google OAuth authorize URL (implicit id_token flow), parse redirect fragment, sessionStorage nonce/state
- [x] Update AuthContext.tsx: add loginWithGoogle() to exchange Google id_token for Firebase session, add signInWithGoogle() to kick off redirect, handle pending redirect result on mount
- [x] Add "Continue with Google" button + divider to LoginPage.tsx and SignupPage.tsx wired to signInWithGoogle()
- [x] Add GOOGLE_CLIENT_ID constant placeholder (clearly marked for user to fill in)
- [x] Run lint and fix errors
