/**
 * Rate-limited HTTP client for Egyptian legislation ingestion.
 *
 * Supports both portal.investment.gov.eg and manshurat.org sources.
 */

const USER_AGENT = 'Egyptian-Law-MCP/1.0 (+https://github.com/Ansvar-Systems/Egyptian-law-mcp)';
const DEFAULT_MIN_DELAY_MS = 1500;
const REQUEST_TIMEOUT_MS = 60_000;

let minDelayMs = DEFAULT_MIN_DELAY_MS;
let lastRequestAt = 0;

/**
 * Set the minimum delay between requests (in ms).
 * Call this before starting ingestion to adjust rate limiting.
 */
export function setRateLimitDelay(ms: number): void {
  minDelayMs = ms;
}

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < minDelayMs) {
    await new Promise(resolve => setTimeout(resolve, minDelayMs - elapsed));
  }
  lastRequestAt = Date.now();
}

export interface TextFetchResult {
  status: number;
  body: string;
  contentType: string;
  url: string;
}

export interface BinaryFetchResult {
  status: number;
  body: Buffer;
  contentType: string;
  url: string;
}

async function fetchWithRetry(url: string, maxRetries: number): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await rateLimit();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': '*/*',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt + 1) * 1000;
        console.log(`  HTTP ${response.status} on ${url}, backing off ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      return response;
    } catch (error) {
      if (attempt < maxRetries) {
        const backoffMs = Math.pow(2, attempt + 1) * 2000;
        const reason = error instanceof Error ? error.message : String(error);
        console.log(`  Fetch error on ${url}: ${reason}, backing off ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Failed to fetch ${url}`);
}

export async function fetchTextWithRateLimit(url: string, maxRetries = 3): Promise<TextFetchResult> {
  const response = await fetchWithRetry(url, maxRetries);
  const body = await response.text();

  return {
    status: response.status,
    body,
    contentType: response.headers.get('content-type') ?? '',
    url: response.url,
  };
}

export async function fetchBinaryWithRateLimit(url: string, maxRetries = 3): Promise<BinaryFetchResult> {
  const response = await fetchWithRetry(url, maxRetries);
  const arrayBuffer = await response.arrayBuffer();

  return {
    status: response.status,
    body: Buffer.from(arrayBuffer),
    contentType: response.headers.get('content-type') ?? '',
    url: response.url,
  };
}

export function resolveUrl(baseUrl: string, href: string): string {
  return new URL(href, baseUrl).toString();
}
