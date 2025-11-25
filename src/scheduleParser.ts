import * as cheerio from "cheerio";
import { createHash } from "crypto";
import { NormalizedOutage, RawSchedulePayload, AddressQuery } from "./types";
import { logger } from "./logger";
import { config } from "./config";

interface ParseResult {
  outages: NormalizedOutage[];
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

    return {
      outages,
      raw: {
        source: config.baseUrl,
        fetchedAt,
        body: stringBody,
      },
    };
  }

  private fromHtml(html: string, address: AddressQuery): NormalizedOutage[] {
    const $ = cheerio.load(html);
    const outages: NormalizedOutage[] = [];

    // Try to find the schedule table
    const scheduleTable = $("#tableRenderElem table, .discon-schedule-table table");
    
    if (scheduleTable.length === 0) {
      logger.debug("No schedule table found, trying generic table parsing");
      return this.parseGenericTable(html, address);
    }

    // Get column headers (time slots)
    const headers: string[] = [];
    scheduleTable.find("thead th").each((_, th) => {
      const text = $(th).text().trim();
      if (text && !text.includes("Часові") && !text.includes("проміжки")) {
        headers.push(text);
      }
    });

    // Get current date for building timestamps
    const today = new Date();
    const dayNames = ["Неділя", "Понеділок", "Вівторок", "Середа", "Четвер", "П'ятниця", "Субота"];

    // Parse each row (day of week)
    scheduleTable.find("tbody tr").each((rowIdx, row) => {
      const dayName = $(row).find("td:first-child, td:nth-child(2)").text().trim();
      const dayIndex = dayNames.findIndex((d) => dayName.includes(d));
      
      if (dayIndex === -1) {
        return;
      }

      // Calculate date for this day
      const currentDayOfWeek = today.getDay();
      let daysOffset = dayIndex - currentDayOfWeek;
      if (daysOffset < 0) {
        daysOffset += 7; // Next week
      }
      const targetDate = new Date(today);
      targetDate.setDate(today.getDate() + daysOffset);

      // Parse time slot cells
      $(row)
        .find("td")
        .slice(2) // Skip day name columns
        .each((colIdx, cell) => {
          const $cell = $(cell);
          const hasOutage =
            $cell.hasClass("cell-scheduled") ||
            $cell.hasClass("cell-scheduled-maybe") ||
            $cell.hasClass("cell-first-half") ||
            $cell.hasClass("cell-second-half");

          if (!hasOutage) {
            return;
          }

          // Get time slot from header
          const timeSlot = headers[colIdx] || "";
          if (!timeSlot) {
            return;
          }

          // Parse time range (e.g., "00-01" -> 00:00-01:00)
          const parts = timeSlot.split("-").map((h) => parseInt(h.trim(), 10));
          const startHourRaw = parts[0];
          const endHourRaw = parts[1];
          
          if (startHourRaw === undefined || endHourRaw === undefined || isNaN(startHourRaw) || isNaN(endHourRaw)) {
            return;
          }

          const startHour = startHourRaw;
          const endHour = endHourRaw;

          // Determine if it's first or second half
          const isFirstHalf = $cell.hasClass("cell-first-half");
          const isSecondHalf = $cell.hasClass("cell-second-half");

          let startMinutes = 0;
          let endMinutes = 0;

          if (isFirstHalf) {
            startMinutes = 0;
            endMinutes = 30;
            const endHourAdjusted = startHour; // Same hour, 30 minutes later
            const startTime = new Date(targetDate);
            startTime.setHours(startHour, 0, 0, 0);
            const endTime = new Date(targetDate);
            endTime.setHours(endHourAdjusted, 30, 0, 0);

            outages.push({
              id: this.createId(
                [address.city, address.street || "", address.building || "", dayName, timeSlot, "first"].join("|")
              ),
              city: address.city,
              street: address.street || "",
              building: address.building || "",
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              sourceUrl: config.baseUrl,
              meta: {
                day: dayName,
                timeSlot,
                type: "first-half",
              },
            });
            return;
          } else if (isSecondHalf) {
            startMinutes = 30;
            // If second half, end hour is next hour
            const endHourAdjusted = endHour === startHour ? startHour + 1 : endHour;
            const startTime = new Date(targetDate);
            startTime.setHours(startHour, 30, 0, 0);
            const endTime = new Date(targetDate);
            endTime.setHours(endHourAdjusted, 0, 0, 0);

            outages.push({
              id: this.createId(
                [address.city, address.street || "", address.building || "", dayName, timeSlot, "second"].join("|")
              ),
              city: address.city,
              street: address.street || "",
              building: address.building || "",
              startTime: startTime.toISOString(),
              endTime: endTime.toISOString(),
              sourceUrl: config.baseUrl,
              meta: {
                day: dayName,
                timeSlot,
                type: "second-half",
              },
            });
            return;
          } else {
            // Full hour outage
            startMinutes = 0;
            endMinutes = 0;
          }

          const startTime = new Date(targetDate);
          startTime.setHours(startHour, startMinutes, 0, 0);
          const endTime = new Date(targetDate);
          endTime.setHours(endHour, endMinutes, 0, 0);

          outages.push({
            id: this.createId(
              [address.city, address.street || "", address.building || "", dayName, timeSlot, isFirstHalf ? "first" : "full"].join("|")
            ),
            city: address.city,
            street: address.street || "",
            building: address.building || "",
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            sourceUrl: config.baseUrl,
            meta: {
              day: dayName,
              timeSlot,
              type: isFirstHalf ? "first-half" : "full-hour",
            },
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

      const outage: NormalizedOutage = {
        id: this.createId(cells.join("|")),
        city: cityCell || address.city,
        street: streetValue,
        building: buildingValue,
        startTime,
        endTime,
        sourceUrl: config.baseUrl,
        meta: {
          row: cells,
        },
      };

      outages.push(outage);
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

      const outage: NormalizedOutage = {
        id: this.createId(
          [city, street, building, startRaw, endRaw].join("|")
        ),
        city,
        street,
        building,
        startTime: this.normalizeDate(startRaw),
        endTime: this.normalizeDate(endRaw),
        sourceUrl: config.baseUrl,
        meta: record,
      };

      outages.push(outage);
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

