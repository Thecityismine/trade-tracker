import { initializeApp } from 'firebase/app';
import { addDoc, collection, getDocs, getFirestore, serverTimestamp } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyAYzsd9MYv1_SokVWFWiUea-sDfwdEL0CE',
  authDomain: 'trade-tracker-fb893.firebaseapp.com',
  projectId: 'trade-tracker-fb893',
  storageBucket: 'trade-tracker-fb893.firebasestorage.app',
  messagingSenderId: '373635404246',
  appId: '1:373635404246:web:28478eff29ccb926611477'
};

const januaryTrades = [
  // Jan 25-31, 2026
  { ticker: 'BTC - Dec', direction: 'long', result: 'loss', entryPrice: 81373, exitPrice: 80924, leverage: 25, gainLoss: -8.26, fee: 1.20, pnlPercent: -13.79, comment: '', tradeDate: '2026-01-31T09:41:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 84077, exitPrice: 82772, leverage: 25, gainLoss: 58.49, fee: 2.97, pnlPercent: 38.80, comment: 'Good Entry, still a bit too early but got most of the downside', tradeDate: '2026-01-31T05:32:00' },
  { ticker: 'ETH - Dec', direction: 'long', result: 'win', entryPrice: 2772, exitPrice: 2805, leverage: 25, gainLoss: 14.26, fee: 1.10, pnlPercent: 29.76, comment: '', tradeDate: '2026-01-29T14:35:00' },
  { ticker: 'ETH - Dec', direction: 'long', result: 'loss', entryPrice: 2825, exitPrice: 2798, leverage: 25, gainLoss: -25.00, fee: 2.18, pnlPercent: -23.89, comment: '', tradeDate: '2026-01-29T14:34:00' },
  { ticker: 'ETH - Dec', direction: 'long', result: 'loss', entryPrice: 2860, exitPrice: 2827, leverage: 25, gainLoss: -42.00, fee: 2.77, pnlPercent: -28.85, comment: '', tradeDate: '2026-01-29T10:25:00' },
  { ticker: 'ETH - Dec', direction: 'short', result: 'win', entryPrice: 3014, exitPrice: 3008, leverage: 25, gainLoss: 4.23, fee: 2.48, pnlPercent: 4.98, comment: '', tradeDate: '2026-01-28T21:58:00' },
  { ticker: 'ETH - Dec', direction: 'short', result: 'win', entryPrice: 3040, exitPrice: 2950, leverage: 25, gainLoss: 41.91, fee: 1.23, pnlPercent: 74.01, comment: '', tradeDate: '2026-01-28T21:55:00' },
  { ticker: 'ETH - Dec', direction: 'short', result: 'win', entryPrice: 2964, exitPrice: 2944, leverage: 25, gainLoss: 18.97, fee: 1.24, pnlPercent: 16.87, comment: 'Re-entered short after hitting my limit target', tradeDate: '2026-01-27T12:19:00' },
  { ticker: 'ETH - Dec', direction: 'short', result: 'loss', entryPrice: 2934, exitPrice: 2950, leverage: 25, gainLoss: -6.28, fee: 1.11, pnlPercent: -13.63, comment: 'Clicked long instead of short to add, blew trade up', tradeDate: '2026-01-27T12:17:00' },
  { ticker: 'ETH - Dec', direction: 'long', result: 'win', entryPrice: 2795, exitPrice: 2870, leverage: 25, gainLoss: 34.43, fee: 0.80, pnlPercent: 67.08, comment: '', tradeDate: '2026-01-25T20:14:00' },
  { ticker: 'BTC - Dec', direction: 'long', result: 'win', entryPrice: 86585, exitPrice: 87342, leverage: 25, gainLoss: 4.26, fee: 0.41, pnlPercent: 21.86, comment: '', tradeDate: '2026-01-25T20:12:00' },
  { ticker: 'ETH - Dec', direction: 'long', result: 'loss', entryPrice: 2868, exitPrice: 2833, leverage: 25, gainLoss: -31.86, fee: 2.19, pnlPercent: -30.51, comment: '', tradeDate: '2026-01-25T13:53:00' },

  // Jan 18-24, 2026
  { ticker: 'ETH - Dec', direction: 'short', result: 'win', entryPrice: 2998, exitPrice: 2957, leverage: 25, gainLoss: 23.91, fee: 1.53, pnlPercent: 34.19, comment: 'good entry', tradeDate: '2026-01-23T17:30:00' },
  { ticker: 'ETH - Dec', direction: 'short', result: 'loss', entryPrice: 2981, exitPrice: 3039, leverage: 25, gainLoss: -29.39, fee: 1.23, pnlPercent: -48.64, comment: 'stopped out', tradeDate: '2026-01-23T17:26:00' },
  { ticker: 'ETH - Dec', direction: 'short', result: 'win', entryPrice: 3341, exitPrice: 3243, leverage: 25, gainLoss: 44.39, fee: 1.30, pnlPercent: 73.33, comment: 'Trend? why enter now?', tradeDate: '2026-01-18T19:03:00' },
  { ticker: 'ETH - Dec', direction: 'short', result: 'loss', entryPrice: 3319, exitPrice: 3330, leverage: 25, gainLoss: -6.38, fee: 1.50, pnlPercent: -8.29, comment: 'stopped out', tradeDate: '2026-01-18T16:10:00' },

  // Jan 11-17, 2026
  { ticker: 'BTC - Dec', direction: 'long', result: 'loss', entryPrice: 3281, exitPrice: 3270, leverage: 25, gainLoss: -6.66, fee: 1.45, pnlPercent: -8.38, comment: 'Trend? why enter now?', tradeDate: '2026-01-16T11:09:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 97476, exitPrice: 96726, leverage: 25, gainLoss: 11.94, fee: 1.41, pnlPercent: 19.24, comment: 'Trend? why enter now?', tradeDate: '2026-01-14T13:19:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'loss', entryPrice: 92954, exitPrice: 94737, leverage: 25, gainLoss: -53.69, fee: 2.39, pnlPercent: -47.95, comment: 'Trend? why enter now?', tradeDate: '2026-01-14T13:16:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 91918, exitPrice: 90945, leverage: 25, gainLoss: 13.01, fee: 1.10, pnlPercent: 26.46, comment: 'Trend? why enter now?', tradeDate: '2026-01-12T12:33:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 92305, exitPrice: 91916, leverage: 25, gainLoss: 5.41, fee: 1.23, pnlPercent: 10.54, comment: 'Trend? why enter now?', tradeDate: '2026-01-11T22:55:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 91160, exitPrice: 90480, leverage: 25, gainLoss: 12.04, fee: 1.50, pnlPercent: 18.65, comment: 'great short entry, waiting for the retest and entered short', tradeDate: '2026-01-11T15:17:00' },

  // Jan 4-10, 2026
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 91623, exitPrice: 90901, leverage: 25, gainLoss: 4.27, fee: 0.50, pnlPercent: 19.70, comment: 'Trend? why enter now?', tradeDate: '2026-01-09T10:55:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 91161, exitPrice: 90549, leverage: 25, gainLoss: 12.05, fee: 1.64, pnlPercent: 16.78, comment: 'Trend? why enter now?', tradeDate: '2026-01-09T07:10:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 93114, exitPrice: 90346, leverage: 25, gainLoss: 32.20, fee: 0.93, pnlPercent: 74.32, comment: 'Trend? why enter now?', tradeDate: '2026-01-09T07:09:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'loss', entryPrice: 91352, exitPrice: 91962, leverage: 25, gainLoss: -9.62, fee: 1.06, pnlPercent: -16.69, comment: 'Trend? why enter now?', tradeDate: '2026-01-04T13:54:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'loss', entryPrice: 90052, exitPrice: 91773, leverage: 25, gainLoss: -46.99, fee: 1.64, pnlPercent: -47.78, comment: '', tradeDate: '2026-01-04T13:51:00' }
];

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const signature = (trade) => {
  const tradeDate = trade.tradeDate?.toDate?.() || new Date(trade.tradeDate);
  const tradeDateMs = tradeDate.getTime();

  return [
    trade.ticker,
    trade.direction,
    trade.result,
    Number(trade.entryPrice),
    Number(trade.exitPrice),
    Number(trade.leverage),
    Number(trade.gainLoss).toFixed(2),
    Number(trade.fee).toFixed(2),
    Number(trade.pnlPercent).toFixed(2),
    tradeDateMs
  ].join('|');
};

const seed = async () => {
  const tradesCollection = collection(db, 'trades');
  const existingSnapshot = await getDocs(tradesCollection);
  const existingSignatures = new Set(existingSnapshot.docs.map((doc) => signature(doc.data())));

  let inserted = 0;
  let skipped = 0;

  for (const trade of januaryTrades) {
    const tradePayload = {
      ...trade,
      tradeDate: new Date(trade.tradeDate),
      createdAt: serverTimestamp()
    };

    const key = signature(tradePayload);
    if (existingSignatures.has(key)) {
      skipped += 1;
      continue;
    }

    await addDoc(tradesCollection, tradePayload);
    existingSignatures.add(key);
    inserted += 1;
  }

  console.log(`seed complete: inserted=${inserted}, skipped=${skipped}, sourceRows=${januaryTrades.length}`);
};

seed().catch((error) => {
  console.error('seed failed:', error);
  process.exitCode = 1;
});
