import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// TODO: Replace with your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAYzsd9MYv1_SokVWFWiUea-sDfwdEL0CE",
  authDomain: "trade-tracker-fb893.firebaseapp.com",
  projectId: "trade-tracker-fb893",
  storageBucket: "trade-tracker-fb893.firebasestorage.app",
  messagingSenderId: "373635404246",
  appId: "1:373635404246:web:28478eff29ccb926611477"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize services
// Keep a copy of the data on the device (IndexedDB). Listeners then answer
// from that copy immediately and sync with the server in the background,
// instead of every page opening empty until the network round-trip finishes.
// Falls back to an in-memory cache where IndexedDB isn't available.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
export const storage = getStorage(app);
export const auth = getAuth(app);

export default app;
