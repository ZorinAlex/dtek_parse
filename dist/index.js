"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_cron_1 = __importDefault(require("node-cron"));
const path_1 = __importDefault(require("path"));
const config_1 = require("./config");
const dtekClient_1 = require("./dtekClient");
const scheduleParser_1 = require("./scheduleParser");
const storageService_1 = require("./storageService");
const dataReader_1 = require("./dataReader");
const telegramService_1 = require("./telegramService");
const logger_1 = require("./logger");
const fs_extra_1 = __importDefault(require("fs-extra"));
const client = new dtekClient_1.DtekClient();
const parser = new scheduleParser_1.ScheduleParser();
const storage = new storageService_1.StorageService(config_1.config.storagePath);
const dataReader = new dataReader_1.DataReader(config_1.config.storagePath);
// Path for readed.json (last sent data)
const readedPath = path_1.default.resolve(path_1.default.dirname(config_1.config.storagePath), "readed.json");
let telegramService = null;
if (config_1.config.telegram) {
    try {
        telegramService = new telegramService_1.TelegramService(config_1.config.telegram.botToken, config_1.config.telegram.chatId);
        logger_1.logger.info("Telegram service enabled");
    }
    catch (error) {
        logger_1.logger.warn(`Failed to initialize Telegram service: ${error.message}`);
    }
}
async function fetchParseSave() {
    logger_1.logger.info("Starting fetch → parse → save cycle");
    try {
        const rawPayload = await client.fetchRawSchedule(config_1.config.address);
        const parsed = parser.parse(rawPayload, config_1.config.address);
        const dataToSave = {
            address: {
                city: config_1.config.address.city,
                street: config_1.config.address.street || "",
                building: config_1.config.address.building || "",
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
        logger_1.logger.info(`Cycle complete: ${parsed.outages.length} outages stored`);
        // Process and compare with last sent data
        await dataReader.load();
        const processed = dataReader.getProcessedSchedule();
        if (!processed) {
            logger_1.logger.warn("No processed schedule available, skipping comparison");
            return;
        }
        // Load last sent data from readed.json
        const lastProcessed = await loadProcessedFromReaded();
        // Compare data
        const isDifferent = !lastProcessed || !areSchedulesEqual(processed, lastProcessed);
        if (isDifferent) {
            logger_1.logger.info("Schedule data has changed, sending to Telegram");
            // Send to Telegram if configured
            if (telegramService) {
                try {
                    await telegramService.sendSchedule(processed);
                }
                catch (error) {
                    logger_1.logger.error(`Failed to send schedule to Telegram: ${error.message}`, error);
                }
            }
            else {
                logger_1.logger.warn("Telegram service not configured, skipping notification");
            }
            // Save as last sent data
            await saveProcessedToReaded(processed);
            logger_1.logger.info("Saved processed schedule to readed.json");
        }
        else {
            logger_1.logger.info("Schedule data unchanged, skipping Telegram notification");
        }
    }
    catch (error) {
        logger_1.logger.error(`Failed to complete cycle for ${config_1.config.address.city}: ${error.message}`, error);
    }
}
/**
 * Load ProcessedSchedule from readed.json
 */
async function loadProcessedFromReaded() {
    try {
        if (!(await fs_extra_1.default.pathExists(readedPath))) {
            return null;
        }
        return await fs_extra_1.default.readJSON(readedPath);
    }
    catch (error) {
        logger_1.logger.warn(`Failed to read readed.json: ${error.message}`);
        return null;
    }
}
/**
 * Save ProcessedSchedule to readed.json
 */
async function saveProcessedToReaded(processed) {
    // Clear and save
    await fs_extra_1.default.ensureDir(path_1.default.dirname(readedPath));
    await fs_extra_1.default.writeJSON(readedPath, processed, { spaces: 2 });
}
/**
 * Compare two ProcessedSchedule objects for equality
 */
function areSchedulesEqual(a, b) {
    // Compare updateDate
    if (a.updateDate !== b.updateDate) {
        return false;
    }
    // Compare address
    if (a.address.city !== b.address.city ||
        a.address.street !== b.address.street ||
        a.address.building !== b.address.building ||
        a.address.queue !== b.address.queue) {
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
        if (periodA.startTime !== periodB.startTime ||
            periodA.endTime !== periodB.endTime ||
            periodA.date !== periodB.date) {
            return false;
        }
    }
    return true;
}
function bootstrap() {
    const schedule = node_cron_1.default.schedule(config_1.config.cronPattern, () => void fetchParseSave(), {
        timezone: config_1.config.timezone,
    });
    logger_1.logger.info(`Scheduler ready with pattern "${config_1.config.cronPattern}"`);
    logger_1.logger.info(`Results will be stored at ${config_1.config.storagePath}`);
    void fetchParseSave();
    process.on("SIGINT", async () => {
        logger_1.logger.info("Received SIGINT. Shutting down scheduler...");
        schedule.stop();
        await client.close();
        process.exit(0);
    });
    process.on("SIGTERM", async () => {
        logger_1.logger.info("Received SIGTERM. Shutting down scheduler...");
        schedule.stop();
        await client.close();
        process.exit(0);
    });
}
bootstrap();
//# sourceMappingURL=index.js.map