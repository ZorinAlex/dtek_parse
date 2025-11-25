import { DataReader } from "./dataReader";
import { TelegramService } from "./telegramService";
import { config } from "./config";
import { logger } from "./logger";

async function testTelegram(): Promise<void> {
  logger.info("Testing Telegram service...");

  if (!config.telegram) {
    logger.error("Telegram is not configured. Please set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env");
    process.exit(1);
  }

  const telegramService = new TelegramService(
    config.telegram.botToken,
    config.telegram.chatId
  );

  const dataReader = new DataReader(config.storagePath);
  
  try {
    await dataReader.load();

    const processed = dataReader.getProcessedSchedule();
    
    if (!processed) {
      logger.warn("No processed schedule available");
      return;
    }

    logger.info("Sending schedule to Telegram...");
    const success = await telegramService.sendSchedule(processed);

    if (success) {
      logger.info("✅ Successfully sent schedule to Telegram!");
    } else {
      logger.error("❌ Failed to send schedule to Telegram");
      process.exit(1);
    }

  } catch (error) {
    logger.error(`Error testing Telegram: ${(error as Error).message}`, error);
    process.exit(1);
  }
}

testTelegram()
  .then(() => {
    logger.info("Test completed");
    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Test failed: ${(error as Error).message}`, error);
    process.exit(1);
  });

