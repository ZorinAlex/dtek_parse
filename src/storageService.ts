import fs from "fs-extra";
import path from "path";
import { PersistedSchedules } from "./types";
import { logger } from "./logger";

export class StorageService {
  constructor(private readonly storagePath: string) {}

  async save(data: PersistedSchedules): Promise<void> {
    await fs.ensureDir(path.dirname(this.storagePath));
    await fs.writeJSON(this.storagePath, data, { spaces: 2 });
    logger.info(`Saved ${data.outages.length} outages to ${this.storagePath}`);
  }

  async load(): Promise<PersistedSchedules | null> {
    try {
      if (!(await fs.pathExists(this.storagePath))) {
        return null;
      }

      return await fs.readJSON(this.storagePath);
    } catch (error) {
      logger.warn(
        `Failed to read existing schedule file ${this.storagePath}: ${
          (error as Error).message
        }`
      );
      return null;
    }
  }
}

