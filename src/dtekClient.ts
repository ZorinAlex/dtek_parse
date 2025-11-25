import puppeteer, { Browser, Page } from "puppeteer";
import { config } from "./config";
import { AddressQuery } from "./types";
import { logger } from "./logger";

const CITY_SELECTOR = "#city";
const STREET_SELECTOR = "#street";
const HOUSE_SELECTOR = "#house_num";
const TABLE_SELECTOR = "#tableRenderElem table";

export class DtekClient {
  private browser: Browser | null = null;

  async fetchRawSchedule(
    address: AddressQuery
  ): Promise<string | Record<string, unknown>> {
    logger.info(
      `Opening browser to fetch schedule for ${address.city}${address.street ? `, ${address.street}` : ""}${address.building ? `, ${address.building}` : ""}`
    );

    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: false, // Set to false for debugging
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        slowMo: 100, // Slow down operations for visibility
      });
    }

    const page = await this.browser.newPage();
    await page.setUserAgent(config.userAgent);
    await page.setViewport({ width: 900, height: 900 });

    try {
      logger.debug(`Navigating to ${config.baseUrl}`);
      await page.goto(config.baseUrl, {
        waitUntil: "networkidle2",
        timeout: config.requestTimeoutMs,
      });

      await page.waitForSelector("body", { timeout: 5000 });

      // Wait for JavaScript to load and execute
      logger.debug("Waiting for JavaScript to load...");
      try {
        await page.waitForFunction(
          () => {
            // Check if jQuery is loaded (site uses jQuery)
            return typeof (window as any).jQuery !== "undefined" || 
                   typeof (window as any).$ !== "undefined" ||
                   document.readyState === "complete";
          },
          { timeout: 5000 }
        );
        logger.debug("jQuery/scripts loaded");
      } catch (error) {
        logger.warn("jQuery not detected, but continuing...");
      }

      // Wait for popup modal to appear and close it
      logger.debug("Waiting for popup modal...");
      try {
        // Wait up to 10 seconds for the modal to appear
        await page.waitForSelector(
          "button.modal_close.m-attention_close, [data-micromodal-close], .modal_close",
          { timeout: 5000, visible: true }
        );
        
        logger.debug("Popup modal detected, waiting 1 seconds before closing...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
        
        // Try to close the modal
        const closed = await page.evaluate(() => {
          // Try multiple selectors for the close button
          const selectors = [
            "button.modal_close.m-attention_close",
            "[data-micromodal-close]",
            ".modal_close",
            "button[aria-label*='Close']",
          ];
          
          for (const sel of selectors) {
            const button = document.querySelector(sel) as HTMLElement | null;
            if (button && button.offsetParent !== null) {
              // Button is visible
              button.click();
              return true;
            }
          }
          return false;
        });
        
        if (closed) {
          logger.debug("Popup modal closed successfully");
        } else {
          logger.warn("Could not find or click close button, but continuing...");
        }
        
        // Wait a bit for modal to disappear
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        logger.debug(`No popup modal appeared or already closed: ${(error as Error).message}`);
      }

      // Wait for form to be ready
      await page.waitForSelector("#discon_form", { timeout: 5000 });
      
      // Wait a bit more for autocomplete initialization
      await new Promise((resolve) => setTimeout(resolve, 2000));
      
      // Try to trigger autocomplete initialization manually
      await page.evaluate(() => {
        // Try to find and trigger autocomplete init if it exists
        const cityInput = document.querySelector("#city") as HTMLInputElement | null;
        if (cityInput) {
          // Trigger focus to initialize autocomplete
          cityInput.focus();
          cityInput.blur();
        }
      });

      await this.ensureInputReady(page, CITY_SELECTOR);
      if (address.city) {
        await this.fillAutocompleteInput(page, CITY_SELECTOR, address.city);
        // Wait for city selection to process and enable street field
        logger.debug("Waiting for street field to become enabled after city selection...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } else {
        throw new Error("ADDRESS_CITY is required for the search form");
      }

      if (address.street) {
        await this.waitForFieldEnabled(page, STREET_SELECTOR);
        
        // Double-check that field is actually enabled and can receive input
        const isEnabled = await page.evaluate((sel) => {
          const el = document.querySelector(sel) as HTMLInputElement | null;
          return !!el && !el.disabled && !el.hasAttribute("disabled");
        }, STREET_SELECTOR);
        
        if (!isEnabled) {
          logger.warn("Street field is still disabled, trying to enable it manually...");
          await page.evaluate((sel) => {
            const el = document.querySelector(sel) as HTMLInputElement | null;
            if (el) {
              el.removeAttribute("disabled");
              el.disabled = false;
              el.readOnly = false;
            }
          }, STREET_SELECTOR);
          await new Promise((resolve) => setTimeout(resolve, 300));
        }
        
        logger.debug("Filling street field...");
        await this.fillAutocompleteInput(page, STREET_SELECTOR, address.street);
      } else {
        logger.warn("ADDRESS_STREET is not provided; schedule may be incomplete");
      }

      if (address.building) {
        await this.waitForFieldEnabled(page, HOUSE_SELECTOR);
        await this.fillAutocompleteInput(
          page,
          HOUSE_SELECTOR,
          address.building
        );
      } else {
        logger.warn("ADDRESS_BUILDING is not provided; schedule may be inaccurate");
      }

      await this.waitForScheduleUpdate(page);

      const html = await page.content();
      logger.info(`Fetched HTML (${html.length} chars) with Puppeteer`);

      return html;
    } finally {
      await page.close();
    }
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  private async ensureInputReady(page: Page, selector: string): Promise<void> {
    await page.waitForSelector(selector, { visible: true, timeout: 1000 });
  }

  private async waitForFieldEnabled(page: Page, selector: string): Promise<void> {
    logger.debug(`Waiting for ${selector} to become enabled...`);
    try {
      await page.waitForFunction(
        (sel) => {
          const el = document.querySelector(sel) as HTMLInputElement | null;
          return !!el && !el.disabled && !el.hasAttribute("disabled");
        },
        { timeout: config.requestTimeoutMs },
        selector
      );
      logger.debug(`${selector} is now enabled`);
    } catch (error) {
      logger.warn(`Field ${selector} did not become enabled: ${(error as Error).message}`);
      // Try to enable it manually if possible
      await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLInputElement | null;
        if (el) {
          el.removeAttribute("disabled");
          el.disabled = false;
        }
      }, selector);
    }
  }

  private async fillAutocompleteInput(
    page: Page,
    selector: string,
    value: string
  ): Promise<void> {
    await this.ensureInputReady(page, selector);

    // Check if field is enabled before trying to type
    const isEnabled = await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      return !!el && !el.disabled && !el.hasAttribute("disabled");
    }, selector);
    
    if (!isEnabled) {
      logger.warn(`Field ${selector} is disabled, attempting to enable...`);
      await page.evaluate((sel) => {
        const el = document.querySelector(sel) as HTMLInputElement | null;
        if (el) {
          el.removeAttribute("disabled");
          el.disabled = false;
          el.readOnly = false;
        }
      }, selector);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Clear and focus
    await page.focus(selector);
    await page.click(selector, { clickCount: 3 }); // Triple click to select all
    await page.keyboard.press("Backspace");
    
    // Verify field is focused and ready
    const isFocused = await page.evaluate((sel) => {
      const el = document.querySelector(sel) as HTMLInputElement | null;
      return document.activeElement === el;
    }, selector);
    
    if (!isFocused) {
      logger.debug(`Field ${selector} not focused, trying again...`);
      await page.focus(selector);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    
    // Set value directly and trigger events for faster input
    await page.evaluate((sel, val) => {
      const input = document.querySelector(sel) as HTMLInputElement | null;
      if (input) {
        input.value = val;
        // Trigger all necessary events for autocomplete
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("keyup", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        
        // Try jQuery trigger if available
        const $ = (window as any).jQuery || (window as any).$;
        if ($) {
          try {
            $(input).trigger("input");
            $(input).trigger("keyup");
            $(input).trigger("change");
          } catch (e) {
            // Ignore jQuery errors
          }
        }
      }
    }, selector, value);
    
    // Small delay for autocomplete to process
    await new Promise((resolve) => setTimeout(resolve, 200));
    
    // Additional focus to ensure field is active
    await page.focus(selector);
    
    // Wait for autocomplete to trigger (reduced timeout)
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Debug: log current input value
    const currentValue = await page.evaluate((sel) => {
      const input = document.querySelector(sel) as HTMLInputElement | null;
      return input?.value || "";
    }, selector);
    logger.debug(`Input ${selector} value after typing: "${currentValue}"`);
    
    // Try to wait for suggestions
    await this.waitForSuggestionList(page, selector);
    
    // Try clicking first suggestion
    const clicked = await this.clickFirstSuggestion(page, selector);

    if (!clicked) {
      logger.debug(
        `Fallback to keyboard selection for selector ${selector} and value ${value}`
      );
      // Wait a bit more
      await new Promise((resolve) => setTimeout(resolve, 300));
      // Try keyboard navigation
      await page.keyboard.press("ArrowDown");
      await new Promise((resolve) => setTimeout(resolve, 100));
      await page.keyboard.press("Enter");
    }

    // Wait for field to update (reduced timeout)
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  private getAutocompleteListId(selector: string): string {
    if (selector === CITY_SELECTOR || selector === "#city") {
      return "#cityautocomplete-list";
    } else if (selector === STREET_SELECTOR || selector === "#street") {
      return "#streetautocomplete-list";
    } else if (selector === HOUSE_SELECTOR || selector === "#house_num") {
      return "#house_numautocomplete-list";
    }
    // Fallback: try to construct from selector
    const id = selector.replace("#", "");
    return `#${id}autocomplete-list`;
  }

  private async waitForSuggestionList(page: Page, selector: string): Promise<void> {
    const listId = this.getAutocompleteListId(selector);
    logger.debug(`Waiting for autocomplete list ${listId} for input ${selector}`);
    
    try {
      await page.waitForSelector(listId, { 
        timeout: 8000,
        visible: true 
      });
      
      // Wait for items to appear inside the list
      await page.waitForFunction(
        (listSel) => {
          const list = document.querySelector(listSel) as HTMLElement | null;
          if (!list) {
            return false;
          }
          
          const items = list.querySelectorAll("div");
          if (items.length === 0) {
            return false;
          }
          
          // Check if list is visible
          const style = window.getComputedStyle(list);
          return style.display !== "none" && style.visibility !== "hidden" && items.length > 0;
        },
        { timeout: 1000 },
        listId
      );
      
      logger.debug(`Suggestion list ${listId} appeared`);
    } catch (error) {
      logger.warn(
        `Suggestions list ${listId} did not appear for selector ${selector}, will try keyboard fallback: ${(error as Error).message}`
      );
    }
  }

  private async clickFirstSuggestion(
    page: Page,
    selector: string
  ): Promise<boolean> {
    const listId = this.getAutocompleteListId(selector);
    logger.debug(`Trying to click first suggestion in ${listId}`);
    
    try {
      // Wait for the first item to be available and visible
      const firstItemSelector = `${listId} > div:first-child`;
      
      await page.waitForSelector(firstItemSelector, {
        timeout: 1000,
        visible: true
      });
      
      // Scroll the item into view first
      await page.evaluate((itemSel) => {
        const item = document.querySelector(itemSel) as HTMLElement | null;
        if (item) {
          item.scrollIntoView({ block: "nearest", behavior: "instant" });
        }
      }, firstItemSelector);
      
      await new Promise((resolve) => setTimeout(resolve, 200));
      
      // Use Puppeteer's click method for more reliable clicking
      await page.click(firstItemSelector);
      
      logger.debug(`Clicked first suggestion in ${listId} using Puppeteer click`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      
      return true;
    } catch (error) {
      logger.debug(`Failed to click first suggestion in ${listId}: ${(error as Error).message}`);
      
      // Fallback: try to find and click using evaluate
      try {
        const found = await page.evaluate((listSel) => {
          const list = document.querySelector(listSel) as HTMLElement | null;
          if (!list) {
            return false;
          }

          const firstItem = list.querySelector("div:first-child") as HTMLElement | null;
          if (!firstItem) {
            return false;
          }

          firstItem.scrollIntoView({ block: "nearest", behavior: "instant" });
          firstItem.click();
          return true;
        }, listId);
        
        if (found) {
          logger.debug(`Clicked first suggestion using fallback method`);
          await new Promise((resolve) => setTimeout(resolve, 500));
          return true;
        }
      } catch (fallbackError) {
        logger.debug(`Fallback click also failed: ${(fallbackError as Error).message}`);
      }
      
      return false;
    }
  }

  private async waitForScheduleUpdate(page: Page): Promise<void> {
    logger.debug("Waiting for schedule table to update...");
    
    try {
      // Wait for table to be present
      await page.waitForSelector(TABLE_SELECTOR, { timeout: 1000 });
      
      // Wait a bit for any dynamic content to load
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      // Check if table has content (either with scheduled cells or just has rows)
      await page.waitForFunction(
        (selector) => {
          const table = document.querySelector(selector);
          if (!table) {
            return false;
          }

          const rows = table.querySelectorAll("tbody tr");
          if (rows.length === 0) {
            return false;
          }

          // Table exists and has rows - that's enough
          // We don't require scheduled cells because some addresses might have no outages
          return true;
        },
        { timeout: config.requestTimeoutMs },
        TABLE_SELECTOR
      );
      
      logger.debug("Schedule table updated");
    } catch (error) {
      logger.warn(`Table update timeout, but continuing: ${(error as Error).message}`);
    }
  }
}

