/**
 * Parser utilities for Egyptian legislation ingestion from:
 * https://manshurat.org (Manshurat Qanuniyya - Free Legal Archive)
 *
 * Hosted by the Law and Society Research Unit, School of Global Affairs
 * and Public Policy, American University in Cairo.
 */

export interface ManshuratLawEntry {
  /** URL path: /content/slug or /node/ID */
  path: string;
}

export interface ManshuratLawDetail {
  nodeId: string;
  titleAr: string;
  lawNumber: string;
  lawYear: string;
  shortName: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issuedDate?: string;
  effectiveDate?: string;
  issuingAuthority?: string;
  sector?: string;
  description?: string;
  detailUrl: string;
  pdfDownloadPath?: string;
}

const BIDI_CONTROLS_REGEX = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

export function normalizeArabicDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0));
}

/**
 * Extract law entry paths from a taxonomy listing page.
 * Returns /content/slug or /node/ID paths.
 */
export function extractLawPathsFromListingHtml(html: string): ManshuratLawEntry[] {
  const paths = new Set<string>();
  const regex = /href="(\/(?:content|node)\/[^"]+)"/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const path = match[1];
    // Skip the recurring "participate in development" link
    if (path.includes('shrk-fy-ttwyr')) continue;
    paths.add(path);
  }

  return [...paths].map(p => ({ path: p }));
}

/**
 * Extract the last page number from Drupal pager on taxonomy listing.
 */
export function extractLastPageNumber(html: string): number {
  const match = html.match(/class="pager-last"[^>]*><a[^>]*href="[^"]*\?page=(\d+)"/);
  if (match) {
    return Number.parseInt(match[1], 10);
  }
  return 0;
}

function normalizeDate(value?: string): string | undefined {
  if (!value) return undefined;

  // Arabic month names to numbers
  const arabicMonths: Record<string, string> = {
    'يناير': '01', 'فبراير': '02', 'مارس': '03', 'أبريل': '04',
    'إبريل': '04', 'ابريل': '04', 'مايو': '05', 'يونيو': '06',
    'يونية': '06', 'يوليو': '07', 'يوليه': '07', 'أغسطس': '08',
    'اغسطس': '08', 'سبتمبر': '09', 'أكتوبر': '10', 'اكتوبر': '10',
    'نوفمبر': '11', 'ديسمبر': '12',
  };

  const clean = normalizeArabicDigits(
    value.replace(BIDI_CONTROLS_REGEX, '').replace(/\s+/g, ' ').trim()
  );

  // Try "DD MonthName YYYY" format (Arabic)
  for (const [monthName, monthNum] of Object.entries(arabicMonths)) {
    if (clean.includes(monthName)) {
      const dayYearMatch = clean.match(/(\d{1,2})\s+\S+\s+(\d{4})/);
      if (dayYearMatch) {
        const day = dayYearMatch[1].padStart(2, '0');
        const year = dayYearMatch[2];
        return `${year}-${monthNum}-${day}`;
      }
    }
  }

  // Try "YYYY/MM/DD" or "YYYY.MM.DD"
  const isoish = clean.replace(/\./g, '/');
  const ymdMatch = isoish.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (ymdMatch) {
    return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
  }

  // Try "DD/MM/YYYY"
  const dmyMatch = clean.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2].padStart(2, '0')}-${dmyMatch[1].padStart(2, '0')}`;
  }

  return undefined;
}

function extractInlineField(html: string, label: string): string | undefined {
  // Manshurat uses: <div class="label-inline">Label:&nbsp;</div> ...value...
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `class="label-inline"[^>]*>\\s*${escaped}[:\\s&;nbsp]*<\\/div>([\\s\\S]*?)(?:<\\/div>|<div)`,
    'i',
  );
  const match = html.match(regex);
  if (!match) return undefined;
  const value = stripTags(match[1]);
  return value || undefined;
}

function extractLabelAboveField(html: string, label: string): string | undefined {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Manshurat uses: <div class="label-above ...">Label:&nbsp;</div>VALUE
  const regex = new RegExp(
    `class="label-above[^"]*"[^>]*>\\s*${escaped}[:\\s&;nbsp]*<\\/div>([\\s\\S]*?)(?:<div|<\\/div>)`,
    'i',
  );
  const match = html.match(regex);
  if (!match) return undefined;
  const value = stripTags(match[1]);
  return value || undefined;
}

function parseStatus(html: string): 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force' {
  const lower = html.toLowerCase();
  // Check for workflow status indicators
  if (lower.includes('ملغ') || lower.includes('repeal')) return 'repealed';
  if (lower.includes('معدل') || lower.includes('amend')) return 'amended';
  if (lower.includes('غير نافذ') || lower.includes('not yet')) return 'not_yet_in_force';
  return 'in_force';
}

/**
 * Extract the node ID from a manshurat.org URL path.
 */
export function extractNodeId(path: string): string | null {
  // /node/12345
  const nodeMatch = path.match(/\/node\/(\d+)/);
  if (nodeMatch) return nodeMatch[1];
  return null;
}

/**
 * Parse a Manshurat.org law detail page.
 */
export function parseManshuratLawDetailHtml(
  html: string,
  pagePath: string,
  baseUrl: string,
): ManshuratLawDetail | null {
  // Extract title from <h2> inside the node title field, or og:title, or <title>
  let titleAr = '';
  const h2Match = html.match(/field-name-title[^>]*>[\s\S]*?<h2>([^<]+)<\/h2>/);
  if (h2Match) {
    titleAr = stripTags(h2Match[1]).replace(BIDI_CONTROLS_REGEX, '').trim();
  }
  if (!titleAr) {
    const ogTitle = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
    if (ogTitle) {
      titleAr = decodeHtmlEntities(ogTitle[1]).replace(BIDI_CONTROLS_REGEX, '').trim();
    }
  }
  if (!titleAr) {
    const titleTag = html.match(/<title>([^|<]+)/);
    if (titleTag) {
      titleAr = decodeHtmlEntities(titleTag[1]).replace(BIDI_CONTROLS_REGEX, '').trim();
    }
  }
  if (!titleAr) return null;

  // Extract law number and year
  const docNumber = extractInlineField(html, 'رقم الوثيقة/الدعوى') ??
    extractInlineField(html, 'رقم الوثيقة');
  const docYear = extractInlineField(html, 'سنة الإصدار/السنة القضائية') ??
    extractInlineField(html, 'سنة الإصدار');

  // Try to extract number/year from the title if not in metadata fields
  let lawNumber = docNumber ? normalizeArabicDigits(docNumber.trim()) : '';
  let lawYear = docYear ? normalizeArabicDigits(docYear.trim()) : '';

  if (!lawNumber || !lawYear) {
    // Try patterns: "قانون رقم N لسنة YYYY" or "رقم N لسنة YYYY"
    const titleNorm = normalizeArabicDigits(titleAr);
    const titleMatch = titleNorm.match(/رقم\s+(\d+)\s+لسنة\s+(\d{4})/);
    if (titleMatch) {
      if (!lawNumber) lawNumber = titleMatch[1];
      if (!lawYear) lawYear = titleMatch[2];
    }
    // Try "بالقانون رقم N لسنة YYYY"
    if (!lawNumber || !lawYear) {
      const altMatch = titleNorm.match(/بالقانون\s+(?:رقم\s+)?(\d+)\s+لسنة\s+(\d{4})/);
      if (altMatch) {
        if (!lawNumber) lawNumber = altMatch[1];
        if (!lawYear) lawYear = altMatch[2];
      }
    }
    // Try "بالقانون N لسنة YYYY"
    if (!lawNumber || !lawYear) {
      const altMatch2 = titleNorm.match(/(\d+)\s+لسنة\s+(\d{4})/);
      if (altMatch2) {
        if (!lawNumber) lawNumber = altMatch2[1];
        if (!lawYear) lawYear = altMatch2[2];
      }
    }
  }

  // Extract the node ID for generating a unique document ID
  const nodeId = extractNodeId(pagePath) ?? pagePath.replace(/\//g, '-').replace(/^-/, '');

  // Extract dates
  const issuedDate = normalizeDate(extractLabelAboveField(html, 'تاريخ إصدار الوثيقة'));
  const effectiveDate = normalizeDate(extractLabelAboveField(html, 'تاريخ العمل به'));
  const publishDate = normalizeDate(extractLabelAboveField(html, 'تاريخ النشر'));

  // Extract issuing authority
  const authority = extractLabelAboveField(html, 'صفة المصدر');
  const issuerName = extractLabelAboveField(html, 'اسم المصدر');

  // Extract sector
  const sector = extractInlineField(html, 'القطاع');

  // Extract PDF download link
  let pdfDownloadPath: string | undefined;
  const fileMatch = html.match(/href="(\/file\/\d+\/download\?token=[^"]+)"/);
  if (fileMatch) {
    pdfDownloadPath = fileMatch[1];
  }

  // Build short name
  const shortName = lawNumber && lawYear
    ? `Law ${lawNumber}/${lawYear}`
    : titleAr.substring(0, 60);

  return {
    nodeId,
    titleAr,
    lawNumber: lawNumber || nodeId,
    lawYear: lawYear || 'unknown',
    shortName,
    status: parseStatus(html),
    issuedDate: issuedDate ?? publishDate,
    effectiveDate: effectiveDate ?? issuedDate ?? publishDate,
    issuingAuthority: authority || issuerName,
    sector,
    description: sector ? `${sector}` : undefined,
    detailUrl: `${baseUrl}${pagePath}`,
    pdfDownloadPath,
  };
}
