import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * vue-diff-text 1.5.4 shipped a stylesheet with three classes and five custom properties.
 * Pages themed against it must keep working on 1.6: the same selectors must style the same
 * properties from the same variables, with the same unthemed defaults. This list is the
 * contract; do not regenerate it from the current stylesheet.
 * (The React package starts at 1.6.0, and scripts/check-fixtures.ts keeps both copies of
 * style.css identical to core, so this one test covers the shipped stylesheet.)
 */
const V1_5_4: Array<[selector: string, property: string, variable: string, fallback: string]> = [
  ['.text-diff .diff-added', 'background-color', '--text-diff-added-bg', '#ddfbe6'],
  ['.text-diff .diff-added', 'color', '--text-diff-added-color', '#008000'],
  ['.text-diff .diff-removed', 'background-color', '--text-diff-removed-bg', '#fce9e9'],
  ['.text-diff .diff-removed', 'color', '--text-diff-removed-color', '#c70000'],
  ['.text-diff .diff-removed', 'text-decoration', '--text-diff-removed-decoration', 'line-through'],
]

function topLevelRules(): CSSStyleRule[] {
  const style = document.createElement('style')
  style.textContent = readFileSync(resolve(__dirname, '../style.css'), 'utf8')
  document.head.appendChild(style)
  const rules = Array.from((style.sheet as CSSStyleSheet).cssRules).filter((r): r is CSSStyleRule => 'selectorText' in r)
  style.remove()
  return rules
}

const selectorsOf = (rule: CSSStyleRule) => rule.selectorText.split(',').map((s) => s.trim())

describe('1.5.4 stylesheet compatibility', () => {
  const rules = topLevelRules()

  /** The value of `property` in the last top-level rule that lists `selector`. */
  const valueFor = (selector: string, property: string) =>
    rules
      .filter((r) => selectorsOf(r).includes(selector))
      .map((r) => r.style.getPropertyValue(property).trim())
      .filter((v) => v !== '')
      .pop()

  it.each(V1_5_4)('%s { %s } still comes from %s (default %s)', (selector, property, variable, fallback) => {
    let value = valueFor(selector, property) ?? ''
    // 1.6 routes public variables through private --_td-* ones defined on .text-diff.
    const inner = /^var\((--_td-[\w-]+)\)$/.exec(value)
    if (inner) value = valueFor('.text-diff', inner[1]!) ?? ''
    expect(value.replace(/\s+/g, ' ')).toBe(`var(${variable}, ${fallback})`)
  })
})
