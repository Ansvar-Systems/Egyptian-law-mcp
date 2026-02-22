/**
 * Parser utilities for Egyptian legislation ingestion from:
 * https://portal.investment.gov.eg/publiclaws
 */

export interface ParsedProvision {
  provision_ref: string;
  chapter?: string;
  section: string;
  title: string;
  content: string;
}

export interface ParsedDefinition {
  term: string;
  definition: string;
  source_provision?: string;
}

export interface ParsedAct {
  id: string;
  type: 'statute';
  title: string;
  title_en?: string;
  short_name: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issued_date?: string;
  in_force_date?: string;
  url: string;
  description?: string;
  provisions: ParsedProvision[];
  definitions: ParsedDefinition[];
}

export interface LawAttachment {
  title: string;
  href: string;
}

export interface PortalLawDetail {
  lawNumber: string;
  lawYear: string;
  titleEn: string;
  titleAr?: string;
  shortName: string;
  status: 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force';
  issuedDate?: string;
  effectiveDate?: string;
  description?: string;
  detailUrl: string;
  attachments: LawAttachment[];
}

const BIDI_CONTROLS_REGEX = /[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export function normalizeArabicDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06f0));
}

function normalizeDate(value?: string): string | undefined {
  if (!value) return undefined;
  const clean = value.trim().replace(/\./g, '/');
  const match = clean.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!match) return undefined;
  const year = match[1];
  const month = match[2].padStart(2, '0');
  const day = match[3].padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function extractInfoValue(html: string, label: string): string | undefined {
  const regex = new RegExp(
    `<label>\\s*${escapeRegex(label)}\\s*<\\/label>[\\s\\S]*?<span>([\\s\\S]*?)<\\/span>`,
    'i',
  );
  const match = html.match(regex);
  if (!match) return undefined;
  const value = stripTags(match[1]);
  return value || undefined;
}

function parseStatus(html: string): 'in_force' | 'amended' | 'repealed' | 'not_yet_in_force' {
  const statusValue = extractInfoValue(html, 'Status') ?? '';
  const normalized = statusValue.toLowerCase();

  if (normalized.includes('ساري') || normalized.includes('active') || normalized.includes('in force')) {
    return 'in_force';
  }
  if (normalized.includes('معدل') || normalized.includes('amend')) return 'amended';
  if (normalized.includes('ملغ') || normalized.includes('repeal')) return 'repealed';
  if (normalized.includes('not yet') || normalized.includes('غير نافذ')) return 'not_yet_in_force';

  return 'in_force';
}

export function extractLawIdsFromCategoryHtml(html: string): number[] {
  const ids = new Set<number>();
  const regex = /\/publiclaws\/details\/(\d+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    ids.add(Number.parseInt(match[1], 10));
  }

  return [...ids].sort((a, b) => a - b);
}

export function extractCategoryIdsFromIndexHtml(html: string): number[] {
  const ids = new Set<number>();
  const regex = /\/publiclaws\/category\/(\d+)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    ids.add(Number.parseInt(match[1], 10));
  }

  return [...ids].sort((a, b) => a - b);
}

export function parseLawDetailHtml(html: string, detailUrl: string): PortalLawDetail | null {
  const lawNumberYearMatch = html.match(/Law\s+(\d+)\s*\/\s*(\d{4})/i);
  if (!lawNumberYearMatch) return null;

  const lawNumber = lawNumberYearMatch[1];
  const lawYear = lawNumberYearMatch[2];
  const titleEn = stripTags(html.match(/<h1>([\s\S]*?)<\/h1>/i)?.[1] ?? '');
  if (!titleEn) return null;

  const summary = stripTags(html.match(/<p class="summary-text">([\s\S]*?)<\/p>/i)?.[1] ?? '');
  const issueDate = normalizeDate(extractInfoValue(html, 'Issue Date'));
  const effectiveDate = normalizeDate(extractInfoValue(html, 'Effective Date')) ?? issueDate;

  const attachments: LawAttachment[] = [];
  const attachmentRegex = /<div class="attachment-item">([\s\S]*?)<\/a>\s*<\/div>/gi;
  let attachmentMatch: RegExpExecArray | null;

  while ((attachmentMatch = attachmentRegex.exec(html)) !== null) {
    const block = attachmentMatch[1];
    const title = stripTags(block.match(/<h5>([\s\S]*?)<\/h5>/i)?.[1] ?? '');
    const href = block.match(/href="([^"]*\/publiclaws\/download\/\d+)"/i)?.[1] ?? '';
    if (href) {
      attachments.push({ title, href });
    }
  }

  return {
    lawNumber,
    lawYear,
    titleEn,
    shortName: `Law ${lawNumber}/${lawYear}`,
    status: parseStatus(html),
    issuedDate: issueDate,
    effectiveDate,
    description: summary || undefined,
    detailUrl,
    attachments,
  };
}

export function selectPrimaryAttachment(attachments: LawAttachment[]): LawAttachment | null {
  if (attachments.length === 0) return null;

  const preferred = attachments.find(item => {
    const name = item.title.toLowerCase();
    return !(
      name.includes('update') ||
      name.includes('executive') ||
      name.includes('regulation') ||
      name.includes('لائحة') ||
      name.includes('تعديل')
    );
  });

  return preferred ?? attachments[0];
}

const ORDINAL_WORD_TO_NUMBER: Record<string, string> = {
  الاول: '1',
  الاولي: '1',
  الاولى: '1',
  الثاني: '2',
  الثانيه: '2',
  الثانية: '2',
  الثائيه: '2',
  الثائية: '2',
  الثالث: '3',
  الثالثه: '3',
  الثالثة: '3',
  الرابع: '4',
  الرابعه: '4',
  الرابعة: '4',
  الخامس: '5',
  الخامسه: '5',
  الخامسة: '5',
  السادس: '6',
  السادسه: '6',
  السادسة: '6',
  السابع: '7',
  السابعه: '7',
  السابعة: '7',
  الثامن: '8',
  الثامنه: '8',
  الثامنة: '8',
  التاسع: '9',
  التاسعه: '9',
  التاسعة: '9',
  العاشر: '10',
  العاشره: '10',
  العاشرة: '10',
};

function normalizeArabicToken(value: string): string {
  return value
    .replace(/[\u064B-\u0652]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, '')
    .replace(/[^\p{Script=Arabic}0-9A-Za-z]/gu, '');
}

function parseSectionFromOrdinalWords(text: string): string | null {
  const normalized = normalizeArabicToken(text);
  for (const [word, number] of Object.entries(ORDINAL_WORD_TO_NUMBER)) {
    if (normalized.includes(word)) {
      return number;
    }
  }
  return null;
}

function parseArticleSection(line: string, allowOrdinalFallback = false): string | null {
  const normalized = normalizeArabicDigits(
    line
      .replace(BIDI_CONTROLS_REGEX, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
  if (!normalized) return null;

  // OCR may output "الحادة" instead of "المادة".
  const corrected = allowOrdinalFallback
    ? normalized.replace(/\bالحادة\b/g, 'المادة')
    : normalized;

  const numericHeadingMatch = allowOrdinalFallback
    ? corrected.match(
      /^[\W_]*\(?\s*(?:ال)?(?:مادة|ماده)\s*([0-9]+(?:\s*مكرر(?:\s*[أ-ي])?)?)\s*\)?[\W_]*$/u,
    )
    : corrected.match(/^مادة\s*([0-9]+(?:\s*مكرر(?:\s*[أ-ي])?)?)/u);
  if (numericHeadingMatch && (!allowOrdinalFallback || corrected.length <= 50)) {
    return numericHeadingMatch[1].replace(/\s+/g, ' ').trim();
  }

  if (allowOrdinalFallback) {
    const ordinalHeadingMatch = corrected.match(
      /^[\W_]*\(?\s*(?:ال)?(?:مادة|ماده)\s*([^\d][\p{Script=Arabic}\s]{2,30})\s*\)?[\W_]*$/u,
    );
    if (ordinalHeadingMatch) {
      const parsedOrdinal = parseSectionFromOrdinalWords(ordinalHeadingMatch[1]);
      if (parsedOrdinal) return parsedOrdinal;
    }

    // OCR may miss the word "مادة" but still preserve a short ordinal-only heading.
    if (corrected.length <= 40) {
      const parsedOrdinal = parseSectionFromOrdinalWords(corrected);
      if (parsedOrdinal) {
        return parsedOrdinal;
      }
    }
  }

  const englishMatch = corrected.match(/^Article\s*(\d+[A-Za-z]*)/i);
  if (englishMatch) {
    return englishMatch[1].trim();
  }

  return null;
}

function buildProvisionRef(section: string, ordinal: number): string {
  const core = normalizeArabicDigits(section)
    .toLowerCase()
    .replace(/مكرر/g, 'bis')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return core ? `art${core}` : `art${ordinal}`;
}

function normalizePdfText(pdfText: string): string {
  return pdfText
    .replace(/\r/g, '')
    .replace(/\f/g, '\n')
    .replace(BIDI_CONTROLS_REGEX, '');
}

function extractDefinitions(content: string, sourceProvision: string): ParsedDefinition[] {
  if (!content.includes('يقصد') && !content.includes('تعني') && !content.includes('المقصود')) {
    return [];
  }

  const defs: ParsedDefinition[] = [];
  const regex = /(يقصد\s*(?:به|بكلمة|بعبارة)?\s*[^\n،:]{1,80})[،:\-]\s*([^\n]{8,600})/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    const term = match[1].trim();
    const definition = match[2].trim();
    if (term.length > 2 && definition.length > 8) {
      defs.push({ term, definition, source_provision: sourceProvision });
    }
  }

  return defs;
}

function parseArabicTitleFromPdf(pdfText: string): string | undefined {
  const text = normalizePdfText(pdfText);
  const match = text.match(/قانون\s+رقم\s+[0-9٠-٩]+\s+لسنة\s+[0-9٠-٩]{4}[^\n]{0,180}/);
  if (!match) return undefined;
  return normalizeArabicDigits(match[0]).replace(/\s+/g, ' ').trim();
}

export function buildSeedFromPdfText(
  law: PortalLawDetail,
  pdfTextRaw: string,
  sourcePdfUrl: string,
  options?: {
    allowOrdinalFallback?: boolean;
    idSuffix?: string;
    preferCanonicalLawTitle?: boolean;
    titleEnOverride?: string;
    shortNameOverride?: string;
    urlOverride?: string;
  },
): ParsedAct | null {
  const normalizedText = normalizePdfText(pdfTextRaw);
  const lines = normalizedText.split('\n');
  const allowOrdinalFallback = options?.allowOrdinalFallback ?? false;
  const preferCanonicalLawTitle = options?.preferCanonicalLawTitle ?? true;

  const sections: { section: string; startLine: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const section = parseArticleSection(lines[i], allowOrdinalFallback);
    if (section) {
      sections.push({ section, startLine: i });
    }
  }

  if (sections.length === 0) {
    return null;
  }

  const provisions: ParsedProvision[] = [];
  const definitions: ParsedDefinition[] = [];
  const seenRefs = new Map<string, number>();

  for (let i = 0; i < sections.length; i++) {
    const current = sections[i];
    const endLine = i + 1 < sections.length ? sections[i + 1].startLine : lines.length;
    const blockLines = lines.slice(current.startLine + 1, endLine);

    while (blockLines.length > 0 && blockLines[0].trim().length === 0) blockLines.shift();
    while (blockLines.length > 0 && blockLines[blockLines.length - 1].trim().length === 0) blockLines.pop();

    const content = blockLines.join('\n').trim();
    if (content.length < 10) continue;

    const baseRef = buildProvisionRef(current.section, i + 1);
    const existing = seenRefs.get(baseRef) ?? 0;
    seenRefs.set(baseRef, existing + 1);
    const provisionRef = existing === 0 ? baseRef : `${baseRef}-${existing + 1}`;

    const title = `مادة ${current.section}`;
    provisions.push({
      provision_ref: provisionRef,
      section: current.section,
      title,
      content,
    });

    definitions.push(...extractDefinitions(content, provisionRef));
  }

  if (provisions.length === 0) {
    return null;
  }

  const parsedTitleAr = parseArabicTitleFromPdf(pdfTextRaw);
  const canonicalTitleAr = `قانون رقم ${law.lawNumber} لسنة ${law.lawYear}`;
  const normalizedLawNumber = normalizeArabicDigits(law.lawNumber);
  const normalizedLawYear = normalizeArabicDigits(law.lawYear);
  const parsedTitleMatchesLaw = parsedTitleAr
    && normalizeArabicDigits(parsedTitleAr).includes(normalizedLawNumber)
    && normalizeArabicDigits(parsedTitleAr).includes(normalizedLawYear);

  const titleAr = parsedTitleMatchesLaw
    ? parsedTitleAr
    : (preferCanonicalLawTitle ? canonicalTitleAr : (parsedTitleAr ?? canonicalTitleAr));

  const baseId = `eg-law-${law.lawNumber}-${law.lawYear}`;
  const id = options?.idSuffix ? `${baseId}-${options.idSuffix}` : baseId;

  return {
    id,
    type: 'statute',
    title: titleAr,
    title_en: options?.titleEnOverride || law.titleEn || undefined,
    short_name: options?.shortNameOverride || law.shortName,
    status: law.status,
    issued_date: law.issuedDate,
    in_force_date: law.effectiveDate,
    url: options?.urlOverride || law.detailUrl,
    description: law.description
      ? `${law.description} [PDF: ${sourcePdfUrl}]`
      : `Source PDF: ${sourcePdfUrl}`,
    provisions,
    definitions,
  };
}
