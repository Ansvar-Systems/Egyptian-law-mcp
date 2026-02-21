/**
 * Rate-limited HTTP client for Egyptian legislation ingestion.
 *
 * Source: Ministry of Investment and Foreign Trade portal
 * https://portal.investment.gov.eg/publiclaws
 */

const USER_AGENT = 'Egyptian-Law-MCP/1.0 (+https://github.com/Ansvar-Systems/Egyptian-law-mcp)';
const MIN_DELAY_MS = 1500;

let lastRequestAt = 0;

async function rateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - elapsed));
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

    const response = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': '*/*',
      },
      redirect: 'follow',
    });

    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries) {
      const backoffMs = Math.pow(2, attempt + 1) * 1000;
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      continue;
    }

    return response;
  }

  throw new Error(`Failed to fetch ${url}`);
}

export async function fetchTextWithRateLimit(url: string, maxRetries = 2): Promise<TextFetchResult> {
  const response = await fetchWithRetry(url, maxRetries);
  const body = await response.text();

  return {
    status: response.status,
    body,
    contentType: response.headers.get('content-type') ?? '',
    url: response.url,
  };
}

export async function fetchBinaryWithRateLimit(url: string, maxRetries = 2): Promise<BinaryFetchResult> {
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
