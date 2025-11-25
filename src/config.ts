import path from "path";
import dotenv from "dotenv";
import { AddressQuery } from "./types";

dotenv.config();

const REQUIRED_ENV = ["ADDRESS_CITY"] as const;

REQUIRED_ENV.forEach((key) => {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
});

const defaultDataPath = path.resolve(process.cwd(), "data", "schedules.json");

const city = process.env.ADDRESS_CITY?.trim() ?? "";
const street = process.env.ADDRESS_STREET?.trim();
const building = process.env.ADDRESS_BUILDING?.trim();

const address: AddressQuery = { city };

if (street) {
  address.street = street;
}

if (building) {
  address.building = building;
}

export interface AppConfig {
  baseUrl: string;
  cronPattern: string;
  address: AddressQuery;
  storagePath: string;
  timezone: string;
  requestTimeoutMs: number;
  userAgent: string;
}

export const config: AppConfig = {
  baseUrl:
    process.env.DTEK_BASE_URL?.trim() ??
    "https://www.dtek-krem.com.ua/ua/shutdowns",
  cronPattern: process.env.CRON_PATTERN?.trim() ?? "*/15 * * * *",
  address,
  storagePath: path.resolve(
    process.env.STORAGE_PATH?.trim() ?? defaultDataPath
  ),
  timezone: process.env.TZ?.trim() ?? "Europe/Kyiv",
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS ?? 20000),
  userAgent:
    process.env.USER_AGENT?.trim() ??
    "Mozilla/5.0 (compatible; DtekScraper/1.0; +https://github.com/)",
};

