import cron from "node-cron";
import path from "path";
import { config } from "./config";
import { DtekClient } from "./dtekClient";
import { ScheduleParser } from "./scheduleParser";
import { StorageService } from "./storageService";
import { DataReader } from "./dataReader";
import { TelegramService } from "./telegramService";
import { logger } from "./logger";
import { PersistedSchedules, ProcessedSchedule } from "./types";
import fs from "fs-extra";

const client = new DtekClient();
const parser = new ScheduleParser();
const storage = new StorageService(config.storagePath);
const dataReader = new DataReader(config.storagePath);

// Path for readed.json (last sent data)
const readedPath = path.resolve(path.dirname(config.storagePath), "readed.json");

let telegramService: TelegramService | null = null;
if (config.telegram) {
  try {
    telegramService = new TelegramService(
      config.telegram.botToken,
      config.telegram.chatId
    );
    logger.info("Telegram service enabled");
  } catch (error) {
    logger.warn(`Failed to initialize Telegram service: ${(error as Error).message}`);
  }
}

async function fetchParseSave(): Promise<void> {
  logger.info("Starting fetch → parse → save cycle");

  try {
    const rawPayload = await client.fetchRawSchedule(config.address);
    const parsed = parser.parse(rawPayload, config.address);

    const dataToSave: PersistedSchedules = {
      address: {
        city: config.address.city,
        street: config.address.street || "",
        building: config.address.building || "",
      },
      outages: parsed.outages,
    };
    
    if (parsed.updateDate) {
      dataToSave.updateDate = parsed.updateDate;
    }
    
    if (parsed.queue) {
      dataToSave.address.queue = parsed.queue;
    }
    
    await storage.save(dataToSave);

    logger.info(`Cycle complete: ${parsed.outages.length} outages stored`);

    // Process and compare with last sent data
    await dataReader.load();
    const processed = dataReader.getProcessedSchedule();
    
    if (!processed) {
      logger.warn("No processed schedule available, skipping comparison");
      return;
    }

    // Load last sent data from readed.json
    const lastProcessed = await loadProcessedFromReaded();

    // Compare data
    const isDifferent = !lastProcessed || !areSchedulesEqual(processed, lastProcessed);

    if (isDifferent) {
      logger.info("Schedule data has changed, sending to Telegram");
      
      // Send to Telegram if configured
      if (telegramService) {
        try {
          await telegramService.sendSchedule(processed);
        } catch (error) {
          logger.error(
            `Failed to send schedule to Telegram: ${(error as Error).message}`,
            error
          );
        }
      } else {
        logger.warn("Telegram service not configured, skipping notification");
      }

      // Save as last sent data
      await saveProcessedToReaded(processed);
      logger.info("Saved processed schedule to readed.json");
    } else {
      logger.info("Schedule data unchanged, skipping Telegram notification");
    }
  } catch (error) {
    logger.error(
      `Failed to complete cycle for ${config.address.city}: ${
        (error as Error).message
      }`,
      error
    );
  }
}

/**
 * Load ProcessedSchedule from readed.json
 */
async function loadProcessedFromReaded(): Promise<ProcessedSchedule | null> {
  try {
    if (!(await fs.pathExists(readedPath))) {
      return null;
    }
    return await fs.readJSON(readedPath);
  } catch (error) {
    logger.warn(
      `Failed to read readed.json: ${(error as Error).message}`
    );
    return null;
  }
}

/**
 * Save ProcessedSchedule to readed.json
 */
async function saveProcessedToReaded(processed: ProcessedSchedule): Promise<void> {
  // Clear and save
  await fs.ensureDir(path.dirname(readedPath));
  await fs.writeJSON(readedPath, processed, { spaces: 2 });
}

/**
 * Compare two ProcessedSchedule objects for equality
 */
function areSchedulesEqual(a: ProcessedSchedule, b: ProcessedSchedule): boolean {
  // Compare updateDate
  if (a.updateDate !== b.updateDate) {
    return false;
  }

  // Compare address
  if (
    a.address.city !== b.address.city ||
    a.address.street !== b.address.street ||
    a.address.building !== b.address.building ||
    a.address.queue !== b.address.queue
  ) {
    return false;
  }

  // Compare periods
  if (a.periods.length !== b.periods.length) {
    return false;
  }

  for (let i = 0; i < a.periods.length; i++) {
    const periodA = a.periods[i];
    const periodB = b.periods[i];
    
    if (!periodA || !periodB) {
      return false;
    }

    if (
      periodA.startTime !== periodB.startTime ||
      periodA.endTime !== periodB.endTime ||
      periodA.date !== periodB.date
    ) {
      return false;
    }
  }

  return true;
}

function bootstrap(): void {
  const schedule = cron.schedule(
    config.cronPattern,
    () => void fetchParseSave(),
    {
      timezone: config.timezone,
    }
  );

  logger.info(`Scheduler ready with pattern "${config.cronPattern}"`);
  logger.info(`Results will be stored at ${config.storagePath}`);

  void fetchParseSave();

  process.on("SIGINT", async () => {
    logger.info("Received SIGINT. Shutting down scheduler...");
    schedule.stop();
    await client.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    logger.info("Received SIGTERM. Shutting down scheduler...");
    schedule.stop();
    await client.close();
    process.exit(0);
  });
}

bootstrap();

