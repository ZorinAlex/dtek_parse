import * as cheerio from "cheerio";
import { createHash } from "crypto";
import { NormalizedOutage, RawSchedulePayload, AddressQuery } from "./types";
import { logger } from "./logger";
import { config } from "./config";

interface ParseResult {
  outages: NormalizedOutage[];
  updateDate?: string;
  queue?: string;
  raw: RawSchedulePayload;
}

export class ScheduleParser {
  parse(
    payload: string | Record<string, unknown>,
    address: AddressQuery
  ): ParseResult {
    const fetchedAt = new Date().toISOString();
    const stringBody =
      typeof payload === "string" ? payload : JSON.stringify(payload);
    const outages =
      typeof payload === "string"
        ? this.fromHtml(payload, address)
        : this.fromJson(payload, address);

    if (outages.length === 0 && typeof payload === "string") {
      // Attempt a fallback by forcing html parsing even for JSON-like strings and vice versa
      try {
        const jsonCandidate = JSON.parse(payload);
        outages.push(...this.fromJson(jsonCandidate, address));
      } catch (error) {
        logger.debug(`Fallback JSON parse failed: ${(error as Error).message}`);
      }
    }

    // Extract update date and queue from HTML if available
    let updateDate: string | undefined;
    let queue: string | undefined;
    if (typeof payload === "string") {
      updateDate = this.extractUpdateDate(payload);
      queue = this.extractQueue(payload);
    }

    const result: ParseResult = {
      outages,
      raw: {
        source: config.baseUrl,
        fetchedAt,
        body: stringBody,
      },
    };
    
    if (updateDate) {
      result.updateDate = updateDate;
    }
    
    if (queue) {
      result.queue = queue;
    }
    
    return result;
  }

  private fromHtml(html: string, address: AddressQuery): NormalizedOutage[] {
    const $ = cheerio.load(html);
    const outages: NormalizedOutage[] = [];

    // Only parse tables from #discon-fact element
    const disconFact = $("#discon-fact");
    if (disconFact.length === 0) {
      logger.debug("No #discon-fact element found");
      return outages;
    }

    // Get all fact tables
    const factTables = disconFact.find(".discon-fact-table");
    
    if (factTables.length === 0) {
      logger.debug("No .discon-fact-table found in #discon-fact");
      return outages;
    }

    logger.debug(`Found ${factTables.length} fact table(s) in #discon-fact`);
    
    factTables.each((_, factTable) => {
      const $factTable = $(factTable);
      const table = $factTable.find("table").first();
      const relTimestamp = $factTable.attr("rel");
      
      if (table.length > 0) {
        outages.push(...this.parseFactTable($, table, address, relTimestamp));
      }
    });
    
    return outages;
  }

  private extractUpdateDate(html: string): string | undefined {
    const $ = cheerio.load(html);
    // Look for update date only in #discon-fact
    const disconFact = $("#discon-fact");
    if (disconFact.length === 0) {
      logger.debug("No #discon-fact element found for update date extraction");
      return undefined;
    }
    
    // Try multiple selectors to find the update date
    let updateSpan = disconFact.find("span.update");
    if (updateSpan.length === 0) {
      updateSpan = disconFact.find(".discon-fact-info-text span.update");
    }
    if (updateSpan.length === 0) {
      updateSpan = disconFact.find(".discon-fact-info .update");
    }
    
    if (updateSpan.length > 0) {
      const dateText = updateSpan.text().trim();
      logger.debug(`Found update date: ${dateText}`);
      return dateText;
    }
    
    logger.debug("Update date span not found in #discon-fact");
    return undefined;
  }

  private extractQueue(html: string): string | undefined {
    const $ = cheerio.load(html);
    // Look for queue in #group-name
    const groupName = $("#group-name");
    if (groupName.length > 0) {
      const queueText = groupName.text().trim();
      if (queueText) {
        logger.debug(`Found queue: ${queueText}`);
        return queueText;
      }
    }
    
    logger.debug("Queue (#group-name) not found");
    return undefined;
  }

  private parseFactTable(
    $: cheerio.CheerioAPI,
    table: cheerio.Cheerio<any>,
    address: AddressQuery,
    relTimestamp?: string
  ): NormalizedOutage[] {
    const outages: NormalizedOutage[] = [];

    // Get column headers (time slots) from thead
    const headers: string[] = [];
    table.find("thead th").each((_, th) => {
      // Try to get from div inside th first, then from th text
      const divText = $(th).find("div").text().trim();
      const thText = $(th).text().trim();
      const text = divText || thText;
      
      // Extract time slot pattern like "00-01"
      const timeMatch = text.match(/(\d{2}-\d{2})/);
      if (timeMatch && timeMatch[1]) {
        headers.push(timeMatch[1]);
      }
    });

    // Parse date from rel timestamp if available
    let targetDate: Date;
    if (relTimestamp) {
      const timestamp = parseInt(relTimestamp, 10);
      if (!isNaN(timestamp)) {
        targetDate = new Date(timestamp * 1000); // Convert from seconds to milliseconds
      } else {
        targetDate = new Date();
      }
    } else {
      targetDate = new Date();
    }

    // Parse each row in tbody
    table.find("tbody tr").each((rowIdx, row) => {
      const $row = $(row);
      const tds = $row.find("td");
      
      // First td(s) are merged (colspan="2") and empty, skip them
      // Remaining tds are time slot cells
      // Count how many tds to skip (usually 1 with colspan="2" or 2 separate tds)
      let skipCount = 0;
      const firstTd = tds.first();
      const colspan = parseInt(firstTd.attr("colspan") || "1", 10);
      if (colspan > 1) {
        skipCount = 1; // Skip one td with colspan
      } else {
        skipCount = 2; // Skip first two tds
      }
      
      tds.slice(skipCount).each((colIdx, cell) => {
        const $cell = $(cell);
        const cellClasses = $cell.attr("class") || "";
        
        // Skip if cell has class "cell-non-scheduled"
        if (cellClasses.includes("cell-non-scheduled")) {
          return;
        }

        // Get time slot from header
        const timeSlot = headers[colIdx] || "";
        if (!timeSlot) {
          return;
        }
        
        // Extract class name (find class that starts with "cell-")
        const className = cellClasses.split(" ").find((cls) => cls.startsWith("cell-")) || cellClasses || "";
        
        // Parse time range (e.g., "00-01" -> 00:00-01:00)
        const parts = timeSlot.split("-").map((h) => parseInt(h.trim(), 10));
        const startHour = parts[0];
        const endHour = parts[1];
        
        if (startHour === undefined || endHour === undefined || isNaN(startHour) || isNaN(endHour)) {
          return;
        }

        // Determine start and end times based on cell class
        let startTime: Date;
        let endTime: Date;

        if (className === "cell-first-half") {
          // First 30 minutes
          startTime = new Date(targetDate);
          startTime.setHours(startHour, 0, 0, 0);
          endTime = new Date(targetDate);
          endTime.setHours(startHour, 30, 0, 0);
        } else if (className === "cell-second-half") {
          // Second 30 minutes
          startTime = new Date(targetDate);
          startTime.setHours(startHour, 30, 0, 0);
          endTime = new Date(targetDate);
          endTime.setHours(endHour, 0, 0, 0);
        } else {
          // Full hour (cell-scheduled, cell-scheduled-maybe, etc.)
          startTime = new Date(targetDate);
          startTime.setHours(startHour, 0, 0, 0);
          endTime = new Date(targetDate);
          endTime.setHours(endHour, 0, 0, 0);
        }
        
        // Create outage record
        outages.push({
          className: className,
          timeSlot: timeSlot,
        });
      });
    });

    return outages;
  }

  private parseGenericTable(html: string, address: AddressQuery): NormalizedOutage[] {
    const $ = cheerio.load(html);
    const rows = $("table tr");
    const outages: NormalizedOutage[] = [];

    rows.each((_, row) => {
      const cells = $(row)
        .find("td")
        .map((__, td) => $(td).text().trim().replace(/\s+/g, " "))
        .get()
        .filter(Boolean);

      if (cells.length < 3) {
        return;
      }

      const [cityCell = "", streetOrDate = "", maybeBuilding = "", maybeTime = ""] =
        cells;
      const timeCandidate = maybeTime || streetOrDate || "";
      const { startTime, endTime } = this.extractTimes(timeCandidate);
      const streetValue = maybeBuilding
        ? streetOrDate
        : (address.street ?? "");
      const buildingValue = maybeBuilding || address.building || "";

      // This is a fallback method - return empty array since we only parse from #discon-fact
      // If needed, could extract className and timeSlot from cells, but not used currently
      // outages.push({
      //   className: "",
      //   timeSlot: "",
      // });
    });

    return outages;
  }

  private fromJson(
    json: Record<string, unknown>,
    address: AddressQuery
  ): NormalizedOutage[] {
    const outages: NormalizedOutage[] = [];

    const records = this.findArray(json);

    records.forEach((record) => {
      const city = this.pick(record, ["city", "City"]) ?? address.city;
      const street =
        this.pick(record, ["street", "Street", "address"]) ??
        address.street ??
        "";
      const building =
        this.pick(record, ["building", "Building", "house"]) ??
        address.building ??
        "";
      const startRaw =
        this.pick(record, ["start", "startTime", "from"]) ?? "Unknown";
      const endRaw =
        this.pick(record, ["end", "endTime", "to"]) ?? "Unknown";

      // This is a fallback method - return empty array since we only parse from #discon-fact
      // If needed, could extract className and timeSlot from record, but not used currently
      // outages.push({
      //   className: "",
      //   timeSlot: "",
      // });
    });

    return outages;
  }

  private extractTimes(raw: string): {
    startTime: string;
    endTime: string;
  } {
    const delimiters = ["-", "–", "—", "до"];
    const delimiter = delimiters.find((delim) => raw.includes(delim));

    if (!delimiter) {
      const normalized = this.normalizeDate(raw);
      return { startTime: normalized, endTime: normalized };
    }

    const [startRaw = raw, endRaw = raw] = raw
      .split(delimiter)
      .map((chunk) => chunk.trim());
    return {
      startTime: this.normalizeDate(startRaw),
      endTime: this.normalizeDate(endRaw),
    };
  }

  private normalizeDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) {
      return value;
    }

    return date.toISOString();
  }

  private createId(seed: string): string {
    return createHash("sha1").update(seed).digest("hex");
  }

  private findArray(json: Record<string, unknown>): Record<string, unknown>[] {
    if (Array.isArray(json)) {
      return json as Record<string, unknown>[];
    }

    for (const value of Object.values(json)) {
      if (Array.isArray(value)) {
        return value as Record<string, unknown>[];
      }

      if (value && typeof value === "object") {
        const nested = this.findArray(value as Record<string, unknown>);
        if (nested.length > 0) {
          return nested;
        }
      }
    }

    return [];
  }

  private pick(
    record: Record<string, unknown>,
    keys: string[]
  ): string | undefined {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return undefined;
  }
}

