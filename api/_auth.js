import { createRemoteJWKSet, jwtVerify } from 'jose';

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'trade-tracker-fb893';

// Firebase ID tokens are RS256, signed with Google's rotating securetoken keys.
// createRemoteJWKSet caches the key set and refetches on rotation.
const JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

/**
 * Verifies the Firebase ID token on the Authorization header.
 * Resolves with the token payload, or throws if the token is missing/invalid/expired.
 */
export async function verifyFirebaseToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    throw new Error('Missing bearer token');
  }

  const { payload } = await jwtVerify(header.slice(7), JWKS, {
    issuer: `https://securetoken.google.com/${PROJECT_ID}`,
    audience: PROJECT_ID
  });

  if (!payload.sub) {
    throw new Error('Token has no subject');
  }

  return payload;
}

/**
 * Wraps a handler with POST-only + auth checks. Keeps the two report endpoints
 * from duplicating the same preamble.
 */
export function withAuth(handler) {
  return async (req, res) => {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      await verifyFirebaseToken(req);
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' });
    }

    return handler(req, res);
  };
}
