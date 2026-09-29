import { describe, it, expect } from 'vitest'
import { computeTextSimilarity } from '../utils/similarity'

describe('computeTextSimilarity', () => {
  it('returns 1 for identical texts', () => {
    expect(computeTextSimilarity('hello world', 'hello world')).toBe(1)
  })

  it('returns 1 for both empty strings', () => {
    expect(computeTextSimilarity('', '')).toBe(1)
  })

  it('returns 0 when old text is empty', () => {
    expect(computeTextSimilarity('', 'hello')).toBe(0)
  })

  it('returns 0 when new text is empty', () => {
    expect(computeTextSimilarity('hello', '')).toBe(0)
  })

  it('returns 0 for completely different texts', () => {
    const similarity = computeTextSimilarity(
      'alpha beta gamma delta',
      'xylophone zebra quantum'
    )
    expect(similarity).toBeLessThan(0.1)
  })

  it('returns high similarity for minor word changes', () => {
    const similarity = computeTextSimilarity(
      'The quick brown fox jumps over the lazy dog',
      'The quick brown fox leaps over the lazy dog'
    )
    expect(similarity).toBeGreaterThan(0.8)
  })

  it('returns low similarity for complete content replacement', () => {
    const similarity = computeTextSimilarity(
      'It is expressly agreed and understood by the parties that the Husband shall maintain his existing life insurance policy in the amount of $500,000 with the Wife named as the irrevocable beneficiary thereof.',
      'Item 1: House\nItem 2: Car\nItem 3: Savings Account'
    )
    expect(similarity).toBeLessThan(0.3)
  })

  it('strips HTML tags before comparing', () => {
    const similarity = computeTextSimilarity(
      '<p>Hello <strong>world</strong></p>',
      '<div>Hello <em>world</em></div>'
    )
    expect(similarity).toBe(1)
  })

  it('strips HTML but compares text content differences', () => {
    const similarity = computeTextSimilarity(
      '<p>Hello world</p>',
      '<p>Goodbye world</p>'
    )
    expect(similarity).toBeGreaterThan(0.3)
    expect(similarity).toBeLessThan(1)
  })

  it('returns 1 for whitespace-only strings after trimming', () => {
    // Both become empty after trim, so returns 1
    expect(computeTextSimilarity('   ', '   ')).toBe(1)
  })

  it('returns 0 for empty HTML tags vs real content', () => {
    // <p></p> becomes empty after strip + trim
    expect(computeTextSimilarity('<p></p>', 'hello')).toBe(0)
  })

  it('returns 0 for whitespace-only HTML vs real content', () => {
    // <p>  </p> becomes empty after strip + trim
    expect(computeTextSimilarity('<p>  </p>', 'hello')).toBe(0)
  })

  it('handles angle brackets in plain text gracefully', () => {
    // The regex /<[^>]*>/g matches "< world >" as a tag-like pattern
    // The result is high similarity but not necessarily exact, depending on
    // how the regex interacts with surrounding whitespace
    const similarity = computeTextSimilarity('hello < world > test', 'hello test')
    expect(similarity).toBeGreaterThan(0.8)
  })

  // ─── Quote normalization in similarity ──────────────────────────────

  it('treats curly double quotes as identical to straight double quotes', () => {
    const similarity = computeTextSimilarity(
      '\u201CClinic\u201D means selected.',
      '"Clinic" means selected.'
    )
    expect(similarity).toBe(1)
  })

  it('treats curly single quotes as identical to straight single quotes', () => {
    const similarity = computeTextSimilarity(
      'don\u2019t stop',
      "don't stop"
    )
    expect(similarity).toBe(1)
  })

  it('does not penalize similarity for quote style differences', () => {
    const similarity = computeTextSimilarity(
      '\u201CClinic\u201D means a fertility clinic selected by the Intended Parent.',
      '"Clinic" means a fertility clinic selected by the Intended Parent.'
    )
    expect(similarity).toBe(1)
  })
})
