import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import DiffChars from '../components/DiffChars.vue'
import DiffWords from '../components/DiffWords.vue'
import DiffWordsWithSpace from '../components/DiffWordsWithSpace.vue'
import DiffLines from '../components/DiffLines.vue'
import DiffSentences from '../components/DiffSentences.vue'

describe('DiffChars', () => {
  it('renders with correct container class', () => {
    const wrapper = mount(DiffChars, {
      props: { oldText: 'hello', newText: 'hello' },
    })
    expect(wrapper.classes()).toContain('text-diff')
    expect(wrapper.classes()).toContain('text-diff-chars')
  })

  it('shows no diff spans for identical text', () => {
    const wrapper = mount(DiffChars, {
      props: { oldText: 'hello', newText: 'hello' },
    })
    expect(wrapper.findAll('.diff-added').length).toBe(0)
    expect(wrapper.findAll('.diff-removed').length).toBe(0)
    expect(wrapper.text()).toBe('hello')
  })

  it('highlights single character changes', () => {
    const wrapper = mount(DiffChars, {
      props: { oldText: 'cat', newText: 'car' },
    })
    expect(wrapper.findAll('.diff-removed').length).toBeGreaterThan(0)
    expect(wrapper.findAll('.diff-added').length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('ca')
  })

  it('handles empty old text', () => {
    const wrapper = mount(DiffChars, {
      props: { oldText: '', newText: 'new text' },
    })
    expect(wrapper.findAll('.diff-added').length).toBe(1)
    expect(wrapper.find('.diff-added').text()).toBe('new text')
  })

  it('handles empty new text', () => {
    const wrapper = mount(DiffChars, {
      props: { oldText: 'old text', newText: '' },
    })
    expect(wrapper.findAll('.diff-removed').length).toBe(1)
    expect(wrapper.find('.diff-removed').text()).toBe('old text')
  })
})

describe('DiffWords', () => {
  it('renders with correct container class', () => {
    const wrapper = mount(DiffWords, {
      props: { oldText: 'hello', newText: 'hello' },
    })
    expect(wrapper.classes()).toContain('text-diff')
    expect(wrapper.classes()).toContain('text-diff-words')
  })

  it('shows no diff spans for identical text', () => {
    const wrapper = mount(DiffWords, {
      props: { oldText: 'hello world', newText: 'hello world' },
    })
    expect(wrapper.findAll('.diff-added').length).toBe(0)
    expect(wrapper.findAll('.diff-removed').length).toBe(0)
  })

  it('highlights word-level changes', () => {
    const wrapper = mount(DiffWords, {
      props: {
        oldText: 'The quick brown fox',
        newText: 'The slow brown fox',
      },
    })
    const removed = wrapper.findAll('.diff-removed')
    const added = wrapper.findAll('.diff-added')
    expect(removed.length).toBeGreaterThan(0)
    expect(added.length).toBeGreaterThan(0)
    expect(removed[0].text()).toContain('quick')
    expect(added[0].text()).toContain('slow')
  })

  it('supports ignoreCase option', () => {
    const wrapper = mount(DiffWords, {
      props: {
        oldText: 'Hello World',
        newText: 'hello world',
        options: { ignoreCase: true },
      },
    })
    expect(wrapper.findAll('.diff-added').length).toBe(0)
    expect(wrapper.findAll('.diff-removed').length).toBe(0)
  })
})

describe('DiffWordsWithSpace', () => {
  it('renders with correct container class', () => {
    const wrapper = mount(DiffWordsWithSpace, {
      props: { oldText: 'hello', newText: 'hello' },
    })
    expect(wrapper.classes()).toContain('text-diff')
    expect(wrapper.classes()).toContain('text-diff-words-with-space')
  })

  it('shows no diff for identical text', () => {
    const wrapper = mount(DiffWordsWithSpace, {
      props: { oldText: 'hello world', newText: 'hello world' },
    })
    expect(wrapper.findAll('.diff-added').length).toBe(0)
    expect(wrapper.findAll('.diff-removed').length).toBe(0)
  })

  it('detects whitespace differences', () => {
    const wrapper = mount(DiffWordsWithSpace, {
      props: {
        oldText: 'hello    world',
        newText: 'hello world',
      },
    })
    const removed = wrapper.findAll('.diff-removed')
    const added = wrapper.findAll('.diff-added')
    expect(removed.length).toBeGreaterThan(0)
    expect(added.length).toBeGreaterThan(0)
  })

  it('handles both texts empty', () => {
    const wrapper = mount(DiffWordsWithSpace, {
      props: { oldText: '', newText: '' },
    })
    expect(wrapper.findAll('.diff-added').length).toBe(0)
    expect(wrapper.findAll('.diff-removed').length).toBe(0)
  })
})

describe('DiffLines', () => {
  it('renders with correct container class', () => {
    const wrapper = mount(DiffLines, {
      props: { oldText: 'hello', newText: 'hello' },
    })
    expect(wrapper.classes()).toContain('text-diff')
    expect(wrapper.classes()).toContain('text-diff-lines')
  })

  it('shows no diff for identical text', () => {
    const wrapper = mount(DiffLines, {
      props: { oldText: 'line one\nline two', newText: 'line one\nline two' },
    })
    expect(wrapper.findAll('.diff-added').length).toBe(0)
    expect(wrapper.findAll('.diff-removed').length).toBe(0)
  })

  it('highlights entire changed lines', () => {
    const wrapper = mount(DiffLines, {
      props: {
        oldText: 'line one\nline two\nline three',
        newText: 'line one\nline modified\nline three',
      },
    })
    const removed = wrapper.findAll('.diff-removed')
    const added = wrapper.findAll('.diff-added')
    expect(removed.length).toBeGreaterThan(0)
    expect(added.length).toBeGreaterThan(0)
    expect(removed[0].text()).toContain('line two')
    expect(added[0].text()).toContain('line modified')
  })

  it('detects added lines', () => {
    const wrapper = mount(DiffLines, {
      props: {
        oldText: 'line one\nline two',
        newText: 'line one\nline two\nline three',
      },
    })
    expect(wrapper.findAll('.diff-added').length).toBeGreaterThan(0)
  })
})

describe('DiffSentences', () => {
  it('renders with correct container class', () => {
    const wrapper = mount(DiffSentences, {
      props: { oldText: 'Hello.', newText: 'Hello.' },
    })
    expect(wrapper.classes()).toContain('text-diff')
    expect(wrapper.classes()).toContain('text-diff-sentences')
  })

  it('shows no diff for identical text', () => {
    const wrapper = mount(DiffSentences, {
      props: {
        oldText: 'First sentence. Second sentence.',
        newText: 'First sentence. Second sentence.',
      },
    })
    expect(wrapper.findAll('.diff-added').length).toBe(0)
    expect(wrapper.findAll('.diff-removed').length).toBe(0)
  })

  it('highlights changed sentences', () => {
    const wrapper = mount(DiffSentences, {
      props: {
        oldText: 'I like cats. Dogs are okay.',
        newText: 'I like cats. Birds are great.',
      },
    })
    const removed = wrapper.findAll('.diff-removed')
    const added = wrapper.findAll('.diff-added')
    expect(removed.length).toBeGreaterThan(0)
    expect(added.length).toBeGreaterThan(0)
  })

  it('handles both texts empty', () => {
    const wrapper = mount(DiffSentences, {
      props: { oldText: '', newText: '' },
    })
    expect(wrapper.findAll('.diff-added').length).toBe(0)
    expect(wrapper.findAll('.diff-removed').length).toBe(0)
  })
})
