1. Project Overview

This project retrieves scheduled power outage data from
https://www.dtek-krem.com.ua/ua/shutdowns

based on a specific address (city → street → building).

Project goals:

Automatically fetch outage schedules every 15 minutes.

Parse the response (HTML or JSON) into a consistent internal structure.

Save the results locally in a JSON file (no database at stage 1).

Later: send this data to users through a Telegram bot.

Stage 1 scope:
Fetch → Parse → Save → Repeat on schedule

2. Architecture Overview
Components

DtekClient
Sends HTTP requests to the website's internal AJAX endpoint to retrieve schedules.

ScheduleParser
Converts DTEK’s raw HTML/JSON into normalized outage schedules.

StorageService
Saves and loads outage data from a local JSON file.

Scheduler (cron)
Runs the fetch-parse-save cycle every 15 minutes.

TelegramBot (Phase 2)
Reads schedules.json and returns outage data on command.

3. Tech Stack
Backend:

Node.js + TypeScript

HTTP client: axios or undici

Scheduler: node-cron

File operations: fs / fs-extra

Environment variables: dotenv

Telegram Bot (Phase 2):

telegraf or node-telegram-bot-api