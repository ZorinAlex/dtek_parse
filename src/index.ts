import cron from "node-cron";
import { config } from "./config";
import { DtekClient } from "./dtekClient";
import { ScheduleParser } from "./scheduleParser";
import { StorageService } from "./storageService";
import { logger } from "./logger";
import { PersistedSchedules } from "./types";

const client = new DtekClient();
const parser = new ScheduleParser();
const storage = new StorageService(config.storagePath);

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
      dataToSave.queue = parsed.queue;
    }
    
    await storage.save(dataToSave);

    logger.info(`Cycle complete: ${parsed.outages.length} outages stored`);
  } catch (error) {
    logger.error(
      `Failed to complete cycle for ${config.address.city}: ${
        (error as Error).message
      }`,
      error
    );
  }
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

