import { getMessaging } from 'firebase-admin/messaging';
import { FieldValue } from 'firebase-admin/firestore';
import { adminApp, adminDb } from './_ai/firestore.js';
import { verifyFirebaseToken } from './_auth.js';

/**
 * Background alarms. The in-page ticker in App.jsx only runs while the app is
 * on screen; iOS suspends it the moment the PWA is backgrounded. This endpoint
 * closes that gap by sending a Web Push through Firebase Cloud Messaging.
 *
 *   GET  /api/alarms               — the sender. Called once a minute by an
 *                                    external scheduler with CRON_SECRET.
 *   POST /api/alarms?action=test   — sends a test push to one device.
 *
 * Devices register themselves in the `alarmDevices` collection from the
 * Alarms page, each with the IANA time zone it was registered in, so "6:00 PM"
 * means 6:00 PM where the phone is.
 */

// A scheduler tick can land a little late; look back this many minutes so a
// delayed run still sends. alarmRuns makes each alarm send at most once.
const LOOKBACK_MINUTES = 2;

const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered'
]);

function formatTime12(time24) {
  const [h, m] = time24.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** The wall-clock date, HH:MM and weekday of `date` in `timeZone`. */
function localParts(date, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      weekday: 'short'
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hhmm: `${parts.hour}:${parts.minute}`,
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday)
  };
}

function pushMessage(title, body) {
  return {
    // Data-only: the service worker builds the notification itself, so the
    // same code path shows it whether or not the Firebase SDK is loaded.
    data: { title, body, url: '/' },
    webpush: {
      // An alarm that arrives an hour late is worse than none.
      headers: { Urgency: 'high', TTL: '300' }
    }
  };
}

async function sendToDevices(devices, title, body) {
  if (devices.length === 0) return { successCount: 0, failureCount: 0 };
  const result = await getMessaging(adminApp()).sendEachForMulticast({
    tokens: devices.map((d) => d.token),
    ...pushMessage(title, body)
  });
  await Promise.all(result.responses.map((response, i) => {
    if (response.success || !INVALID_TOKEN_CODES.has(response.error?.code)) return null;
    return devices[i].ref.set({ enabled: false, disabledAt: FieldValue.serverTimestamp() }, { merge: true });
  }));
  return { successCount: result.successCount, failureCount: result.failureCount };
}

async function runSender(res) {
  const db = adminDb();
  const [alarmsSnap, devicesSnap] = await Promise.all([
    db.collection('alarms').where('enabled', '==', true).get(),
    db.collection('alarmDevices').where('enabled', '==', true).get()
  ]);

  const alarms = alarmsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const devices = devicesSnap.docs
    .map((d) => ({ ref: d.ref, token: d.get('token'), timeZone: d.get('timeZone') || 'UTC' }))
    .filter((d) => typeof d.token === 'string' && d.token.length > 0);

  // Devices in different time zones see a different wall clock, so group them.
  const byZone = new Map();
  for (const device of devices) {
    if (!byZone.has(device.timeZone)) byZone.set(device.timeZone, []);
    byZone.get(device.timeZone).push(device);
  }

  const now = Date.now();
  let sent = 0;
  const fired = [];

  for (const [timeZone, zoneDevices] of byZone) {
    for (let back = 0; back <= LOOKBACK_MINUTES; back++) {
      const { date, hhmm, weekday } = localParts(new Date(now - back * 60_000), timeZone);
      for (const alarm of alarms) {
        if (alarm.time !== hhmm || !alarm.days?.includes(weekday)) continue;

        // create() fails if the doc exists, so overlapping runs can't double-send.
        const runRef = db.collection('alarmRuns').doc(`${alarm.id}_${timeZone.replace(/\//g, '-')}_${date}_${hhmm}`);
        try {
          await runRef.create({ alarmId: alarm.id, timeZone, date, time: hhmm, createdAt: FieldValue.serverTimestamp() });
        } catch {
          continue;
        }

        const result = await sendToDevices(zoneDevices, alarm.label || 'Alarm', formatTime12(hhmm));
        await runRef.set(result, { merge: true });
        sent += result.successCount;
        fired.push({ alarm: alarm.label || 'Alarm', time: hhmm, timeZone });
      }
    }
  }

  return res.status(200).json({ ok: true, devices: devices.length, fired, sent });
}

async function sendTest(req, res) {
  try {
    await verifyFirebaseToken(req);
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const deviceId = req.body?.deviceId;
  if (typeof deviceId !== 'string' || !/^[a-f0-9]{64}$/.test(deviceId)) {
    return res.status(400).json({ error: 'Invalid device' });
  }

  const snap = await adminDb().collection('alarmDevices').doc(deviceId).get();
  if (!snap.exists || snap.get('enabled') !== true) {
    return res.status(404).json({ error: 'This device is not registered' });
  }

  const result = await sendToDevices(
    [{ ref: snap.ref, token: snap.get('token') }],
    'Test alarm',
    'Notifications are working on this device.'
  );
  if (result.successCount === 0) return res.status(502).json({ error: 'Push was rejected for this device' });
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const secret = process.env.CRON_SECRET;
      if (!secret) return res.status(503).json({ error: 'CRON_SECRET is not configured.' });
      if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
      return await runSender(res);
    }

    if (req.method === 'POST' && req.query.action === 'test') {
      return await sendTest(req, res);
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Alarm endpoint failed:', error);
    return res.status(500).json({ error: 'Alarm endpoint failed' });
  }
}
