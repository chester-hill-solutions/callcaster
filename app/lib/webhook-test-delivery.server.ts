import { logger } from "@/lib/logger.server";
import { safeOutboundFetch } from "@/lib/safe-outbound-url.server";

export async function testWebhook(
  testData: string | Record<string, unknown>,
  destination_url: string,
  custom_headers: string | Record<string, string>,
) {
  try {
    const parsedTestData = typeof testData === "string" ? JSON.parse(testData) : testData;
    const parsedHeaders =
      typeof custom_headers === "string" ? JSON.parse(custom_headers) : custom_headers;

    const headersObject: Record<string, string> = {};
    if (Array.isArray(parsedHeaders)) {
      parsedHeaders.forEach(([key, value]: [string, string]) => {
        if (key) headersObject[key] = value;
      });
    } else {
      Object.assign(headersObject, parsedHeaders);
    }

    const response = await safeOutboundFetch(destination_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headersObject,
      },
      body: JSON.stringify(parsedTestData),
      signal: AbortSignal.timeout(10000),
    });

    let data: unknown;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = await response.text();
    }

    return {
      data,
      status: response.status,
      statusText: response.statusText,
      error: null,
    };
  } catch (error: unknown) {
    logger.error("Error sending test data", error);
    return {
      data: null,
      status: 500,
      statusText: "Error sending webhook",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
