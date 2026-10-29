# Chart Data: contract between Chart Lab and btc-trade-tracker

Version **1**. This file lives in both repos. Change them together.

This is the second direction of the link described in TRADE_FEED.md.
**Chart Lab** (`market-swing-map-tracker`, https://skyline-chart-lab.vercel.app)
serves candles and the indicators it already calculates. The tracker's
**Trade Review** page draws them with Lightweight Charts, next to your trades,
so reviewing happens inside one app. Chart Lab keeps doing all the maths. The
tracker only draws what it gets.

## Rules (same spirit as the trade feed)

1. **Read-only, closed candles only.** Indicators never use the forming
   candle. It may be returned separately as `forming`, for drawing only.
2. **Additive in Chart Lab.** The data API lives in its own module and
   endpoints. It never touches `board.py`, `watch.py`, `telegram.py`,
   `config/alerts.json` or `config/rules.json`. The swing map, trigger board
   and Telegram stay BTC/ETH-only and unchanged.
3. **Its own key.** `CHARTLAB_DATA_KEY` opens `/api/data/*` and nothing else.
   It is not the login cookie, and it is not the trade-feed key. Only the
   tracker's server holds it; it never reaches a browser.
4. **Failure stays local.** If the API is down or returns an unknown
   `version`, the tracker's review page still lists and reviews trades. It
   shows the screenshots instead of the chart, with a note.
5. **Prove nothing moved.** Chart Lab tests pass, and `python swing.py board`
   / `board --check` give the same output before and after.

## Auth

```
GET https://skyline-chart-lab.vercel.app/api/data/...
Authorization: Bearer <CHARTLAB_DATA_KEY>
```

| Status | Meaning |
|---|---|
| 200 | Body below |
| 400 | Bad parameter (`{"error": "..."}` says which) |
| 401 | Missing or wrong key |
| 404 | Unknown asset (not on BingX or the fallback) |
| 502 | The exchange didn't answer. Retry later. |

## Assets: any symbol, on demand

Nothing is hard-coded to BTC and ETH. `asset` is the plain coin name (`BTC`,
`SOL`, `PEPE`). Chart Lab:

- maps it to the exchange symbol, `<ASSET>-USDT` on BingX, with an override
  table for odd names such as `PEPE` → `1000PEPE-USDT`
- fetches and caches candles the first time anyone asks for that coin. Coins
  nobody opens cost nothing.
- falls back to Hyperliquid candles for coins BingX doesn't list. Hyperliquid
  only keeps its last 5,000 candles per timeframe, so history is shorter.
- sends `verified: true` only for coins whose indicators were checked against
  TradingView (BTC and ETH today). Other coins use the same maths, unchecked.

### `GET /api/data/assets`

```json
{
  "version": 1,
  "timeframes": ["10m","12m","15m","30m","1H","2H","4H","6H","8H","12H","1D","3D","1W","1M"],
  "assets": [
    { "asset": "BTC", "symbol": "BTC-USDT", "source": "bingx", "verified": true },
    { "asset": "ETH", "symbol": "ETH-USDT", "source": "bingx", "verified": true }
  ],
  "lookup": "Any asset not listed can still be requested; 404 if the exchange has no such contract."
}
```

`assets` lists the coins already cached. Any other coin can still be asked for.

## `GET /api/data/series`

| Param | Example | |
|---|---|---|
| `asset` | `BTC` | Required |
| `tf` | `10m` | Required. One of `timeframes`. Accepts `1h`/`4h` too, like Chart Lab's URL. |
| `to` | `1793142000` | Unix seconds. The last candle returned is the last closed one at or before `to`. Default: now. |
| `bars` | `400` | How many closed candles to return, ending at `to`. Default 400, max 1500. |
| `layers` | `wt,skyline,nyliq,ema,ribbon` | Default: all five |

Indicators are calculated over the full cached history, as Chart Lab does
today, then cut to the window. So the first candle in the window already
has its EMA 400 and Skyline values.

```json
{
  "version": 1,
  "asset": "BTC", "symbol": "BTC-USDT", "source": "bingx", "verified": true,
  "tf": "10m", "tfSeconds": 600,
  "candles": [ [1793100000, 80210.1, 80244.0, 80190.2, 80230.5, 182.4] ],
  "forming": [1793142000, 81320.0, 81325.8, 81278.9, 81282.6, 12.1],
  "layers": {
    "ema":     { "ema200": [[1793100000, 79512.3]], "ema400": [[1793100000, 78890.1]] },
    "ribbon":  { "ema5": [[t, v]], "ema13": [[t, v]], "ema89": [[t, v]] },
    "skyline": {
      "line":   [[t, v]],
      "regime": [[t, "BULL"]],
      "flips":  [{ "t": 1793120000, "to": "BULL", "price": 80100.0 }]
    },
    "wt": {
      "wt1": [[t, v]], "wt2": [[t, v]],
      "crosses": [{ "t": 1793121000, "dir": "up", "wt2": -48.2 }],
      "divergences": [{ "t": 1793090000, "kind": "hidden_bull", "label": "H" }],
      "levels": { "overbought": 53, "oversold": -60 }
    },
    "nyliq": {
      "boxes": [{ "label": "8pm range", "start": 1793059200, "end": 1793073600, "high": 80500.0, "low": 80120.0, "color": "#FBBF24" }],
      "lines": [{ "label": "8pm H", "price": 80500.0, "start": 1793073600, "end": null, "style": "dashed", "color": "#FBBF24" }],
      "markers": [{ "t": 1793104000, "position": "above", "text": "sweep", "color": "#FBBF24" }]
    }
  }
}
```

- `candles` / `forming` rows are `[time, open, high, low, close, volume]`.
  `time` is the candle's **open** time in Unix seconds, UTC. Oldest first.
  `forming` is `null` when the window ends in the past.
- Series are `[time, value]` pairs on the same times as `candles`. A value
  can be `null` where an indicator has no value yet.
- **NY Liq Suite is sent as drawing primitives** (`boxes`, `lines`,
  `markers`), the same way Chart Lab already draws it. The tracker draws them
  without knowing the suite's logic, so Chart Lab can change the suite
  without a contract change. `end: null` on a line means it runs to the
  right edge.
- Colours are optional hints. The tracker may use its own palette.

## `GET /api/data/readout`

The indicator snapshot at a trade's entry. It feeds the review panel and the
AI review.

| Param | Example | |
|---|---|---|
| `asset` | `BTC` | Required |
| `tf` | `10m` | Required. The trade's timeframe. Default to `10m` when the trade has none. |
| `t` | `1793105931` | Required. Entry time, Unix seconds |
| `price` | `80383` | Optional. Entry price. When the time is only a guess, Chart Lab may snap to the candle that traded this price (the trade feed's snapping rule). |

```json
{
  "version": 1,
  "asset": "BTC", "tf": "10m",
  "candleTime": 1793105400,
  "basis": "The last 10m candle that closed before the entry. Closed candles only.",
  "snapped": false,
  "readout": {
    "skyline": { "10m": { "regime": "BULL", "distancePct": 0.7, "bars": 0 }, "4H": { "regime": "BULL", "distancePct": 1.11, "bars": 35 } },
    "wt": { "wt1": 70.64, "wt2": 60.39, "zone": "overbought", "lastCross": { "dir": "up", "barsAgo": 3 } },
    "divergence": null,
    "ribbon": { "trend": "up", "gapAtr": 1.16, "barsSinceStart": 0 },
    "ema": { "above200": true, "above400": true },
    "nyliq": { "summary": "Swept the 8pm range high 2 bars before entry" },
    "close": 80330.0
  },
  "rows": [
    { "label": "Skyline 10m", "value": "BULL · +0.7% · 0 bars", "tone": "bull" },
    { "label": "Skyline 4H",  "value": "BULL · +1.11% · 35 bars", "tone": "bull" },
    { "label": "WaveTrend",   "value": "WT1 70.6 · WT2 60.4", "tone": "warn" },
    { "label": "Last WT cross", "value": "green · 3 bars ago", "tone": "bull" },
    { "label": "EMA 5/13/89", "value": "trend up · gap 1.16 ATR", "tone": "bull" },
    { "label": "NY Liq Suite", "value": "Swept 8pm high", "tone": "warn" }
  ]
}
```

- `readout` is structured, for the AI review. `rows` is display-ready, so the
  tracker doesn't reformat. `tone` is one of `bull`, `bear`, `warn` or
  `muted`.
- The `skyline` keys are the trade's timeframe plus `4H` (both always),
  plus `1D` if it's cheap.
- Readouts for closed candles never change, so the tracker may store them on
  the trade (phase 3 of TRADE_FEED.md).

## Tracker side

- `POST /api/chart` (Firebase-authenticated, like the coach endpoints) takes
  `{ "path": "series" | "readout" | "assets", "params": { ... } }` and
  forwards it to Chart Lab with `CHARTLAB_DATA_KEY`. It caches windows that
  end in the past. The browser never sees the key.
- Env: `CHARTLAB_DATA_URL` (`https://skyline-chart-lab.vercel.app`) and
  `CHARTLAB_DATA_KEY`.
- The asset picker shows coins you've traded (from your trades' tickers,
  normalised: `BTCUSDC.P` → `BTC`), then a watchlist, then a search checked
  against `/assets`.

## Setup

| Where | Variable |
|---|---|
| Chart Lab (Vercel production + preview, and local `.env.local`) | `CHARTLAB_DATA_KEY` |
| Tracker (Vercel production) | `CHARTLAB_DATA_KEY` (same value), `CHARTLAB_DATA_URL` |

```bash
curl -H "Authorization: Bearer $CHARTLAB_DATA_KEY" "https://skyline-chart-lab.vercel.app/api/data/series?asset=BTC&tf=10m&bars=5&layers=ema"
```
