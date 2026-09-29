/**
 * Normalize curly/smart quotes to their straight equivalents.
 *
 * Handles:
 *  - \u201C \u201D \u201E (double) → "
 *  - \u2018 \u2019 \u201A (single) → '
 */
export function normalizeQuotes(text: string): string {
  return text
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2018\u2019\u201A]/g, "'")
}

/**
 * Strip inline formatting tags while preserving block-level and other HTML.
 *
 * Removes: <strong>, <em>, <b>, <i>, <u>, <s>, <mark>, <sub>, <sup>
 * (opening, closing, and with attributes)
 */
export function stripFormattingTags(text: string): string {
  return text.replace(/<\/?(strong|em|b|i|u|s|mark|sub|sup)(\s[^>]*)?>/gi, '')
}
