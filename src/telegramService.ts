import TelegramBot from "node-telegram-bot-api";
import { ProcessedSchedule } from "./types";
import { logger } from "./logger";

export class TelegramService {
  private bot: TelegramBot | null = null;
  private chatId: string;

  constructor(botToken: string, chatId: string) {
    if (!botToken || !chatId) {
      throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required");
    }
    this.chatId = chatId;
    this.bot = new TelegramBot(botToken, { polling: false });
    logger.info("TelegramService initialized");
  }

  /**
   * Formats processed schedule into a readable Telegram message
   */
  private formatMessage(schedule: ProcessedSchedule): string {
    const lines: string[] = [];

    // Header
    lines.push("🔌 <b>Графік відключень світла</b>\n");

    // Address
    const addr = schedule.address;
    lines.push(`📍 <b>${addr.queue}</b>`);


    // Update date
    if (schedule.updateDate) {
      lines.push(`📅 <b>Оновлено:</b> ${schedule.updateDate}`);
    }
    // Periods
    if (schedule.periods.length === 0) {
      lines.push("\n✅ <b>Відключень не заплановано</b>");
    } else {
      // Group periods by date
      const periodsByDate = new Map<string, typeof schedule.periods>();
      
      schedule.periods.forEach((period) => {
        const dateKey = period.date || "Не вказано";
        if (!periodsByDate.has(dateKey)) {
          periodsByDate.set(dateKey, []);
        }
        periodsByDate.get(dateKey)!.push(period);
      });

      lines.push(`\n⏰ <b>Періоди відключення:</b>`);

      // Sort dates
      const sortedDates = Array.from(periodsByDate.keys()).sort();
      
      sortedDates.forEach((date) => {
        const periods = periodsByDate.get(date)!;
        lines.push(`\n📆 <b>${date}:</b>`);
        periods.forEach((period) => {
          lines.push(`🕯️ ${period.startTime} - ${period.endTime}`);
        });
      });
    }

    return lines.join("\n");
  }

  /**
   * Sends processed schedule to Telegram channel
   */
  async sendSchedule(schedule: ProcessedSchedule): Promise<boolean> {
    if (!this.bot) {
      logger.error("Telegram bot is not initialized");
      return false;
    }

    try {
      const message = this.formatMessage(schedule);
      
      await this.bot.sendMessage(this.chatId, message, {
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });

      logger.info(`Successfully sent schedule to Telegram chat ${this.chatId}`);
      return true;
    } catch (error) {
      logger.error(
        `Failed to send message to Telegram: ${(error as Error).message}`,
        error
      );
      return false;
    }
  }

  /**
   * Sends a simple text message
   */
  async sendMessage(text: string): Promise<boolean> {
    if (!this.bot) {
      logger.error("Telegram bot is not initialized");
      return false;
    }

    try {
      await this.bot.sendMessage(this.chatId, text, {
        parse_mode: "HTML",
      });

      logger.info(`Successfully sent message to Telegram chat ${this.chatId}`);
      return true;
    } catch (error) {
      logger.error(
        `Failed to send message to Telegram: ${(error as Error).message}`,
        error
      );
      return false;
    }
  }
}

