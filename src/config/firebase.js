import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
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
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
