import { describe, it, expect } from 'vitest'
import { normalizeQuotes, stripFormattingTags } from '../utils/normalizeHtml'

describe('normalizeQuotes', () => {
  // Basic double quote conversions
  it('converts left double curly quote to straight double quote', () => {
    expect(normalizeQuotes('\u201CHello')).toBe('"Hello')
  })

  it('converts right double curly quote to straight double quote', () => {
    expect(normalizeQuotes('Hello\u201D')).toBe('Hello"')
  })

  it('converts paired double curly quotes', () => {
    expect(normalizeQuotes('\u201CClinic\u201D')).toBe('"Clinic"')
  })

  // Basic single quote conversions
  it('converts left single curly quote to straight apostrophe', () => {
    expect(normalizeQuotes('\u2018Hello')).toBe("'Hello")
  })

  it('converts right single curly quote to straight apostrophe', () => {
    expect(normalizeQuotes('don\u2019t')).toBe("don't")
  })

  it('converts paired single curly quotes', () => {
    expect(normalizeQuotes('\u2018Clinic\u2019')).toBe("'Clinic'")
  })

  // German-style quotes (low-9)
  it('converts low-9 double quote (German-style opening)', () => {
    expect(normalizeQuotes('\u201EHello\u201D')).toBe('"Hello"')
  })

  it('converts low-9 single quote', () => {
    expect(normalizeQuotes('\u201AHello\u2019')).toBe("'Hello'")
  })

  // Preservation
  it('preserves straight double quotes', () => {
    expect(normalizeQuotes('"Hello"')).toBe('"Hello"')
  })

  it('preserves straight single quotes / apostrophes', () => {
    expect(normalizeQuotes("'Hello'")).toBe("'Hello'")
  })

  // HTML context
  it('normalizes curly quotes inside HTML content', () => {
    expect(normalizeQuotes('<strong>\u201CClinic\u201D</strong>')).toBe('<strong>"Clinic"</strong>')
  })

  it('does not alter HTML attribute quotes', () => {
    expect(normalizeQuotes('<span class="test">\u201CHello\u201D</span>')).toBe('<span class="test">"Hello"</span>')
  })

  // Multiple and mixed
  it('handles multiple curly quotes in one string', () => {
    expect(normalizeQuotes('\u201CA\u201D and \u201CB\u201D')).toBe('"A" and "B"')
  })

  it('handles mixed curly and straight quotes', () => {
    expect(normalizeQuotes('\u201CA\u201D and "B"')).toBe('"A" and "B"')
  })

  it('handles mixed single and double curly quotes', () => {
    expect(normalizeQuotes('\u201CHe said \u2018hello\u2019\u201D')).toBe('"He said \'hello\'"')
  })

  // Edge cases
  it('handles empty string', () => {
    expect(normalizeQuotes('')).toBe('')
  })

  it('handles text with no quotes at all', () => {
    expect(normalizeQuotes('Hello world')).toBe('Hello world')
  })

  it('handles string of only curly quotes', () => {
    expect(normalizeQuotes('\u201C\u201D\u2018\u2019')).toBe('"\"\'\'' )
  })
})

describe('stripFormattingTags', () => {
  // Basic tag stripping
  it('removes <strong> and </strong> tags', () => {
    expect(stripFormattingTags('<strong>Hello</strong>')).toBe('Hello')
  })

  it('removes <em> and </em> tags', () => {
    expect(stripFormattingTags('<em>Hello</em>')).toBe('Hello')
  })

  it('removes <b> and </b> tags', () => {
    expect(stripFormattingTags('<b>Hello</b>')).toBe('Hello')
  })

  it('removes <i> and </i> tags', () => {
    expect(stripFormattingTags('<i>Hello</i>')).toBe('Hello')
  })

  it('removes <u> and </u> tags', () => {
    expect(stripFormattingTags('<u>Hello</u>')).toBe('Hello')
  })

  it('removes <s> and </s> tags', () => {
    expect(stripFormattingTags('<s>Hello</s>')).toBe('Hello')
  })

  it('removes <mark> and </mark> tags', () => {
    expect(stripFormattingTags('<mark>Hello</mark>')).toBe('Hello')
  })

  it('removes <sub> and </sub> tags', () => {
    expect(stripFormattingTags('<sub>Hello</sub>')).toBe('Hello')
  })

  it('removes <sup> and </sup> tags', () => {
    expect(stripFormattingTags('<sup>Hello</sup>')).toBe('Hello')
  })

  // Preserving non-formatting tags
  it('preserves <p> tags', () => {
    expect(stripFormattingTags('<p>Hello</p>')).toBe('<p>Hello</p>')
  })

  it('preserves <div> tags', () => {
    expect(stripFormattingTags('<div>Hello</div>')).toBe('<div>Hello</div>')
  })

  it('preserves <span> tags', () => {
    expect(stripFormattingTags('<span>Hello</span>')).toBe('<span>Hello</span>')
  })

  it('preserves <br> tags', () => {
    expect(stripFormattingTags('Hello<br>World')).toBe('Hello<br>World')
  })

  it('preserves <a> tags with attributes', () => {
    expect(stripFormattingTags('<a href="#">Hello</a>')).toBe('<a href="#">Hello</a>')
  })

  it('preserves <ul> and <li> tags', () => {
    expect(stripFormattingTags('<ul><li>Hello</li></ul>')).toBe('<ul><li>Hello</li></ul>')
  })

  // Nested and mixed tags
  it('removes nested formatting tags', () => {
    expect(stripFormattingTags('<strong><em>Hello</em></strong>')).toBe('Hello')
  })

  it('removes formatting tags inside preserved tags', () => {
    expect(stripFormattingTags('<p><strong>Hello</strong> world</p>')).toBe('<p>Hello world</p>')
  })

  it('handles formatting tags with attributes', () => {
    expect(stripFormattingTags('<strong class="bold">Hello</strong>')).toBe('Hello')
  })

  it('handles case-insensitive tags', () => {
    expect(stripFormattingTags('<STRONG>Hello</STRONG>')).toBe('Hello')
  })

  it('handles multiple formatting tags in sequence', () => {
    expect(stripFormattingTags('<strong>A</strong> <em>B</em> <b>C</b>')).toBe('A B C')
  })

  // Edge cases
  it('handles empty string', () => {
    expect(stripFormattingTags('')).toBe('')
  })

  it('handles text without any tags', () => {
    expect(stripFormattingTags('Hello world')).toBe('Hello world')
  })

  it('handles self-closing formatting-like tags gracefully', () => {
    expect(stripFormattingTags('Hello<br/>World')).toBe('Hello<br/>World')
  })
})
