/**
 * Verifies OpenID Connect ID tokens from Google and Apple.
 *
 * The app obtains an ID token from the provider's own sign-in sheet and sends
 * it here. Trust comes only from the signature (checked against the
 * provider's published keys) plus the issuer and audience: a token minted for
 * another app, or by anyone else, is rejected.
 */
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../middleware/errorHandler.middleware';

export interface Jwk { kid: string; kty: string; alg?: string; use?: string; n?: string; e?: string }
export type JwksFetcher = (url: string) => Promise<{ keys: Jwk[] }>;

export interface OidcProvider {
  name:    'google' | 'apple';
  issuers: string[];
  jwksUrl: string;
}

export const GOOGLE: OidcProvider = {
  name:    'google',
  issuers: ['https://accounts.google.com', 'accounts.google.com'],
  jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
};

export const APPLE: OidcProvider = {
  name:    'apple',
  issuers: ['https://appleid.apple.com'],
  jwksUrl: 'https://appleid.apple.com/auth/keys',
};

export interface VerifiedIdentity {
  provider:      'google' | 'apple';
  subject:       string;
  email:         string | null;
  emailVerified: boolean;
  name:          string | null;
}

const defaultFetcher: JwksFetcher = async (url) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`JWKS request failed with ${response.status}`);
  return response.json() as Promise<{ keys: Jwk[] }>;
};

const KEY_CACHE_MS = 60 * 60 * 1000;
const MIN_REFETCH_MS = 60 * 1000;

export function createOidcVerifier(fetchJwks: JwksFetcher = defaultFetcher, now: () => number = Date.now) {
  const cache = new Map<string, { fetchedAt: number; keys: Map<string, crypto.KeyObject> }>();

  async function loadKeys(provider: OidcProvider) {
    const { keys } = await fetchJwks(provider.jwksUrl);
    const usable = new Map<string, crypto.KeyObject>();
    for (const key of keys ?? []) {
      if (key.kty !== 'RSA' || !key.kid || (key.use && key.use !== 'sig')) continue;
      usable.set(key.kid, crypto.createPublicKey({ key: key as unknown as crypto.JsonWebKey, format: 'jwk' }));
    }
    const entry = { fetchedAt: now(), keys: usable };
    cache.set(provider.jwksUrl, entry);
    return entry;
  }

  async function signingKey(provider: OidcProvider, kid: string): Promise<crypto.KeyObject | null> {
    let entry = cache.get(provider.jwksUrl);
    if (!entry || now() - entry.fetchedAt > KEY_CACHE_MS) entry = await loadKeys(provider);
    // Providers rotate keys: an unknown kid warrants one refetch, rate-limited
    // so forged kids cannot be used to hammer the provider.
    if (!entry.keys.has(kid) && now() - entry.fetchedAt > MIN_REFETCH_MS) entry = await loadKeys(provider);
    return entry.keys.get(kid) ?? null;
  }

  return {
    async verify(provider: OidcProvider, idToken: string, audiences: string[]): Promise<VerifiedIdentity> {
      if (!audiences.length) {
        // Without a configured audience any app's token would be accepted.
        throw new UnauthorizedError(`${provider.name} sign-in is not configured`);
      }
      const decoded = jwt.decode(idToken, { complete: true });
      const kid = decoded && typeof decoded === 'object' ? decoded.header.kid : undefined;
      if (!kid) throw new UnauthorizedError('Invalid identity token');

      let key: crypto.KeyObject | null;
      try {
        key = await signingKey(provider, kid);
      } catch {
        throw new UnauthorizedError('Could not verify the identity token right now');
      }
      if (!key) throw new UnauthorizedError('Invalid identity token');

      let claims: jwt.JwtPayload;
      try {
        claims = jwt.verify(idToken, key, {
          algorithms: ['RS256'],
          issuer:     provider.issuers as [string, ...string[]],
          audience:   audiences as [string, ...string[]],
        }) as jwt.JwtPayload;
      } catch {
        throw new UnauthorizedError('Invalid identity token');
      }
      if (!claims.sub) throw new UnauthorizedError('Invalid identity token');

      const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : null;
      return {
        provider:      provider.name,
        subject:       String(claims.sub),
        email:         email || null,
        // Apple sends the flag as the string "true".
        emailVerified: claims.email_verified === true || claims.email_verified === 'true',
        name:          typeof claims.name === 'string' && claims.name.trim() ? claims.name.trim().slice(0, 100) : null,
      };
    },
  };
}

export type OidcVerifier = ReturnType<typeof createOidcVerifier>;
export const oidcVerifier = createOidcVerifier();
