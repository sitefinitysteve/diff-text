import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { act, fireEvent, render } from '@testing-library/react'
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
import type { DiffNavigation } from '../index'

const numbered = (n: number, change: (i: number) => string | null = () => null) =>
  Array.from({ length: n }, (_, k) => change(k + 1) ?? `line ${k + 1}`).join('\n') + '\n'

const OLD_20 = numbered(20)
const NEW_20 = numbered(20, (i) => (i === 10 ? 'line ten' : null))

const texts = (root: Element, selector: string) => Array.from(root.querySelectorAll(selector)).map((e) => e.textContent)

describe('collapsed rows', () => {
  for (const [name, Component] of [['DiffUnified', DiffUnified], ['DiffSplit', DiffSplit]] as const) {
    it(`${name}: collapsed rows are buttons that expand in place`, () => {
      const { container } = render(<Component oldText={OLD_20} newText={NEW_20} />)
      const root = container.firstElementChild as HTMLElement
      const buttons = root.querySelectorAll('button.diff-row-collapsed')
      expect(texts(root, 'button.diff-row-collapsed')).toEqual(['6 unchanged lines', '7 unchanged lines'])
      expect(buttons[0].getAttribute('type')).toBe('button')
      const rowsBefore = root.querySelectorAll('.diff-row').length

      fireEvent.click(buttons[0])

      expect(texts(root, 'button.diff-row-collapsed')).toEqual(['7 unchanged lines'])
      // the button is replaced by its 6 hidden rows
      expect(root.querySelectorAll('.diff-row').length).toBe(rowsBefore - 1 + 6)
      const first = root.querySelector('.diff-row') as HTMLElement
      expect(first.classList).toContain('diff-row-equal')
      expect(first.querySelector('.diff-gutter')?.textContent).toBe('1')
      expect(first.querySelector('.diff-line')?.textContent).toBe('line 1')
      // change indices are unchanged by expansion
      expect(Array.from(root.querySelectorAll('[data-change-index]')).map((e) => e.getAttribute('data-change-index'))).toEqual(['0'])
    })

    it(`${name}: expansion state resets when the inputs change`, () => {
      const { container, rerender } = render(<Component oldText={OLD_20} newText={NEW_20} />)
      const root = container.firstElementChild as HTMLElement
      fireEvent.click(root.querySelector('button.diff-row-collapsed') as Element)
      expect(root.querySelectorAll('button.diff-row-collapsed').length).toBe(1)
      rerender(<Component oldText={OLD_20} newText={numbered(20, (i) => (i === 11 ? 'line eleven' : null))} />)
      expect(texts(root, 'button.diff-row-collapsed')).toEqual(['7 unchanged lines', '6 unchanged lines'])
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

  const current = (root: Element) =>
    Array.from(root.querySelectorAll('.is-current')).map((e) => e.getAttribute('data-change-index'))

  it('next() and prev() cycle through the changes and mark the current one', () => {
    const ref = createRef<DiffNavigation>()
    const { container } = render(<DiffWords ref={ref} oldText="one two three" newText="one 2 three 4" />)
    const root = container.firstElementChild as HTMLElement
    const nav = ref.current as DiffNavigation
    expect(nav.count).toBe(3)
    expect(current(root)).toEqual([])

    expect(nav.next()).toBe(0)
    expect(current(root)).toEqual(['0'])
    expect(nav.next()).toBe(1)
    expect(nav.next()).toBe(2)
    expect(nav.next()).toBe(0) // wraps
    expect(current(root)).toEqual(['0'])
    expect(nav.prev()).toBe(2) // wraps backwards
    expect(current(root)).toEqual(['2'])
    expect(nav.goTo(4)).toBe(1) // wrapped into range
    expect(current(root)).toEqual(['1'])
    expect(scroll).toHaveBeenCalledTimes(6)
    // The highlight comes from the .is-current rule in style.css, not from inline styles.
    expect(root.querySelector('.is-current')?.getAttribute('style')).toBeNull()
  })

  it('prev() from the start goes to the last change', () => {
    const ref = createRef<DiffNavigation>()
    render(<DiffChars ref={ref} oldText="abc" newText="xbz" />)
    expect(ref.current?.count).toBe(4)
    expect(ref.current?.prev()).toBe(3)
  })

  it('returns -1 and does nothing when there are no changes', () => {
    const ref = createRef<DiffNavigation>()
    render(<DiffChars ref={ref} oldText="same" newText="same" />)
    expect(ref.current?.count).toBe(0)
    expect(ref.current?.next()).toBe(-1)
    expect(ref.current?.prev()).toBe(-1)
    expect(scroll).not.toHaveBeenCalled()
  })

  it('counts changes in DiffHtml (incl. full replacement) and in the line views by run', () => {
    const refs = Array.from({ length: 4 }, () => createRef<DiffNavigation>())
    render(<DiffHtml ref={refs[0]} oldText="<p>a b</p>" newText="<p>a c</p>" />)
    render(<DiffHtml ref={refs[1]} oldText="abc" newText="xyz" similarityThreshold={0.5} />)
    render(<DiffUnified ref={refs[2]} oldText={'a\nb\nc\n'} newText={'A\nb\nC\n'} />)
    render(<DiffSplit ref={refs[3]} oldText={'a\nb\nc\n'} newText={'A\nb\nC\n'} />)
    expect(refs.map((r) => r.current?.count)).toEqual([2, 2, 2, 2])
  })

  it('navigates line views by change run', () => {
    const ref = createRef<DiffNavigation>()
    const { container } = render(<DiffUnified ref={ref} oldText={'a\nb\nc\n'} newText={'A\nb\nC\n'} />)
    ref.current?.next()
    ref.current?.next()
    const marked = container.querySelectorAll('.is-current')
    expect(marked.length).toBe(1)
    expect(marked[0].classList).toContain('diff-row-removed')
    expect(marked[0].querySelector('.diff-line')?.textContent).toBe('c')
  })

  it('clears the current change when the inputs change', () => {
    const ref = createRef<DiffNavigation>()
    const { container, rerender } = render(<DiffWords ref={ref} oldText="one two" newText="one 2" />)
    const root = container.firstElementChild as HTMLElement
    act(() => {
      ref.current?.next()
    })
    expect(current(root)).toEqual(['0'])
    rerender(<DiffWords ref={ref} oldText="one two" newText="one 3" />)
    expect(current(root)).toEqual([])
    expect(ref.current?.next()).toBe(0)
  })
})

describe('reactivity', () => {
  it('text components re-render when props change', () => {
    const { container, rerender } = render(<DiffChars oldText="a" newText="a" />)
    expect(container.querySelectorAll('.diff-added').length).toBe(0)
    rerender(<DiffChars oldText="a" newText="ab" />)
    expect(container.querySelector('.diff-added')?.textContent).toBe('b')
  })

  it('DiffHtml re-renders when props change', () => {
    const { container, rerender } = render(<DiffHtml oldText="<p>a</p>" newText="<p>a</p>" />)
    expect(container.querySelectorAll('.diff-added').length).toBe(0)
    rerender(<DiffHtml oldText="<p>a</p>" newText="<p>a b</p>" />)
    expect(container.querySelector('.diff-added')?.textContent).toContain('b')
  })

  it('DiffUnified re-renders when contextLines changes', () => {
    const { container, rerender } = render(<DiffUnified oldText={OLD_20} newText={NEW_20} />)
    expect(container.querySelectorAll('.diff-row-equal').length).toBe(6)
    rerender(<DiffUnified oldText={OLD_20} newText={NEW_20} contextLines={0} />)
    expect(container.querySelectorAll('.diff-row-equal').length).toBe(0)
  })

  it('DiffStats re-renders when mode changes', () => {
    const { container, rerender } = render(<DiffStats oldText={'a\nb\n'} newText={'a\nc\n'} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.getAttribute('data-unit')).toBe('codepoints')
    rerender(<DiffStats oldText={'a\nb\n'} newText={'a\nc\n'} mode="unified" />)
    expect(root.getAttribute('data-unit')).toBe('lines')
    expect(root.querySelector('.diff-stat-added .diff-sr')?.textContent).toBe('1 line added')
  })
})

describe('1.6.0 contract', () => {
  it('numbers added and removed spans with data-change-index', () => {
    const { container } = render(<DiffWords oldText="foo bar baz" newText="foo qux baz" />)
    expect(container.innerHTML).toBe(
      '<div class="text-diff text-diff-words"><span>foo </span><span class="diff-removed" data-change-index="0">bar</span><span class="diff-added" data-change-index="1">qux</span><span> baz</span></div>',
    )
  })

  it('DiffWordsWithSpace (and TextDiff) use the text-diff-words-with-space container', () => {
    expect(TextDiff).toBe(DiffWordsWithSpace)
    const { container } = render(<TextDiff oldText="a" newText="b" />)
    expect(Array.from((container.firstElementChild as Element).classList)).toEqual(['text-diff', 'text-diff-words-with-space'])
  })

  it('DiffHtml full replacement uses block-level divs', () => {
    const { container } = render(<DiffHtml oldText="<b>alpha</b>" newText="zeta" similarityThreshold={1} />)
    expect(container.innerHTML).toBe(
      '<div class="text-diff text-diff-html"><div class="diff-removed" data-change-index="0"><b>alpha</b></div><div class="diff-added" data-change-index="1">zeta</div></div>',
    )
  })

  it('passes className and other div props through to the container of every component', () => {
    const cases = [
      <DiffChars key="c" oldText="a" newText="b" className="mine" id="x" />,
      <DiffHtml key="h" oldText="a" newText="b" className="mine" id="x" />,
      <DiffUnified key="u" oldText="a" newText="b" className="mine" id="x" />,
      <DiffSplit key="s" oldText="a" newText="b" className="mine" id="x" />,
      <DiffStats key="t" oldText="a" newText="b" className="mine" id="x" />,
    ]
    for (const element of cases) {
      const { container, unmount } = render(element)
      const root = container.firstElementChild as HTMLElement
      expect(root.classList).toContain('mine')
      expect(root.id).toBe('x')
      unmount()
    }
    const { container } = render(<DiffUnified oldText="a" newText="b" className="mine" />)
    expect((container.firstElementChild as Element).className).toBe('text-diff text-diff-unified mine')
  })

  it('forwards data-* and style onto the container', () => {
    const { container } = render(<DiffChars oldText="a" newText="b" data-testid="d" style={{ color: 'red' }} />)
    const root = container.firstElementChild as HTMLElement
    expect(root.dataset.testid).toBe('d')
    expect(root.style.color).toBe('red')
  })
})

const scrollStub = () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn() as unknown as Element['scrollIntoView']
  })
  afterEach(() => {
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })
}
const currentOf = (root: Element) => Array.from(root.querySelectorAll('.is-current')).map((e) => e.getAttribute('data-change-index'))

// Bug: expanded blocks and the current change were keyed on the model object, which is rebuilt
// whenever the parent re-renders with a new (but equal) inline options object.
describe('UI state survives an unrelated parent re-render', () => {
  scrollStub()

  for (const [name, Component] of [['DiffUnified', DiffUnified], ['DiffSplit', DiffSplit]] as const) {
    it(`${name}: expanded blocks and the current change are kept for an equal options object`, () => {
      const ref = createRef<DiffNavigation>()
      const { container, rerender } = render(<Component ref={ref} oldText={OLD_20} newText={NEW_20} options={{ ignoreCase: false }} />)
      const root = container.firstElementChild as HTMLElement
      fireEvent.click(root.querySelector('button.diff-row-collapsed') as Element)
      act(() => {
        ref.current?.next()
      })
      rerender(<Component ref={ref} oldText={OLD_20} newText={NEW_20} options={{ ignoreCase: false }} />)
      expect(texts(root, 'button.diff-row-collapsed')).toEqual(['7 unchanged lines'])
      expect(currentOf(root)).toEqual(['0'])
    })
  }

  it('text components keep the current change for an equal options object', () => {
    const ref = createRef<DiffNavigation>()
    const { container, rerender } = render(<DiffWords ref={ref} oldText="one two three" newText="one 2 three" options={{}} />)
    act(() => {
      ref.current?.next()
    })
    rerender(<DiffWords ref={ref} oldText="one two three" newText="one 2 three" options={{}} />)
    expect(currentOf(container)).toEqual(['0'])
  })
})

describe('ref.count is live', () => {
  it('follows re-renders, including a drop to 0', () => {
    const ref = createRef<DiffNavigation>()
    const { rerender } = render(<DiffWords ref={ref} oldText="one two three" newText="one 2 three 4" />)
    const handle = ref.current as DiffNavigation
    expect(handle.count).toBe(3)
    rerender(<DiffWords ref={ref} oldText="one two three" newText="one two three 4" />)
    expect(handle.count).toBe(1)
    expect(ref.current?.count).toBe(1)
    rerender(<DiffWords ref={ref} oldText="one two three" newText="one two three" />)
    expect(handle.count).toBe(0)
    expect(ref.current?.next()).toBe(-1)
  })

  it('follows line-view re-renders', () => {
    const ref = createRef<DiffNavigation>()
    const { rerender } = render(<DiffUnified ref={ref} oldText={'a\nb\nc\n'} newText={'A\nb\nC\n'} />)
    expect(ref.current?.count).toBe(2)
    rerender(<DiffUnified ref={ref} oldText={'a\nb\nc\n'} newText={'a\nb\nc\n'} />)
    expect(ref.current?.count).toBe(0)
  })
})

// Sentence 2 replaced: the default orphanMatchThreshold (0.3) gives one removed + one added
// run; 0 keeps the orphan matches and interleaves four pairs.
const ORPHAN_OLD = 'The quick brown fox jumps over the lazy dog. Each party acknowledges that any term of this agreement will be interpreted accordingly.'
const ORPHAN_NEW = 'The quick brown fox jumps over the lazy dog. Test writing new content.'

describe('options reach the engine', () => {
  it('DiffHtml forwards options to the HTML engine', () => {
    const refs = [createRef<DiffNavigation>(), createRef<DiffNavigation>()]
    render(<DiffHtml ref={refs[0]} oldText={ORPHAN_OLD} newText={ORPHAN_NEW} />)
    const { container } = render(<DiffHtml ref={refs[1]} oldText={ORPHAN_OLD} newText={ORPHAN_NEW} options={{ orphanMatchThreshold: 0 }} />)
    expect(refs.map((r) => r.current?.count)).toEqual([2, 8])
    expect(texts(container, '.diff-added')).toEqual(['Test', 'writing', 'new', 'content'])
    const caseRef = createRef<DiffNavigation>()
    render(<DiffHtml ref={caseRef} oldText="<p>Hello</p>" newText="<p>hello</p>" options={{ ignoreCase: true }} />)
    expect(caseRef.current?.count).toBe(0)
  })

  it('DiffHtml leaves full replacement off by default (similarityThreshold null)', () => {
    const { container } = render(<DiffHtml oldText="Completely different text here with many words." newText="XYZ 123 ABC." />)
    expect(container.querySelector('div.diff-removed')).toBeNull()
  })

  it('an options change re-renders the text components', () => {
    const ref = createRef<DiffNavigation>()
    const { container, rerender } = render(<DiffChars ref={ref} oldText="Abc" newText="abc" />)
    expect(ref.current?.count).toBe(2)
    rerender(<DiffChars ref={ref} oldText="Abc" newText="abc" options={{ ignoreCase: true }} />)
    expect(ref.current?.count).toBe(0)
    expect(container.textContent).toBe('abc')
  })

  it('an options change re-renders DiffHtml', () => {
    const ref = createRef<DiffNavigation>()
    const { rerender } = render(<DiffHtml ref={ref} oldText={ORPHAN_OLD} newText={ORPHAN_NEW} />)
    rerender(<DiffHtml ref={ref} oldText={ORPHAN_OLD} newText={ORPHAN_NEW} options={{ orphanMatchThreshold: 0 }} />)
    expect(ref.current?.count).toBe(8)
  })

  it('an options change re-renders DiffSplit', () => {
    const { container, rerender } = render(<DiffSplit oldText={'A\nb\n'} newText={'a\nb\n'} />)
    expect(container.querySelectorAll('.diff-row-modified').length).toBe(1)
    rerender(<DiffSplit oldText={'A\nb\n'} newText={'a\nb\n'} options={{ ignoreCase: true }} />)
    expect(container.querySelector('.diff-empty')?.textContent).toBe('No changes')
  })
})

describe('DiffStats', () => {
  const removed = (root: Element) => root.querySelector('.diff-stat-removed .diff-sr')?.textContent

  it('defaults to words mode', () => {
    // words: "cat" → "car" replaces the whole word; chars would count 1.
    expect(removed(render(<DiffStats oldText="cat" newText="car" />).container)).toBe('3 characters removed')
  })

  it('passes options to the diff', () => {
    expect(removed(render(<DiffStats oldText="Hello" newText="hello" options={{ ignoreCase: true }} />).container)).toBe('0 characters removed')
    const { container } = render(<DiffStats oldText={'A\nb\n'} newText={'a\nb\n'} mode="unified" options={{ ignoreCase: true }} />)
    expect(container.querySelector('.diff-stat-unchanged .diff-sr')?.textContent).toBe('2 lines unchanged')
  })
})

describe('ids', () => {
  it('the default idPrefix is unique per instance', () => {
    const { container } = render(
      <div>
        <DiffPlayback oldText="a" newText="b" />
        <DiffPlayback oldText="a" newText="b" />
      </div>,
    )
    const ids = Array.from(container.querySelectorAll('input')).map((e) => e.id)
    expect(ids[0]).toMatch(/^[A-Za-z][A-Za-z0-9_-]*-replay$/)
    expect(ids[0]).not.toBe(ids[1])
    expect(Array.from(container.querySelectorAll('label')).map((e) => e.htmlFor)).toEqual(ids)
  })

  it('timeline panels use "{idPrefix}-rev-K" for their own ids', () => {
    const { container } = render(<DiffTimeline versions={['a', 'b', 'c']} idPrefix="doc" anchors />)
    expect(Array.from(container.querySelectorAll('input')).map((e) => e.id)).toEqual(['doc-rev-1', 'doc-rev-2'])
    expect(Array.from(container.querySelectorAll('[data-change-index]')).map((e) => e.id)).toEqual([
      'doc-rev-1-change-0', 'doc-rev-1-change-1', 'doc-rev-2-change-0', 'doc-rev-2-change-1',
    ])
  })
})

describe('minimap', () => {
  it('passes className and other div props onto the wrapper', () => {
    const { container } = render(<DiffWords oldText="a" newText="b" minimap className="mine" id="x" />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toBe('text-diff-with-minimap mine')
    expect(root.id).toBe('x')
    expect(root.querySelector('.text-diff')?.className).toBe('text-diff text-diff-words')
  })

  it('navigation still works inside the wrapper', () => {
    Element.prototype.scrollIntoView = vi.fn() as unknown as Element['scrollIntoView']
    const ref = createRef<DiffNavigation>()
    const { container } = render(<DiffUnified ref={ref} oldText={'a\nb\nc\n'} newText={'A\nb\nC\n'} minimap />)
    act(() => {
      expect(ref.current?.next()).toBe(0)
    })
    expect(container.querySelector('.is-current')?.classList).toContain('diff-row-removed')
    delete (Element.prototype as Partial<Element>).scrollIntoView
  })
})
