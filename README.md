## DTEK Outage Fetcher

Fetch, normalize, and persist power outage schedules from [dtek-krem.com.ua](https://www.dtek-krem.com.ua/ua/shutdowns) every 15 minutes.

### Prerequisites

**For local development:**
- Node.js 20+
- npm 8+

**For Docker deployment:**
- Docker 20+
- Docker Compose 2.0+ (optional)

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
| `MAX_RETRIES` | Max retry attempts on connection errors | `3` |
| `RETRY_DELAY_MS` | Delay between retries (ms) | `2000` |
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
      "endTime": "09:30",
      "date": "26.11.25"
    },
    {
      "startTime": "16:00",
      "endTime": "20:00",
      "date": "26.11.25"
    }
  ]
}
```

### Docker Deployment

#### Using Docker Compose (Recommended)

1. **Create `.env` file:**
   ```bash
   cp env.example .env
   # Edit .env with your configuration
   ```

2. **Build and start:**
   ```bash
   docker-compose up -d
   ```

3. **View logs:**
   ```bash
   docker-compose logs -f
   ```

4. **Stop:**
   ```bash
   docker-compose down
   ```

#### Using Docker directly

1. **Build the image:**
   ```bash
   docker build -t dtek-scraper .
   ```

2. **Run the container:**
   ```bash
   docker run -d \
     --name dtek-scraper \
     --restart unless-stopped \
     -e ADDRESS_CITY="Кременчук" \
     -e ADDRESS_STREET="вул. Соборна" \
     -e ADDRESS_BUILDING="10" \
     -e TELEGRAM_BOT_TOKEN="your_token" \
     -e TELEGRAM_CHAT_ID="@your_channel" \
     -v $(pwd)/data:/app/data \
     dtek-scraper
   ```

3. **View logs:**
   ```bash
   docker logs -f dtek-scraper
   ```

#### Data Persistence

The `data` directory is mounted as a volume, so `schedules.json` and `readed.json` will persist on your host machine at `./data/`.

#### Environment Variables

All environment variables from `.env` can be passed to Docker via:
- `docker-compose.yml` (automatically loads from `.env`)
- `-e` flags in `docker run`
- Environment file: `docker run --env-file .env ...`

