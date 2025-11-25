import { PersistedSchedules, MergedOutagePeriod, ProcessedSchedule } from "./types";
import { StorageService } from "./storageService";
import { logger } from "./logger";

export class DataReader {
  private data: PersistedSchedules | null = null;
  private storageService: StorageService;

  constructor(storagePath: string) {
    this.storageService = new StorageService(storagePath);
  }

  async load(): Promise<void> {
    this.data = await this.storageService.load();
    if (!this.data) {
      logger.warn("No schedule data found to load");
    } else {
      logger.info(`Loaded schedule data with ${this.data.outages.length} outages`);
    }
  }

  getUpdateDate(): string | undefined {
    return this.data?.updateDate;
  }

  getAddress(): ProcessedSchedule["address"] | null {
    return this.data?.address || null;
  }

  /**
   * Converts timeSlot (e.g., "05-06") and className to actual time range
   */
  private parseTimeSlot(timeSlot: string, className: string): { start: string; end: string } | null {
    const parts = timeSlot.split("-");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return null;
    }

    const startHour = parseInt(parts[0], 10);
    const endHour = parseInt(parts[1], 10);

    if (isNaN(startHour) || isNaN(endHour)) {
      return null;
    }

    let startMin = 0;
    let endMin = 0;

    if (className === "cell-first-half") {
      // First 30 minutes: 09:00 - 09:30 (for timeSlot "09-10")
      startMin = 0;
      endMin = 30;
      // endHour should be startHour, not the next hour
      return {
        start: `${startHour.toString().padStart(2, "0")}:00`,
        end: `${startHour.toString().padStart(2, "0")}:30`,
      };
    } else if (className === "cell-second-half") {
      // Second 30 minutes: 05:30 - 06:00 (for timeSlot "05-06")
      startMin = 30;
      endMin = 0;
      // endHour is already correct (next hour)
    } else if (className === "cell-scheduled") {
      // Full hour: 06:00 - 07:00
      startMin = 0;
      endMin = 0;
    } else {
      // Unknown class, skip
      return null;
    }

    const formatTime = (hour: number, min: number): string => {
      return `${hour.toString().padStart(2, "0")}:${min.toString().padStart(2, "0")}`;
    };

    return {
      start: formatTime(startHour, startMin),
      end: formatTime(endHour, endMin),
    };
  }

  /**
   * Merges consecutive outage periods into continuous ranges
   */
  private mergePeriods(outages: Array<{ className: string; timeSlot: string }>): MergedOutagePeriod[] {
    if (outages.length === 0) {
      return [];
    }

    // Parse all outages into time ranges
    const periods: Array<{ start: string; end: string; startMinutes: number; endMinutes: number }> = [];

    for (const outage of outages) {
      const timeRange = this.parseTimeSlot(outage.timeSlot, outage.className);
      if (!timeRange) {
        continue;
      }

      const startParts = timeRange.start.split(":");
      const endParts = timeRange.end.split(":");
      
      if (startParts.length !== 2 || endParts.length !== 2 || 
          !startParts[0] || !startParts[1] || !endParts[0] || !endParts[1]) {
        continue;
      }

      const startHour = parseInt(startParts[0], 10);
      const startMin = parseInt(startParts[1], 10);
      const endHour = parseInt(endParts[0], 10);
      const endMin = parseInt(endParts[1], 10);

      if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) {
        continue;
      }

      periods.push({
        start: timeRange.start,
        end: timeRange.end,
        startMinutes: startHour * 60 + startMin,
        endMinutes: endHour * 60 + endMin,
      });
    }

    if (periods.length === 0) {
      return [];
    }

    // Sort by start time
    periods.sort((a, b) => a.startMinutes - b.startMinutes);

    // Merge consecutive periods
    const merged: MergedOutagePeriod[] = [];
    
    if (periods.length === 0) {
      return merged;
    }

    let currentPeriod = periods[0];
    if (!currentPeriod) {
      return merged;
    }

    for (let i = 1; i < periods.length; i++) {
      const nextPeriod = periods[i];
      if (!nextPeriod) {
        continue;
      }

      // Check if periods are consecutive (current end equals next start)
      if (currentPeriod.endMinutes === nextPeriod.startMinutes) {
        // Merge: extend current period to next period's end
        currentPeriod = {
          start: currentPeriod.start,
          end: nextPeriod.end,
          startMinutes: currentPeriod.startMinutes,
          endMinutes: nextPeriod.endMinutes,
        };
      } else {
        // Not consecutive, save current and start new
        merged.push({
          startTime: currentPeriod.start,
          endTime: currentPeriod.end,
        });
        currentPeriod = nextPeriod;
      }
    }

    // Add the last period
    merged.push({
      startTime: currentPeriod.start,
      endTime: currentPeriod.end,
    });

    return merged;
  }

  getProcessedSchedule(): ProcessedSchedule | null {
    if (!this.data) {
      return null;
    }

    const periods = this.mergePeriods(this.data.outages);

    const result: ProcessedSchedule = {
      address: this.data.address,
      periods,
    };
    
    if (this.data.updateDate) {
      result.updateDate = this.data.updateDate;
    }
    
    return result;
  }
}

