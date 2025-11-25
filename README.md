## DTEK Outage Fetcher

Fetch, normalize, and persist power outage schedules from [dtek-krem.com.ua](https://www.dtek-krem.com.ua/ua/shutdowns) every 15 minutes.

### Prerequisites
- Node.js 16+
- npm 8+

### Setup
1. Install dependencies:
   ```
   npm install
   ```
2. Copy `env.example` to `.env` and fill in your address parameters.
3. Build once (optional) and start in watch mode:
   ```
   npm run dev
   ```
   or run the compiled scheduler:
   ```
   npm run build
   npm start
   ```

### Configuration
Environment variables:

| Variable | Description | Default |
| --- | --- | --- |
| `ADDRESS_CITY` | Required city name | – |
| `ADDRESS_STREET` | Street filter | empty |
| `ADDRESS_BUILDING` | Building filter | empty |
| `CRON_PATTERN` | Cron spec for refresh | `*/15 * * * *` |
| `STORAGE_PATH` | JSON output path | `data/schedules.json` |
| `REQUEST_TIMEOUT_MS` | HTTP timeout | `20000` |
| `USER_AGENT` | Custom UA header | internal default |
| `LOG_LEVEL` | `error|warn|info|debug` | `info` |
| `TZ` | Cron timezone | `Europe/Kyiv` |

### Output
The scheduler writes a JSON file containing normalized outages and the raw payload for auditing. Example shape:

```
{
  "lastFetchedAt": "2025-11-25T11:30:00.000Z",
  "outages": [
    {
      "id": "c1c2f5…",
      "city": "Кременчук",
      "street": "вул. Соборна",
      "building": "10",
      "startTime": "2025-11-25T12:00:00.000Z",
      "endTime": "2025-11-25T16:00:00.000Z",
      "sourceUrl": "https://www.dtek-krem.com.ua/ua/shutdowns"
    }
  ],
  "raw": {
    "source": "https://www.dtek-krem.com.ua/ua/shutdowns",
    "fetchedAt": "2025-11-25T11:30:00.000Z",
    "body": "<html>…</html>"
  }
}
```

### Next steps
- Plug `data/schedules.json` into a Telegram bot (Phase 2).
- If DTEK exposes a documented JSON endpoint, update `DtekClient` to POST address identifiers instead of scraping HTML.

