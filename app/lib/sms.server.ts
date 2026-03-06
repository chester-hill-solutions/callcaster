import { logger } from "@/lib/logger.server";

async function shortenUrl(url: string): Promise<string> {
  try {
    const response = await fetch(
      `https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`,
    );

    if (response.ok) {
      return await response.text();
    }
  } catch (error) {
    logger.error("Error shortening URL:", error);
  }

  return url;
}

export async function processUrls(text: string): Promise<string> {
  const urlRegex = /https?:\/\/[^\s]+/g;
  const urlMatches = text.match(urlRegex);

  if (!urlMatches) {
    return text;
  }

  let processedText = text;
  for (const url of urlMatches) {
    const shortenedUrl = await shortenUrl(url);
    processedText = processedText.replace(url, shortenedUrl);
  }

  return processedText;
}
