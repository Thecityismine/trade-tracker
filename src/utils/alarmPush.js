import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import app, { auth, db } from '../config/firebase';

// Web Push certificate key: Firebase console → Project settings → Cloud Messaging.
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;
const DEVICE_KEY = 'alarmPushDeviceId';

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// iOS only allows web push for an app opened from the Home Screen.
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;

export const pushSupported = () =>
  typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

export const pushConfigured = () => Boolean(VAPID_KEY);

export function getStoredDeviceId() {
  try {
    return localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
}

async function sha256Hex(text) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Asks for permission, subscribes this browser to push and saves the token so
 * /api/alarms can reach it while the app is closed. Returns the device id.
 */
export async function registerAlarmDevice() {
  if (!pushSupported()) throw new Error('Push notifications are not supported here.');
  if (!VAPID_KEY) throw new Error('VITE_FIREBASE_VAPID_KEY is not set.');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed.');

  const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) throw new Error('Push notifications are not supported here.');

  const registration = await navigator.serviceWorker.register('/alarm-sw.js');
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) throw new Error('Could not get a push token.');

  const deviceId = await sha256Hex(token);
  await setDoc(doc(db, 'alarmDevices', deviceId), {
    token,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    enabled: true,
    userAgent: navigator.userAgent.slice(0, 200),
    uid: auth.currentUser?.uid || null,
    updatedAt: serverTimestamp()
  }, { merge: true });

  try {
    localStorage.setItem(DEVICE_KEY, deviceId);
  } catch {
    // Private mode — registration still worked, the page just won't remember it.
  }
  return deviceId;
}

export async function sendTestAlarm(deviceId) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch('/api/alarms?action=test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ deviceId })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Test notification failed.');
  }
}
