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

/**
 * Normalize Arabic Presentation Forms (U+FB50-U+FDFF, U+FE70-U+FEFF) to
 * standard Arabic script (U+0600-U+06FF). PDFs frequently emit presentation
 * forms which breaks word matching.
 *
 * Also strips Arabic Tatweel/Kashida (U+0640) which is a stretching character.
 */
function normalizeArabicPresentationForms(text: string): string {
  // Map Arabic Presentation Forms-B (FE70-FEFF) to base Arabic characters.
  // Each Arabic letter has up to 4 presentation forms: isolated, final, initial, medial.
  const FORMS_B: Record<number, number> = {
    // Hamza
    0xFE80: 0x0621,
    // Alef with Madda
    0xFE81: 0x0622, 0xFE82: 0x0622,
    // Alef with Hamza Above
    0xFE83: 0x0623, 0xFE84: 0x0623,
    // Waw with Hamza Above
    0xFE85: 0x0624, 0xFE86: 0x0624,
    // Alef with Hamza Below
    0xFE87: 0x0625, 0xFE88: 0x0625,
    // Yeh with Hamza Above
    0xFE89: 0x0626, 0xFE8A: 0x0626, 0xFE8B: 0x0626, 0xFE8C: 0x0626,
    // Alef
    0xFE8D: 0x0627, 0xFE8E: 0x0627,
    // Beh
    0xFE8F: 0x0628, 0xFE90: 0x0628, 0xFE91: 0x0628, 0xFE92: 0x0628,
    // Teh Marbuta
    0xFE93: 0x0629, 0xFE94: 0x0629,
    // Teh
    0xFE95: 0x062A, 0xFE96: 0x062A, 0xFE97: 0x062A, 0xFE98: 0x062A,
    // Theh
    0xFE99: 0x062B, 0xFE9A: 0x062B, 0xFE9B: 0x062B, 0xFE9C: 0x062B,
    // Jeem
    0xFE9D: 0x062C, 0xFE9E: 0x062C, 0xFE9F: 0x062C, 0xFEA0: 0x062C,
    // Hah
    0xFEA1: 0x062D, 0xFEA2: 0x062D, 0xFEA3: 0x062D, 0xFEA4: 0x062D,
    // Khah
    0xFEA5: 0x062E, 0xFEA6: 0x062E, 0xFEA7: 0x062E, 0xFEA8: 0x062E,
    // Dal
    0xFEA9: 0x062F, 0xFEAA: 0x062F,
    // Thal
    0xFEAB: 0x0630, 0xFEAC: 0x0630,
    // Reh
    0xFEAD: 0x0631, 0xFEAE: 0x0631,
    // Zain
    0xFEAF: 0x0632, 0xFEB0: 0x0632,
    // Seen
    0xFEB1: 0x0633, 0xFEB2: 0x0633, 0xFEB3: 0x0633, 0xFEB4: 0x0633,
    // Sheen
    0xFEB5: 0x0634, 0xFEB6: 0x0634, 0xFEB7: 0x0634, 0xFEB8: 0x0634,
    // Sad
    0xFEB9: 0x0635, 0xFEBA: 0x0635, 0xFEBB: 0x0635, 0xFEBC: 0x0635,
    // Dad
    0xFEBD: 0x0636, 0xFEBE: 0x0636, 0xFEBF: 0x0636, 0xFEC0: 0x0636,
    // Tah
    0xFEC1: 0x0637, 0xFEC2: 0x0637, 0xFEC3: 0x0637, 0xFEC4: 0x0637,
    // Zah
    0xFEC5: 0x0638, 0xFEC6: 0x0638, 0xFEC7: 0x0638, 0xFEC8: 0x0638,
    // Ain
    0xFEC9: 0x0639, 0xFECA: 0x0639, 0xFECB: 0x0639, 0xFECC: 0x0639,
    // Ghain
    0xFECD: 0x063A, 0xFECE: 0x063A, 0xFECF: 0x063A, 0xFED0: 0x063A,
    // Feh
    0xFED1: 0x0641, 0xFED2: 0x0641, 0xFED3: 0x0641, 0xFED4: 0x0641,
    // Qaf
    0xFED5: 0x0642, 0xFED6: 0x0642, 0xFED7: 0x0642, 0xFED8: 0x0642,
    // Kaf
    0xFED9: 0x0643, 0xFEDA: 0x0643, 0xFEDB: 0x0643, 0xFEDC: 0x0643,
    // Lam
    0xFEDD: 0x0644, 0xFEDE: 0x0644, 0xFEDF: 0x0644, 0xFEE0: 0x0644,
    // Meem
    0xFEE1: 0x0645, 0xFEE2: 0x0645, 0xFEE3: 0x0645, 0xFEE4: 0x0645,
    // Noon
    0xFEE5: 0x0646, 0xFEE6: 0x0646, 0xFEE7: 0x0646, 0xFEE8: 0x0646,
    // Heh
    0xFEE9: 0x0647, 0xFEEA: 0x0647, 0xFEEB: 0x0647, 0xFEEC: 0x0647,
    // Waw
    0xFEED: 0x0648, 0xFEEE: 0x0648,
    // Alef Maksura
    0xFEEF: 0x0649, 0xFEF0: 0x0649,
    // Yeh
    0xFEF1: 0x064A, 0xFEF2: 0x064A, 0xFEF3: 0x064A, 0xFEF4: 0x064A,
    // Lam-Alef ligatures
    0xFEF5: 0x0644, 0xFEF6: 0x0644, // Lam-Alef with Madda
    0xFEF7: 0x0644, 0xFEF8: 0x0644, // Lam-Alef with Hamza Above
    0xFEF9: 0x0644, 0xFEFA: 0x0644, // Lam-Alef with Hamza Below
    0xFEFB: 0x0644, 0xFEFC: 0x0644, // Lam-Alef
  };

  // Map Arabic Presentation Forms-A (FB50-FDFF)
  const FORMS_A: Record<number, number> = {
    // Alef Wasla
    0xFB50: 0x0671, 0xFB51: 0x0671,
    // Peh
    0xFB56: 0x067E, 0xFB57: 0x067E, 0xFB58: 0x067E, 0xFB59: 0x067E,
    // Tcheh
    0xFB7A: 0x0686, 0xFB7B: 0x0686, 0xFB7C: 0x0686, 0xFB7D: 0x0686,
    // Gaf
    0xFB92: 0x06AF, 0xFB93: 0x06AF, 0xFB94: 0x06AF, 0xFB95: 0x06AF,
    // Farsi Yeh (used as Yeh in Egyptian typesetting)
    0xFBFC: 0x064A, 0xFBFD: 0x064A, 0xFBFE: 0x064A, 0xFBFF: 0x064A,
    // Various Lam-Alef ligatures (Presentation Forms-A)
    0xFBEA: 0x0644, 0xFBEB: 0x0644,
    0xFBEC: 0x0644, 0xFBED: 0x0644,
    0xFBEE: 0x0644, 0xFBEF: 0x0644,
    0xFBF0: 0x0644, 0xFBF1: 0x0644,
  };

  // Ligatures in Forms-A that decompose to multiple characters
  const LIGATURE_DECOMP: Record<number, string> = {
    0xFC43: '\u0644\u064A', // Lam-Yeh
    0xFCC9: '\u0644\u062C', // Lam-Jeem
    0xFCCC: '\u0644\u0645', // Lam-Meem
    0xFC40: '\u0644\u062D', // Lam-Hah
    0xFC41: '\u0644\u062E', // Lam-Khah
    0xFC42: '\u0644\u0645', // Lam-Meem (initial)
    0xFCCD: '\u0644\u0647', // Lam-Heh
    0xFCCE: '\u0645\u062C', // Meem-Jeem
    0xFCCF: '\u0645\u062D', // Meem-Hah
    0xFCD0: '\u0645\u062E', // Meem-Khah
    0xFCD1: '\u0645\u0645', // Meem-Meem
  };

  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);

    // Strip Tatweel/Kashida
    if (code === 0x0640) continue;

    // Arabic Presentation Forms-B
    if (code >= 0xFE70 && code <= 0xFEFF) {
      const mapped = FORMS_B[code];
      if (mapped) {
        result += String.fromCharCode(mapped);

        // Lam-Alef ligatures need to also emit Alef
        if (code >= 0xFEF5 && code <= 0xFEFC) {
          if (code <= 0xFEF6) result += '\u0622'; // Alef with Madda
          else if (code <= 0xFEF8) result += '\u0623'; // Alef with Hamza Above
          else if (code <= 0xFEFA) result += '\u0625'; // Alef with Hamza Below
          else result += '\u0627'; // Plain Alef
        }
        continue;
      }
    }

    // Arabic Presentation Forms-A (single character mappings)
    if (code >= 0xFB50 && code <= 0xFDFF) {
      // First check for ligatures that decompose to multiple characters
      const ligature = LIGATURE_DECOMP[code];
      if (ligature) {
        result += ligature;
        continue;
      }
      const mapped = FORMS_A[code];
      if (mapped) {
        result += String.fromCharCode(mapped);
        continue;
      }
    }

    result += text[i];
  }

  return result;
}

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
    normalizeArabicPresentationForms(
      line
        .replace(BIDI_CONTROLS_REGEX, '')
    )
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
    : corrected.match(
      /^[\W_]*\(?\s*(?:ال)?(?:مادة|ماده)\s*\)?\s*\(?\s*([0-9]+(?:\s*مكرر(?:\s*[أ-ي])?)?)\s*\)?/u,
    );
  if (numericHeadingMatch && (!allowOrdinalFallback || corrected.length <= 50)) {
    return numericHeadingMatch[1].replace(/\s+/g, ' ').trim();
  }

  // Try ordinal word headings (e.g., "المادة الأولى" = Article First)
  // This is common in Egyptian Official Gazette PDF exports.
  {
    const ordinalHeadingMatch = corrected.match(
      /^[\W_]*\(?\s*(?:ال)?(?:مادة|ماده)\s*([^\d][\p{Script=Arabic}\s]{2,30})\s*\)?[\W_]*$/u,
    );
    if (ordinalHeadingMatch) {
      const parsedOrdinal = parseSectionFromOrdinalWords(ordinalHeadingMatch[1]);
      if (parsedOrdinal) return parsedOrdinal;
    }
  }

  if (allowOrdinalFallback) {
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
  return normalizeArabicPresentationForms(
    pdfText
      .replace(/\r/g, '')
      .replace(/\f/g, '\n')
      .replace(BIDI_CONTROLS_REGEX, ''),
  );
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
