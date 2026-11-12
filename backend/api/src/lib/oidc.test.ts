import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { APPLE, createOidcVerifier, GOOGLE, Jwk } from './oidc';

function keyPair(kid: string) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...(publicKey.export({ format: 'jwk' }) as object), kid, use: 'sig', alg: 'RS256' } as Jwk;
  return { kid, privateKey, jwk };
}

const google = keyPair('google-key-1');
const stranger = keyPair('google-key-1'); // same kid, different key
const AUDIENCE = 'glimms-ios.apps.googleusercontent.com';

function token(claims: Record<string, unknown>, options: { key?: typeof google; expiresIn?: number; algorithm?: jwt.Algorithm } = {}) {
  const key = options.key ?? google;
  return jwt.sign(
    { iss: 'https://accounts.google.com', aud: AUDIENCE, sub: 'google-user-1', email: 'Ada@Example.com', email_verified: true, ...claims },
    key.privateKey,
    { algorithm: options.algorithm ?? 'RS256', keyid: key.kid, expiresIn: options.expiresIn ?? 300 },
  );
}

function verifierWith(keys: Jwk[] = [google.jwk]) {
  const fetchJwks = jest.fn(async () => ({ keys }));
  let now = 1_000_000;
  const verifier = createOidcVerifier(fetchJwks, () => now);
  return { verifier, fetchJwks, advance: (ms: number) => { now += ms; } };
}

describe('verify', () => {
  it('accepts a token signed by the provider for this app', async () => {
    const { verifier } = verifierWith();
    await expect(verifier.verify(GOOGLE, token({ name: ' Ada Lovelace ' }), [AUDIENCE])).resolves.toEqual({
      provider: 'google', subject: 'google-user-1', email: 'ada@example.com', emailVerified: true, name: 'Ada Lovelace',
    });
  });

  it('reads Apple\'s string email_verified flag', async () => {
    const { verifier } = verifierWith();
    const appleToken = token({ iss: 'https://appleid.apple.com', aud: 'com.glimms.app', email_verified: 'true' });
    await expect(verifier.verify(APPLE, appleToken, ['com.glimms.app'])).resolves.toMatchObject({
      provider: 'apple', emailVerified: true,
    });
  });

  it.each([
    ['another app\'s audience', () => token({ aud: 'someone-else.apps.googleusercontent.com' })],
    ['another issuer', () => token({ iss: 'https://evil.example' })],
    ['an expired token', () => token({}, { expiresIn: -10 })],
    ['a token signed by a different key with the same kid', () => token({}, { key: stranger })],
    ['a token with no subject', () => token({ sub: undefined })],
    ['garbage', () => 'not-a-jwt'],
  ])('rejects %s', async (_label, make) => {
    const { verifier } = verifierWith();
    await expect(verifier.verify(GOOGLE, make(), [AUDIENCE])).rejects.toMatchObject({ statusCode: 401 });
  });

  it('rejects a token that uses the public key as an HMAC secret', async () => {
    const { verifier } = verifierWith();
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: google.kid })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: 'https://accounts.google.com', aud: AUDIENCE, sub: 'attacker', exp: Math.floor(Date.now() / 1000) + 300,
    })).toString('base64url');
    const secret = crypto.createPublicKey({ key: google.jwk as any, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
    const signature = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');

    await expect(verifier.verify(GOOGLE, `${header}.${payload}.${signature}`, [AUDIENCE]))
      .rejects.toMatchObject({ statusCode: 401 });
  });

  it('refuses everything when no audience is configured', async () => {
    const { verifier, fetchJwks } = verifierWith();
    await expect(verifier.verify(GOOGLE, token({}), [])).rejects.toMatchObject({ statusCode: 401 });
    expect(fetchJwks).not.toHaveBeenCalled();
  });

  it('answers 401, not 500, when the provider\'s keys cannot be fetched', async () => {
    const verifier = createOidcVerifier(async () => { throw new Error('network down'); });
    await expect(verifier.verify(GOOGLE, token({}), [AUDIENCE])).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('key cache', () => {
  it('fetches the keys once for many tokens', async () => {
    const { verifier, fetchJwks } = verifierWith();
    await verifier.verify(GOOGLE, token({}), [AUDIENCE]);
    await verifier.verify(GOOGLE, token({}), [AUDIENCE]);
    expect(fetchJwks).toHaveBeenCalledTimes(1);
  });

  it('refetches for an unknown key id, but not more than once a minute', async () => {
    const rotated = keyPair('google-key-2');
    const keys = [google.jwk];
    const { verifier, fetchJwks, advance } = verifierWith(keys);
    await verifier.verify(GOOGLE, token({}), [AUDIENCE]);

    // Forged kids right after a fetch do not trigger another one.
    await expect(verifier.verify(GOOGLE, token({}, { key: rotated }), [AUDIENCE])).rejects.toMatchObject({ statusCode: 401 });
    expect(fetchJwks).toHaveBeenCalledTimes(1);

    keys.push(rotated.jwk); // the provider publishes its new key
    advance(61_000);
    await expect(verifier.verify(GOOGLE, token({}, { key: rotated }), [AUDIENCE])).resolves.toMatchObject({ subject: 'google-user-1' });
    expect(fetchJwks).toHaveBeenCalledTimes(2);
  });
});
