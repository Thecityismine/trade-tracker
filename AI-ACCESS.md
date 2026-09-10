# AI Access Layer

Structured, read-only access to this app's data for an AI assistant — so K reads
the database through an API instead of scraping the UI.

Two surfaces, both behind one bearer key:

| Surface | Path | For |
| --- | --- | --- |
| REST | `/api/ai/v1/...` | Any HTTP client, scripts, a future central gateway |
| MCP | `/api/ai/mcp` | An MCP client connecting directly (Claude Desktop, Claude Code, a gateway) |

Both are **read-only**. Nothing here can create, edit or delete a record.

---

## 1. Setup

### Create a Firebase service account

The browser reads Firestore as the signed-in user. Serverless functions have no
user, so they need their own identity.

1. Firebase Console → Project Settings → **Service accounts**
2. **Generate new private key** → downloads a JSON file
3. Open it and read off `project_id`, `client_email`, `private_key`

Do not commit that file. `.gitignore` already blocks the usual filenames, but the
values belong in environment variables, not in the repo.

### Generate a gateway key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### Set the environment variables

In Vercel → Project → Settings → **Environment Variables**:

| Variable | Value |
| --- | --- |
| `FIREBASE_PROJECT_ID` | `trade-tracker-fb893` |
| `FIREBASE_CLIENT_EMAIL` | `client_email` from the JSON |
| `FIREBASE_PRIVATE_KEY` | `private_key` from the JSON, pasted whole including the `BEGIN`/`END` lines |
| `AI_GATEWAY_KEY` | the key you just generated |
| `APP_BASE_URL` | *(optional)* e.g. `https://btc-trade-tracker.vercel.app`, used to build record links |

`FIREBASE_PRIVATE_KEY` contains newlines. Paste it exactly as it appears in the
JSON — the code handles both real newlines and the `\n` escapes Vercel sometimes
stores.

Redeploy after adding them.

### Verify

```bash
curl -H "Authorization: Bearer $AI_GATEWAY_KEY" \
  https://your-app.vercel.app/api/ai/v1
```

You should get the manifest. Then check the data path:

```bash
curl -H "Authorization: Bearer $AI_GATEWAY_KEY" \
  https://your-app.vercel.app/api/ai/v1/performance
```

Without a key you get `401`. With a key but no service account you get a `500`
naming the missing variables.

---

## 2. Connecting K over MCP

```json
{
  "mcpServers": {
    "trade-tracker": {
      "type": "http",
      "url": "https://your-app.vercel.app/api/ai/mcp",
      "headers": { "Authorization": "Bearer YOUR_AI_GATEWAY_KEY" }
    }
  }
}
```

In Claude Code:

```bash
claude mcp add --transport http trade-tracker \
  https://your-app.vercel.app/api/ai/mcp \
  --header "Authorization: Bearer YOUR_AI_GATEWAY_KEY"
```

### Tools K gets

Every tool is marked read-only, so a client can run them without prompting.

| Tool | Answers |
| --- | --- |
| `describe_data` | What's in here and where each kind of answer lives |
| `get_performance` | Balance, P&L, win rate, expectancy, profit factor, drawdown, streak |
| `list_trades` | Closed trades, filtered by period, result, ticker, direction, strategy |
| `get_trade` | One trade plus its strategy and same-day journal review |
| `get_open_positions` | Positions with no exit yet |
| `get_strategies` | Each documented setup with its performance rollup |
| `get_chart_patterns` | The pattern library with per-pattern performance |
| `get_weekly_reports` | AI weekly reviews |
| `search_records` | Full-text across journal, mindset, notebook, strategies, reports |
| `list_records` | Raw access to any collection |
| `get_record` | One record by id from any collection |

---

## 3. REST endpoints

`GET /api/ai/v1` returns a live manifest of all of these.

| Endpoint | Notes |
| --- | --- |
| `GET /api/ai/v1` | Manifest: endpoints, conventions, guidance |
| `GET /api/ai/v1/collections` | All 10 collections with record counts |
| `GET /api/ai/v1/collections/{name}` | Paginated records from any collection |
| `GET /api/ai/v1/collections/{name}/{id}` | One record |
| `GET /api/ai/v1/performance` | Account and performance summary |
| `GET /api/ai/v1/trades` | Closed trades + aggregate stats |
| `GET /api/ai/v1/trades/{id}` | Trade + strategy + journal review |
| `GET /api/ai/v1/positions/open` | Open positions |
| `GET /api/ai/v1/strategies` | Strategies with performance rollups |
| `GET /api/ai/v1/patterns` | Chart patterns with performance rollups |
| `GET /api/ai/v1/journal` | Written post-trade reviews |
| `GET /api/ai/v1/mindset` | Mood, confidence, discipline logs |
| `GET /api/ai/v1/notebook` | Notes and recurring mistakes |
| `GET /api/ai/v1/deposits` | Funding history |
| `GET /api/ai/v1/alarms` | Session reminders |
| `GET /api/ai/v1/reports/weekly` | AI weekly reviews; `/{weekKey}` for one |
| `POST /api/ai/v1/search` | Full-text search across everything |

### Query parameters

Lists accept `limit` (default 50, max 500) and `offset`.

Time windows accept either `period=all|today|week|month|30d|90d|ytd` or an
explicit `from=YYYY-MM-DD` / `to=YYYY-MM-DD`.

`/trades` also accepts `result`, `ticker`, `direction` and `strategyId`.

### Search

```bash
curl -X POST https://your-app.vercel.app/api/ai/v1/search \
  -H "Authorization: Bearer $AI_GATEWAY_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "revenge trading", "collections": ["tradeJournalEntries", "mindsetEntries"], "limit": 10}'
```

---

## 4. Response shape

Every record carries the same envelope, then its own fields:

```json
{
  "id": "abc123",
  "recordType": "trade",
  "sourceApp": "btc-trade-tracker",
  "collection": "trades",
  "url": "https://btc-trade-tracker.vercel.app/#journal",
  "title": "BTC long (win) +$400.00",
  "status": "closed",
  "occurredAt": "2026-09-01T14:00:00.000Z",
  "createdAt": "2026-09-01T14:05:00.000Z",
  "entryPrice": 61000,
  "exitPrice": 62500,
  "realizedPnlUsd": 400,
  "feesUsd": 12,
  "riskRewardRatio": 3,
  "executionScore": 8,
  "currency": "USD",
  "related": { "strategyId": "s1", "strategyName": "Breakout retest" },
  "summary": "long BTC closed win for +$400.00 on the Breakout retest setup."
}
```

Conventions:

- **Timestamps** are ISO 8601 UTC strings, never Firestore `Timestamp` objects.
- **Money** is USD and every monetary field ends in `Usd`.
- **Empty fields are omitted**, not returned as `null`. A missing
  `realizedPnlUsd` means there is no P&L, not that it is zero.
- **`url`** points at the page listing the record. The app is a hash-routed SPA
  with no per-record route, so a deeper link would not resolve.
- **Open vs closed**: open positions have no `exitPrice`, `result` or
  `realizedPnlUsd`, and are excluded from every performance figure. A legacy
  trade with no `status` field counts as closed, matching the app.

### Where numbers come from

Exact figures — balance, P&L, win rate, expectancy, profit factor — are computed
from the database in `api/_ai/metrics.js`, using the same definitions the
Dashboard renders, so the API and the UI cannot disagree. Ask
`/performance`; don't re-derive them by summing `/trades`.

Written material — journal reviews, reflections, notes, weekly reports — is
found with `/search`. That is substring matching, not vector search: the corpus
is small and exact-term recall beats semantic similarity for "where did I write
about X".

---

## 5. Security

- **Bearer key** on every request, compared in constant time. Missing or wrong
  key → `401`. Missing server key → `500`, never open.
- **Read-only.** `PUT`/`PATCH`/`DELETE` are refused. `POST` works only on
  `/search`. There is no write path in this code.
- **Rate limit** of 120 requests/minute per IP. Per-instance, so it is a brake
  on a runaway agent loop, not a defence against a determined attacker — the key
  does that job.
- **Audit log**: every request logs route, method, outcome, IP and user-agent to
  the Vercel function logs. Responses are never logged, so the audit trail
  cannot become a second copy of the account history.
- **No caching**: `Cache-Control: no-store` on every response.

### Rotating the key

Change `AI_GATEWAY_KEY` in Vercel, redeploy, update K's config. The old key stops
working the moment the new deployment goes live.

### What this does not do yet

The key is long-lived and grants everything. Your plan's end state is OAuth with
short-lived tokens and per-scope permissions. That matters once the gateway
serves more than one app or more than one person; for a single-user app reached
by one agent, a rotatable bearer key is the honest level of ceremony.

`hasWriteScope()` in `api/_ai/auth.js` returns `false` unconditionally. Write
tools, when they come, gate on it and get their own key — so read access can be
handed out without handing out mutation.

---

## 6. Code layout

Everything lives behind one serverless function to keep the function count low
and the auth check in exactly one place.

```
api/
  ai/gateway.js        Entry point: auth, then route to MCP or REST
  _ai/
    auth.js            Bearer key, rate limit, audit log
    firestore.js       firebase-admin singleton, collection reads
    schema.js          The 10 collections and how each maps to an AI record
    serialize.js       Timestamps to ISO, empty-field stripping
    metrics.js         Performance maths, mirroring the Dashboard
    resources.js       Query logic, shared by REST and MCP
    rest.js            URL routing
    mcp.js             JSON-RPC, tool definitions
```

Files under `api/_ai/` start with an underscore, so Vercel treats them as
modules rather than as endpoints.

`vercel.json` rewrites `/api/ai/:aipath*` to `/api/ai/gateway`, passing the
original path along as the `aipath` query parameter. This is deliberate: Vercel's
zero-config `api/` routing does not expand `[...catchAll]` filenames for
non-framework projects — a catch-all file matches a single path segment only —
and a bracketed filename cannot be targeted by the `functions` glob either,
because brackets there read as a character class. The explicit rewrite removes
both problems.

### Adding a collection

Add an entry to `COLLECTIONS` in `api/_ai/schema.js` with a mapper. It appears in
the REST endpoints, the universal search and the MCP tools at once.

### Tests

```bash
npm test
```

35 tests covering the metric maths against hand-computed figures, period and
filter behaviour, the record envelope, search, error handling, the full MCP
protocol handshake, and the auth and rate-limit layer. They run against fixtures
with Firestore mocked, so no credentials or network are needed.
