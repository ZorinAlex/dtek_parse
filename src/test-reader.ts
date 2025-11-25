import { DataReader } from "./dataReader";
import { config } from "./config";
import { logger } from "./logger";

async function testDataReader(): Promise<void> {
  logger.info("Testing DataReader...");

  const reader = new DataReader(config.storagePath);
  
  try {
    await reader.load();

    const updateDate = reader.getUpdateDate();
    logger.info(`Update Date: ${updateDate || "not found"}`);

    const address = reader.getAddress();
    logger.info(`Address: ${JSON.stringify(address, null, 2)}`);

    const processed = reader.getProcessedSchedule();
    
    if (!processed) {
      logger.warn("No processed schedule available");
      return;
    }

    logger.info("\n=== Processed Schedule ===");
    logger.info(`Update Date: ${processed.updateDate || "not set"}`);
    logger.info(`Address: ${JSON.stringify(processed.address, null, 2)}`);
    logger.info(`\nMerged Periods (${processed.periods.length}):`);
    
    processed.periods.forEach((period, index) => {
      logger.info(`  ${index + 1}. ${period.startTime} - ${period.endTime}`);
    });

    logger.info("\n=== Full JSON ===");
    console.log(JSON.stringify(processed, null, 2));

  } catch (error) {
    logger.error(`Error testing DataReader: ${(error as Error).message}`, error);
    process.exit(1);
  }
}

testDataReader()
  .then(() => {
    logger.info("Test completed");
    process.exit(0);
  })
  .catch((error) => {
    logger.error(`Test failed: ${(error as Error).message}`, error);
    process.exit(1);
  });

