# Trade Feed: contract between btc-trade-tracker and Chart Lab

Version **1**. This file lives in both repos. Change them together.

btc-trade-tracker serves the trades it records. Chart Lab
(`market-swing-map-tracker`, https://skyline-chart-lab.vercel.app) plots them on
its charts with its indicators. That is the whole relationship.

## Rules

1. **One way, read-only.** Chart Lab reads trades from the feed. It never writes
   to the tracker. The tracker never reads Chart Lab's data. It only links to it.
2. **This document is the interface.** The tracker can reshape Firestore freely
   as long as the feed output below doesn't change. Additive fields are fine
   without a version bump. Renaming, removing or re-meaning a field bumps
   `version`, and Chart Lab checks it.
3. **Additive in Chart Lab.** The trade layer lives in its own module, endpoint
   and chart layer. It never touches `board.py`, `watch.py`, `telegram.py`,
   `config/alerts.json` or `config/rules.json`. Trades never become board alerts
   or Telegram messages. Any cache uses its own `chartlab:trades:*` keys.
4. **Failure stays local.** If the feed is down, slow or returns an unknown
   `version`, Chart Lab draws its chart without trades and shows a small note.
   Everything else keeps working.
5. **Server to server.** Only Chart Lab's server calls the feed. The key never
   reaches a browser. Trades are shown only behind Chart Lab's login.
6. **Prove nothing moved.** Chart Lab changes go on a branch with a Vercel
   preview. Before merging, its unit tests pass and `python swing.py board
   --check` gives the same output as on `main`.

## Endpoint

```
GET https://<tracker>/api/trade-feed
Authorization: Bearer <TRADE_FEED_KEY>
```

`TRADE_FEED_KEY` is its own key. It reads trades and nothing else. The AI
gateway key (`AI_GATEWAY_KEY`) does not open the feed, and the feed key does not
open the gateway. The endpoint uses the gateway's Firestore service account
(`FIREBASE_*` env vars, see AI-ACCESS.md).

| Status | Meaning |
|---|---|
| 200 | Feed below |
| 401 | Missing or wrong key |
| 429 | Over 120 requests/minute from one IP. Cache, don't poll. |
| 500 | Server misconfigured (names the missing variable) or Firestore failed |

### Query parameters (all optional)

| Param | Example | |
|---|---|---|
| `asset` | `BTC`, `ETH` | Case-insensitive |
| `status` | `open`, `closed` | Default: both |
| `ids` | `abc,def` | Specific trades. This is how a deep link is resolved. |
| `since` / `until` | `2026-10-01`, ISO time | Against the trade's time (entry → exit → logged). A bare `until` date includes that whole day. |
| `limit` | `500` | Default 1000, max 2000. Keeps the newest. |

## Response

```json
{
  "version": 1,
  "generatedAt": "2026-10-28T18:00:00.000Z",
  "screenshotTimeZone": "America/New_York",
  "count": 1,
  "total": 1,
  "trades": [
    {
      "id": "WazD3Y8P7HrpfS5JfoAC",
      "asset": "BTC",
      "direction": "short",
      "status": "closed",
      "entry": { "price": 80383, "time": "2026-10-27T12:58:51.000Z", "timeSource": "screenshot" },
      "exit":  { "price": 81004, "time": "2026-10-27T21:33:38.000Z", "timeSource": "screenshot" },
      "loggedAt": "2026-10-27T21:41:51.000Z",
      "stop": 80866,
      "target": 78937,
      "leverage": 40,
      "result": "loss",
      "pnlUsd": -17.18,
      "feesUsd": 2,
      "rMultiple": -1.29,
      "strategy": { "id": "NNySQS5mA4GICYn66d8j", "name": "📈NY 8pm Session Liquidity Range" },
      "entryReason": "Price rallied into the 52ema on the 30min…",
      "comment": "Need to cut losers quicker…",
      "entryChartUrl": "https://firebasestorage.googleapis.com/…",
      "exitChartUrl": "https://firebasestorage.googleapis.com/…",
      "trackerUrl": "https://<tracker>/#journal"
    }
  ]
}
```

- Trades come **oldest first**. Times are ISO 8601 UTC. Prices are in USD.
- Any field can be `null` when it wasn't recorded. Unlike the AI gateway,
  `null` fields are **not** omitted, so every trade has the same keys.
- `exit`, `result`, `pnlUsd` and `rMultiple` are `null` for open positions.
- `pnlUsd` is net of fees. `rMultiple` is the price move ÷ |entry − stop|,
  gross of fees, and `null` without a stop.
- `result` is `win` or `loss` as recorded. The tracker's scratch band (a small
  % of the account) is not applied here.
- `asset` is whatever ticker was logged. Today it is BTC or ETH. A chart should
  skip assets it doesn't carry.

### How sure each time is: `timeSource`

| Value | From | How to plot |
|---|---|---|
| `screenshot` | TradingView screenshot filename, converted from `screenshotTimeZone` | Solid marker |
| `app` | When the position was opened or closed in the tracker | Solid marker |
| `screenshot-unverified` | The only screenshot on an older trade. It may have been taken at the exit. | Faint marker, snap by price |
| `logged` | Exit only: when a finished trade was entered. It's an upper bound. | Faint marker, snap by price |
| `unknown` | Entry only: no time recorded. Use `loggedAt` as the latest it could be. | Snap by price before `loggedAt`, or don't plot |

**Snapping (Chart Lab side):** prices are exact. Times are only as good as their
source. For a faint time, place the marker on the nearest candle (searching
backwards from the given time) whose high–low range contains the price. Chart
Lab's candles are BingX, while trades were filled on Hyperliquid, Bitunix,
AsterDEX, Zoomex or BingX. Venues differ by a few dollars, so allow about 0.1%
when matching.

## Deep link (tracker → Chart Lab)

```
https://skyline-chart-lab.vercel.app/?trade=<id>&asset=BTC&t=<unix seconds>
```

| Param | |
|---|---|
| `trade` | Feed id. Chart Lab resolves it with `?ids=<id>`. |
| `asset` | Open this coin straight away |
| `t` | A rough time (opened in the app, else logged), for centring before the feed answers. The feed's `entry.time` wins. |

Chart Lab picks the timeframe. A later `tf` parameter would be additive.

The tracker builds the link in `src/utils/chartLab.js`. The base URL can be
overridden with `VITE_CHART_LAB_URL`.

## Setup

| Where | Variable | Value |
|---|---|---|
| Tracker (Vercel) | `TRADE_FEED_KEY` | Random. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| Tracker (Vercel) | `TRADE_FEED_TZ` | *(optional)* Screenshot time zone, default `America/New_York` |
| Chart Lab (Vercel + local `.env`) | `TRADE_FEED_URL` | `https://<tracker>/api/trade-feed` |
| Chart Lab (Vercel + local `.env`) | `TRADE_FEED_KEY` | Same value as the tracker's |

Redeploy after adding them. To check it works:

```bash
curl -H "Authorization: Bearer $TRADE_FEED_KEY" "https://<tracker>/api/trade-feed?limit=2"
```

## Phases

1. **Tracker (done):** the feed, this contract and the "Open in Chart Lab"
   links in trade details and the Review Queue. Until phase 2 ships, the link
   opens Chart Lab without the trade.
2. **Chart Lab:** `/api/trades` (server-side proxy with a cache), a "My trades"
   layer (entry and exit markers, plus stop and target lines for the selected
   trade), opening at a trade from the deep link, and a review mode that steps
   through trades.
3. **Both:** Chart Lab works out the indicator readings at each entry (Skyline,
   WaveTrend, divergences). The tracker stores them on the trade so the coach
   can use them. That gives this contract a second, still read-only direction,
   and it gets its own version.
4. **Merge:** the Python engine (indicators, swing map, board, watcher,
   Telegram) stays as it is. The React app becomes the single front end, and
   one login replaces two.
