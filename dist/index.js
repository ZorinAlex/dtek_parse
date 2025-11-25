"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_cron_1 = __importDefault(require("node-cron"));
const config_1 = require("./config");
const dtekClient_1 = require("./dtekClient");
const scheduleParser_1 = require("./scheduleParser");
const storageService_1 = require("./storageService");
const logger_1 = require("./logger");
const client = new dtekClient_1.DtekClient();
const parser = new scheduleParser_1.ScheduleParser();
const storage = new storageService_1.StorageService(config_1.config.storagePath);
async function fetchParseSave() {
    logger_1.logger.info("Starting fetch → parse → save cycle");
    try {
        const rawPayload = await client.fetchRawSchedule(config_1.config.address);
        const parsed = parser.parse(rawPayload, config_1.config.address);
        await storage.save({
            lastFetchedAt: new Date().toISOString(),
            outages: parsed.outages,
            raw: parsed.raw,
        });
        logger_1.logger.info(`Cycle complete: ${parsed.outages.length} outages stored`);
    }
    catch (error) {
        logger_1.logger.error(`Failed to complete cycle for ${config_1.config.address.city}: ${error.message}`, error);
    }
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