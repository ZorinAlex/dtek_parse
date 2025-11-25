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
| `TELEGRAM_BOT_TOKEN` | Telegram bot token (optional) | – |
| `TELEGRAM_CHAT_ID` | Telegram chat/channel ID (optional) | – |

### Telegram Setup (Optional)

1. **Create a Telegram Bot:**
   - Open Telegram and search for [@BotFather](https://t.me/BotFather)
   - Send `/newbot` and follow instructions
   - Copy the bot token you receive

2. **Get Chat/Channel ID:**
   - **For a channel:** Add your bot as an administrator to the channel
     - Use channel username: `@your_channel_name`
     - Or get numeric ID: forward a message from channel to [@userinfobot](https://t.me/userinfobot)
   - **For a private chat:** Send a message to [@userinfobot](https://t.me/userinfobot) to get your chat ID

3. **Configure in `.env`:**
   ```env
   TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   TELEGRAM_CHAT_ID=@your_channel_name
   # or for numeric ID:
   # TELEGRAM_CHAT_ID=-1001234567890
   ```

4. **Test Telegram integration:**
   ```bash
   npm run test:telegram
   ```

The bot will automatically send schedule updates to your Telegram channel/chat after each fetch cycle.

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

### Testing

- **Test DataReader (merge periods):**
  ```bash
  npm run test:reader
  ```

- **Test Telegram posting:**
  ```bash
  npm run test:telegram
  ```

### Output Format

The processed schedule format (after merging consecutive periods):

```json
{
  "updateDate": "25.11.2025 19:45",
  "address": {
    "city": "Ржищів",
    "street": "Петренка",
    "building": "1",
    "queue": "Черга 3.2"
  },
  "periods": [
    {
      "startTime": "05:30",
      "endTime": "09:30"
    },
    {
      "startTime": "16:00",
      "endTime": "20:00"
    }
  ]
}
```

