import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_NAME = 'ai-gateway';

/**
 * The browser reads Firestore with the signed-in user's credentials. Serverless
 * functions have no user, so the AI endpoints need a service account of their
 * own. Vercel stores multi-line env vars with literal \n, which the cert()
 * parser rejects, hence the unescape.
 */
function readCredentials() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  const missing = [
    !projectId && 'FIREBASE_PROJECT_ID',
    !clientEmail && 'FIREBASE_CLIENT_EMAIL',
    !privateKey && 'FIREBASE_PRIVATE_KEY'
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Firestore service account is not configured. Missing: ${missing.join(', ')}`);
  }

  return {
    projectId,
    clientEmail,
    privateKey: privateKey.replace(/\n/g, '\n')
  };
}

/**
 * Reuses the app across warm invocations — initializeApp throws if called twice
 * with the same name, and a cold init on every request would burn ~200ms.
 */
export function adminDb() {
  const existing = getApps().find((app) => app.name === APP_NAME);
  if (existing) {
    return getFirestore(existing);
  }

  const credentials = readCredentials();
  const app = initializeApp(
    { credential: cert(credentials), projectId: credentials.projectId },
    APP_NAME
  );

  const db = getFirestore(app);
  // Without this, every date field comes back as a Timestamp instance that
  // JSON.stringify flattens to {_seconds, _nanoseconds} — unreadable to a model.
  db.settings({ ignoreUndefinedProperties: true });
  return db;
}

/** Reads a whole collection. These collections are in the low hundreds of docs. */
export async function readCollection(name, { limit = null, orderBy = null } = {}) {
  let ref = adminDb().collection(name);

  if (orderBy) {
    // A doc missing the orderBy field is dropped by Firestore rather than
    // sorted last, so ordering is applied in memory by the callers that need
    // it. This branch exists only for callers that know the field is present.
    ref = ref.orderBy(orderBy.field, orderBy.direction || 'desc');
  }
  if (limit) {
    ref = ref.limit(limit);
  }

  const snap = await ref.get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function readDocument(collection, id) {
  const snap = await adminDb().collection(collection).doc(id).get();
  return snap.exists ? { id: snap.id, ...snap.data() } : null;
}
