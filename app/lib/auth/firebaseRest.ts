type FirebaseParams = Record<string, unknown>;
const FIREBASE_TIMEOUT_MS = 8000;

function firebaseApiKey(): string {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) {
    throw { error: { message: 'MISSING_FIREBASE_API_KEY' } };
  }
  return apiKey;
}

function compactBody(params: FirebaseParams): FirebaseParams {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

async function firebaseRequest<TResult = any>(endpoint: string, params: FirebaseParams): Promise<TResult> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), FIREBASE_TIMEOUT_MS);

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/${endpoint}?key=${encodeURIComponent(firebaseApiKey())}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(compactBody(params)),
    signal: controller.signal,
  }).finally(() => window.clearTimeout(timeoutId));

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw payload ?? { error: { message: 'FIREBASE_REQUEST_FAILED' } };
  }

  return payload as TResult;
}

export const firebaseAuth = {
  signUp: (params: FirebaseParams) => firebaseRequest('accounts:signUp', { ...params, returnSecureToken: true }),
  signIn: (params: FirebaseParams) => firebaseRequest('accounts:signInWithPassword', { ...params, returnSecureToken: true }),
  lookupUser: (params: FirebaseParams) => firebaseRequest('accounts:lookup', params),
  updateProfile: (params: FirebaseParams) => firebaseRequest('accounts:update', { ...params, returnSecureToken: true }),
  changePassword: (params: FirebaseParams) => firebaseRequest('accounts:update', { ...params, returnSecureToken: true }),
  sendOobCode: (params: FirebaseParams) => firebaseRequest('accounts:sendOobCode', params),
  resetPassword: (params: FirebaseParams) => firebaseRequest('accounts:resetPassword', params),
  signInWithIdp: (params: FirebaseParams) =>
    firebaseRequest('accounts:signInWithIdp', { ...params, returnSecureToken: true, returnIdpCredential: true }),
};
