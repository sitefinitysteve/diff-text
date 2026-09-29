import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import {
  DiffChars,
  DiffHtml,
  DiffSplit,
  DiffUnified,
  DiffWords,
  DiffWordsWithSpace,
  DiffStats,
  DiffPlayback,
  DiffTimeline,
  TextDiff,
} from '../index'

const numbered = (n: number, change: (i: number) => string | null = () => null) =>
  Array.from({ length: n }, (_, k) => change(k + 1) ?? `line ${k + 1}`).join('\n') + '\n'

const OLD_20 = numbered(20)
const NEW_20 = numbered(20, (i) => (i === 10 ? 'line ten' : null))

describe('collapsed rows', () => {
  for (const [name, component] of [['DiffUnified', DiffUnified], ['DiffSplit', DiffSplit]] as const) {
    it(`${name}: collapsed rows are buttons that expand in place`, async () => {
      const wrapper = mount(component, { props: { oldText: OLD_20, newText: NEW_20 } })
      const buttons = wrapper.findAll('button.diff-row-collapsed')
      expect(buttons.map((b) => b.text())).toEqual(['6 unchanged lines', '7 unchanged lines'])
      expect(buttons[0].attributes('type')).toBe('button')
      const rowsBefore = wrapper.findAll('.diff-row').length

      await buttons[0].trigger('click')

      expect(wrapper.findAll('button.diff-row-collapsed').map((b) => b.text())).toEqual(['7 unchanged lines'])
      // the button is replaced by its 6 hidden rows
      expect(wrapper.findAll('.diff-row').length).toBe(rowsBefore - 1 + 6)
      const first = wrapper.find('.diff-row')
      expect(first.classes()).toContain('diff-row-equal')
      expect(first.find('.diff-gutter').text()).toBe('1')
      expect(first.find('.diff-line').text()).toBe('line 1')
      // change indices are unchanged by expansion
      expect(wrapper.findAll('[data-change-index]').map((e) => e.attributes('data-change-index'))).toEqual(['0'])
    })

    it(`${name}: expansion state resets when the inputs change`, async () => {
      const wrapper = mount(component, { props: { oldText: OLD_20, newText: NEW_20 } })
      await wrapper.find('button.diff-row-collapsed').trigger('click')
      expect(wrapper.findAll('button.diff-row-collapsed').length).toBe(1)
      await wrapper.setProps({ newText: numbered(20, (i) => (i === 11 ? 'line eleven' : null)) })
      expect(wrapper.findAll('button.diff-row-collapsed').map((b) => b.text())).toEqual([
        '7 unchanged lines',
        '6 unchanged lines',
      ])
    })
  }
})

describe('navigation', () => {
  let scroll: ReturnType<typeof vi.fn>
  beforeEach(() => {
    scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll as unknown as Element['scrollIntoView']
  })
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })

  const current = (w: ReturnType<typeof mount>) =>
    w.findAll('.is-current').map((e) => e.attributes('data-change-index'))

  it('next() and prev() cycle through the changes and mark the current one', () => {
    const wrapper = mount(DiffWords, { props: { oldText: 'one two three', newText: 'one 2 three 4' } })
    const nav = wrapper.vm as unknown as { next(): number; prev(): number; goTo(i: number): number; count: number }
    expect(nav.count).toBe(3)
    expect(current(wrapper)).toEqual([])

    expect(nav.next()).toBe(0)
    expect(current(wrapper)).toEqual(['0'])
    expect(nav.next()).toBe(1)
    expect(nav.next()).toBe(2)
    expect(nav.next()).toBe(0) // wraps
    expect(current(wrapper)).toEqual(['0'])
    expect(nav.prev()).toBe(2) // wraps backwards
    expect(current(wrapper)).toEqual(['2'])
    expect(nav.goTo(4)).toBe(1) // wrapped into range
    expect(current(wrapper)).toEqual(['1'])
    expect(scroll).toHaveBeenCalledTimes(6)
    // The highlight comes from the .is-current rule in style.css, not from inline styles.
    expect(wrapper.find('.is-current').attributes('style')).toBeUndefined()
  })

  it('prev() from the start goes to the last change', () => {
    const wrapper = mount(DiffChars, { props: { oldText: 'abc', newText: 'xbz' } })
    const nav = wrapper.vm as unknown as { prev(): number; count: number }
    expect(nav.count).toBe(4)
    expect(nav.prev()).toBe(3)
  })

  it('returns -1 and does nothing when there are no changes', () => {
    const wrapper = mount(DiffChars, { props: { oldText: 'same', newText: 'same' } })
    const nav = wrapper.vm as unknown as { next(): number; prev(): number; count: number }
    expect(nav.count).toBe(0)
    expect(nav.next()).toBe(-1)
    expect(nav.prev()).toBe(-1)
    expect(scroll).not.toHaveBeenCalled()
  })

  it('counts changes in DiffHtml (incl. full replacement) and in the line views by run', () => {
    const count = (w: ReturnType<typeof mount>) => (w.vm as unknown as { count: number }).count
    expect(count(mount(DiffHtml, { props: { oldText: '<p>a b</p>', newText: '<p>a c</p>' } }))).toBe(2)
    expect(count(mount(DiffHtml, { props: { oldText: 'abc', newText: 'xyz', similarityThreshold: 0.5 } }))).toBe(2)
    expect(count(mount(DiffUnified, { props: { oldText: 'a\nb\nc\n', newText: 'A\nb\nC\n' } }))).toBe(2)
    expect(count(mount(DiffSplit, { props: { oldText: 'a\nb\nc\n', newText: 'A\nb\nC\n' } }))).toBe(2)
  })

  it('navigates line views by change run', () => {
    const wrapper = mount(DiffUnified, { props: { oldText: 'a\nb\nc\n', newText: 'A\nb\nC\n' } })
    const nav = wrapper.vm as unknown as { next(): number }
    nav.next()
    nav.next()
    const marked = wrapper.findAll('.is-current')
    expect(marked.length).toBe(1)
    expect(marked[0].classes()).toContain('diff-row-removed')
    expect(marked[0].find('.diff-line').text()).toBe('c')
  })

  it('clears the current change when the inputs change', async () => {
    const wrapper = mount(DiffWords, { props: { oldText: 'one two', newText: 'one 2' } })
    const nav = wrapper.vm as unknown as { next(): number }
    nav.next()
    expect(current(wrapper)).toEqual(['0'])
    await wrapper.setProps({ newText: 'one 3' })
    expect(current(wrapper)).toEqual([])
    expect(nav.next()).toBe(0)
  })
})

describe('reactivity', () => {
  it('text components re-render when props change', async () => {
    const wrapper = mount(DiffChars, { props: { oldText: 'a', newText: 'a' } })
    expect(wrapper.findAll('.diff-added').length).toBe(0)
    await wrapper.setProps({ newText: 'ab' })
    expect(wrapper.find('.diff-added').text()).toBe('b')
  })

  it('DiffHtml re-renders when props change', async () => {
    const wrapper = mount(DiffHtml, { props: { oldText: '<p>a</p>', newText: '<p>a</p>' } })
    expect(wrapper.findAll('.diff-added').length).toBe(0)
    await wrapper.setProps({ newText: '<p>a b</p>' })
    expect(wrapper.find('.diff-added').text()).toContain('b')
  })

  it('DiffUnified re-renders when contextLines changes', async () => {
    const wrapper = mount(DiffUnified, { props: { oldText: OLD_20, newText: NEW_20 } })
    expect(wrapper.findAll('.diff-row-equal').length).toBe(6)
    await wrapper.setProps({ contextLines: 0 })
    expect(wrapper.findAll('.diff-row-equal').length).toBe(0)
  })

  it('DiffStats re-renders when mode changes', async () => {
    const wrapper = mount(DiffStats, { props: { oldText: 'a\nb\n', newText: 'a\nc\n' } })
    expect(wrapper.attributes('data-unit')).toBe('codepoints')
    await wrapper.setProps({ mode: 'unified' })
    expect(wrapper.attributes('data-unit')).toBe('lines')
    expect(wrapper.find('.diff-stat-added .diff-sr').text()).toBe('1 line added')
  })
})

describe('1.6.0 contract', () => {
  it('numbers added and removed spans with data-change-index', () => {
    const wrapper = mount(DiffWords, { props: { oldText: 'foo bar baz', newText: 'foo qux baz' } })
    expect(wrapper.element.outerHTML).toBe(
      '<div class="text-diff text-diff-words"><span>foo </span><span class="diff-removed" data-change-index="0">bar</span><span class="diff-added" data-change-index="1">qux</span><span> baz</span></div>',
    )
  })

  it('DiffWordsWithSpace (and TextDiff) use the text-diff-words-with-space container', () => {
    expect(TextDiff).toBe(DiffWordsWithSpace)
    expect(mount(TextDiff, { props: { oldText: 'a', newText: 'b' } }).classes()).toEqual(['text-diff', 'text-diff-words-with-space'])
  })

  it('DiffHtml full replacement uses block-level divs', () => {
    const wrapper = mount(DiffHtml, { props: { oldText: '<b>alpha</b>', newText: 'zeta', similarityThreshold: 1 } })
    expect(wrapper.element.outerHTML).toBe(
      '<div class="text-diff text-diff-html"><div class="diff-removed" data-change-index="0"><b>alpha</b></div><div class="diff-added" data-change-index="1">zeta</div></div>',
    )
  })

  it('falls attributes through onto the container', () => {
    const wrapper = mount(DiffUnified, { props: { oldText: 'a', newText: 'b' }, attrs: { class: 'mine', id: 'x' } })
    expect(wrapper.classes()).toEqual(['text-diff', 'text-diff-unified', 'mine'])
    expect(wrapper.attributes('id')).toBe('x')
  })
})

type Nav = { next(): number; prev(): number; goTo(i: number): number; count: number }
const navOf = (w: ReturnType<typeof mount>) => w.vm as unknown as Nav

// Bug: expanded blocks and the current change were keyed on the model object, which is rebuilt
// whenever the parent re-renders with a new (but equal) inline options object.
describe('UI state survives an unrelated parent re-render', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn() as unknown as Element['scrollIntoView']
  })
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })

  for (const [name, component] of [['DiffUnified', DiffUnified], ['DiffSplit', DiffSplit]] as const) {
    it(`${name}: expanded blocks and the current change are kept for an equal options object`, async () => {
      const wrapper = mount(component, { props: { oldText: OLD_20, newText: NEW_20, options: { ignoreCase: false } } })
      await wrapper.find('button.diff-row-collapsed').trigger('click')
      navOf(wrapper).next()
      await wrapper.setProps({ options: { ignoreCase: false } })
      expect(wrapper.findAll('button.diff-row-collapsed').map((b) => b.text())).toEqual(['7 unchanged lines'])
      expect(wrapper.findAll('.is-current').map((e) => e.attributes('data-change-index'))).toEqual(['0'])
    })
  }

  it('text components keep the current change for an equal options object', async () => {
    const wrapper = mount(DiffWords, { props: { oldText: 'one two three', newText: 'one 2 three', options: {} } })
    navOf(wrapper).next()
    await wrapper.setProps({ options: {} })
    expect(wrapper.findAll('.is-current').map((e) => e.attributes('data-change-index'))).toEqual(['0'])
  })
})

describe('ref.count is live', () => {
  it('follows re-renders, including a drop to 0', async () => {
    const wrapper = mount(DiffWords, { props: { oldText: 'one two three', newText: 'one 2 three 4' } })
    const nav = navOf(wrapper)
    expect(nav.count).toBe(3)
    await wrapper.setProps({ newText: 'one two three 4' })
    expect(nav.count).toBe(1)
    await wrapper.setProps({ newText: 'one two three' })
    expect(nav.count).toBe(0)
    expect(nav.next()).toBe(-1)
  })

  it('follows line-view re-renders', async () => {
    const wrapper = mount(DiffUnified, { props: { oldText: 'a\nb\nc\n', newText: 'A\nb\nC\n' } })
    expect(navOf(wrapper).count).toBe(2)
    await wrapper.setProps({ newText: 'a\nb\nc\n' })
    expect(navOf(wrapper).count).toBe(0)
  })
})

// Sentence 2 replaced: the default orphanMatchThreshold (0.3) gives one removed + one added
// run; 0 keeps the orphan matches and interleaves four pairs.
const ORPHAN_OLD = 'The quick brown fox jumps over the lazy dog. Each party acknowledges that any term of this agreement will be interpreted accordingly.'
const ORPHAN_NEW = 'The quick brown fox jumps over the lazy dog. Test writing new content.'

describe('options reach the engine', () => {
  it('DiffHtml forwards options to the HTML engine', () => {
    expect(navOf(mount(DiffHtml, { props: { oldText: ORPHAN_OLD, newText: ORPHAN_NEW } })).count).toBe(2)
    const wrapper = mount(DiffHtml, { props: { oldText: ORPHAN_OLD, newText: ORPHAN_NEW, options: { orphanMatchThreshold: 0 } } })
    expect(navOf(wrapper).count).toBe(8)
    expect(wrapper.findAll('.diff-added').map((e) => e.text())).toEqual(['Test', 'writing', 'new', 'content'])
    expect(navOf(mount(DiffHtml, { props: { oldText: '<p>Hello</p>', newText: '<p>hello</p>', options: { ignoreCase: true } } })).count).toBe(0)
  })

  it('DiffHtml leaves full replacement off by default (similarityThreshold null)', () => {
    const wrapper = mount(DiffHtml, { props: { oldText: 'Completely different text here with many words.', newText: 'XYZ 123 ABC.' } })
    expect(wrapper.find('div.diff-removed').exists()).toBe(false)
  })

  it('an options change re-renders the text components', async () => {
    const wrapper = mount(DiffChars, { props: { oldText: 'Abc', newText: 'abc' } })
    expect(navOf(wrapper).count).toBe(2)
    await wrapper.setProps({ options: { ignoreCase: true } })
    expect(navOf(wrapper).count).toBe(0)
    expect(wrapper.text()).toBe('abc')
  })

  it('an options change re-renders DiffHtml', async () => {
    const wrapper = mount(DiffHtml, { props: { oldText: ORPHAN_OLD, newText: ORPHAN_NEW } })
    await wrapper.setProps({ options: { orphanMatchThreshold: 0 } })
    expect(navOf(wrapper).count).toBe(8)
  })

  it('an options change re-renders DiffSplit', async () => {
    const wrapper = mount(DiffSplit, { props: { oldText: 'A\nb\n', newText: 'a\nb\n' } })
    expect(wrapper.findAll('.diff-row-modified').length).toBe(1)
    await wrapper.setProps({ options: { ignoreCase: true } })
    expect(wrapper.find('.diff-empty').text()).toBe('No changes')
  })
})

describe('DiffStats', () => {
  const removed = (w: ReturnType<typeof mount>) => w.find('.diff-stat-removed .diff-sr').text()

  it('defaults to words mode', () => {
    // words: "cat" → "car" replaces the whole word; chars would count 1.
    expect(removed(mount(DiffStats, { props: { oldText: 'cat', newText: 'car' } }))).toBe('3 characters removed')
  })

  it('passes options to the diff', () => {
    expect(removed(mount(DiffStats, { props: { oldText: 'Hello', newText: 'hello', options: { ignoreCase: true } } }))).toBe('0 characters removed')
    const lines = mount(DiffStats, { props: { oldText: 'A\nb\n', newText: 'a\nb\n', mode: 'unified', options: { ignoreCase: true } } })
    expect(lines.find('.diff-stat-unchanged .diff-sr').text()).toBe('2 lines unchanged')
  })
})

describe('ids', () => {
  it('the default idPrefix is unique per instance', () => {
    const wrapper = mount({
      components: { DiffPlayback },
      template: '<div><DiffPlayback old-text="a" new-text="b" /><DiffPlayback old-text="a" new-text="b" /></div>',
    })
    const ids = wrapper.findAll('input').map((e) => e.attributes('id'))
    expect(ids[0]).toMatch(/^[A-Za-z][A-Za-z0-9_-]*-replay$/)
    expect(ids[0]).not.toBe(ids[1])
    expect(wrapper.findAll('label').map((e) => e.attributes('for'))).toEqual(ids)
  })

  it('timeline panels use "{idPrefix}-rev-K" for their own ids', () => {
    const wrapper = mount(DiffTimeline, { props: { versions: ['a', 'b', 'c'], idPrefix: 'doc', anchors: true } })
    expect(wrapper.findAll('input').map((e) => e.attributes('id'))).toEqual(['doc-rev-1', 'doc-rev-2'])
    expect(wrapper.findAll('[data-change-index]').map((e) => e.attributes('id'))).toEqual([
      'doc-rev-1-change-0', 'doc-rev-1-change-1', 'doc-rev-2-change-0', 'doc-rev-2-change-1',
    ])
  })
})

describe('minimap', () => {
  it('falls attributes through onto the wrapper', () => {
    const wrapper = mount(DiffWords, { props: { oldText: 'a', newText: 'b', minimap: true }, attrs: { class: 'mine', id: 'x' } })
    expect(wrapper.classes()).toEqual(['text-diff-with-minimap', 'mine'])
    expect(wrapper.attributes('id')).toBe('x')
    expect(wrapper.find('.text-diff').classes()).toEqual(['text-diff', 'text-diff-words'])
  })

  it('navigation still works inside the wrapper', () => {
    Element.prototype.scrollIntoView = vi.fn() as unknown as Element['scrollIntoView']
    const wrapper = mount(DiffUnified, { props: { oldText: 'a\nb\nc\n', newText: 'A\nb\nC\n', minimap: true } })
    expect(navOf(wrapper).next()).toBe(0)
    expect(wrapper.find('.is-current').classes()).toContain('diff-row-removed')
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })
})
