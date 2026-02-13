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

const febWeekOneTrades = [
  { ticker: 'BTC - Dec', direction: 'long', result: 'loss', entryPrice: 66075, exitPrice: 64474, leverage: 25, gainLoss: -102.83, fee: 3.38, pnlPercent: -60.58, tradeDate: '2026-02-05T18:25:00' },
  { ticker: 'BTC - Dec', direction: 'long', result: 'loss', entryPrice: 66075, exitPrice: 64474, leverage: 25, gainLoss: -17.59, fee: 2.51, pnlPercent: -60.58, tradeDate: '2026-02-05T18:24:00' },
  { ticker: 'BTC - Dec', direction: 'long', result: 'loss', entryPrice: 70810, exitPrice: 70285, leverage: 25, gainLoss: -25.74, fee: 2.12, pnlPercent: -18.54, tradeDate: '2026-02-05T00:22:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 72866, exitPrice: 72123, leverage: 25, gainLoss: 15.38, fee: 1.38, pnlPercent: 25.49, tradeDate: '2026-02-04T20:22:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 73598, exitPrice: 73129, leverage: 25, gainLoss: 9.36, fee: 1.36, pnlPercent: 15.93, tradeDate: '2026-02-04T16:38:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 74015, exitPrice: 73399, leverage: 25, gainLoss: 12.44, fee: 1.36, pnlPercent: 20.81, tradeDate: '2026-02-04T14:00:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 75336, exitPrice: 74451, leverage: 25, gainLoss: 17.21, fee: 1.31, pnlPercent: 29.37, tradeDate: '2026-02-04T10:04:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'loss', entryPrice: 76073, exitPrice: 76232, leverage: 25, gainLoss: -3.84, fee: 1.32, pnlPercent: -5.23, tradeDate: '2026-02-04T07:21:00' },
  { ticker: 'BTC - Dec', direction: 'long', result: 'win', entryPrice: 75831, exitPrice: 76454, leverage: 25, gainLoss: 19.42, fee: 1.32, pnlPercent: 20.54, tradeDate: '2026-02-04T07:18:00' },
  { ticker: 'BTC - Dec', direction: 'long', result: 'loss', entryPrice: 75953, exitPrice: 75117, leverage: 25, gainLoss: -29.71, fee: 2.23, pnlPercent: -27.52, tradeDate: '2026-02-03T14:25:00' },
  { ticker: 'BTC - Dec', direction: 'long', result: 'loss', entryPrice: 75186, exitPrice: 74790, leverage: 25, gainLoss: -7.4, fee: 1.12, pnlPercent: -13.17, tradeDate: '2026-02-03T12:45:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 78228, exitPrice: 77278, leverage: 25, gainLoss: 29.99, fee: 2.14, pnlPercent: 30.36, tradeDate: '2026-02-03T10:17:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 78710, exitPrice: 77645, leverage: 25, gainLoss: 46.34, fee: 3.04, pnlPercent: 33.83, tradeDate: '2026-02-02T22:04:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'loss', entryPrice: 77340, exitPrice: 78555, leverage: 25, gainLoss: -71.11, fee: 3.88, pnlPercent: -39.27, tradeDate: '2026-02-02T12:49:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 76473, exitPrice: 75550, leverage: 25, gainLoss: 6.91, fee: 0.51, pnlPercent: 30.17, tradeDate: '2026-02-01T22:19:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 77297, exitPrice: 76845, leverage: 25, gainLoss: 29.71, fee: 4.74, pnlPercent: 14.62, tradeDate: '2026-02-01T20:13:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 77372, exitPrice: 76783, leverage: 25, gainLoss: 23.61, fee: 2.83, pnlPercent: 19.03, tradeDate: '2026-02-01T17:24:00' },
  { ticker: 'BTC - Dec', direction: 'short', result: 'win', entryPrice: 78177, exitPrice: 77768, leverage: 25, gainLoss: 10.42, fee: 1.43, pnlPercent: 13.08, tradeDate: '2026-02-01T14:09:00' }
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

  for (const trade of febWeekOneTrades) {
    const tradePayload = {
      ...trade,
      comment: '',
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

  console.log(`seed complete: inserted=${inserted}, skipped=${skipped}, sourceRows=${febWeekOneTrades.length}`);
};

seed().catch((error) => {
  console.error('seed failed:', error);
  process.exitCode = 1;
});
