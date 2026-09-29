/**
 * Fixture parity: every case in fixtures/*.json (all 15 groups) is mounted with the
 * matching component and its live DOM is compared STRUCTURALLY with expected.html
 * (tags, class sets, attributes, text). This file is byte-identical in packages/vue and
 * packages/react; only the mount function (passed to runFixtureParity) differs.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

export type FixtureGroup =
  | 'chars'
  | 'words'
  | 'wordsWithSpace'
  | 'lines'
  | 'sentences'
  | 'html'
  | 'split'
  | 'unified'
  | 'stats'
  | 'similarity'
  | 'heatmap'
  | 'moves'
  | 'minimap'
  | 'timeline'
  | 'playback';

export const FIXTURE_GROUPS: readonly FixtureGroup[] = [
  'chars',
  'words',
  'wordsWithSpace',
  'lines',
  'sentences',
  'html',
  'split',
  'unified',
  'stats',
  'similarity',
  'heatmap',
  'moves',
  'minimap',
  'timeline',
  'playback',
];

export interface Fixture {
  name: string;
  old: string;
  new: string;
  /** timeline cases only (instead of old/new). */
  versions?: string[];
  options: Record<string, unknown>;
  expected: Record<string, unknown>;
}

/** Which component to mount. Text modes use their own component (DiffChars, ...). */
export type MountKind =
  | 'chars'
  | 'words'
  | 'wordsWithSpace'
  | 'lines'
  | 'sentences'
  | 'html'
  | 'split'
  | 'unified'
  | 'stats'
  | 'heatmap'
  | 'timeline'
  | 'playback';

/** Framework-neutral props; each package maps them onto its components. */
export interface MountProps {
  oldText?: string;
  newText?: string;
  options?: Record<string, unknown>;
  contextLines?: number;
  similarityThreshold?: number | null;
  ignoreFormattingTags?: boolean;
  mode?: string;
  showSimilarity?: boolean;
  anchors?: boolean;
  idPrefix?: string;
  minimap?: boolean;
  detectMoves?: boolean;
  minMoveLines?: number;
  moveSimilarity?: number;
  showRemoved?: boolean;
  legend?: boolean;
  versions?: string[];
  labels?: string[];
  speed?: unknown;
}

/** A mounted component: its root element (live DOM) and a cleanup function. */
export interface Mounted {
  element: Element;
  unmount(): void;
}

export type MountFn = (kind: MountKind, props: MountProps) => Mounted;

/** A mount case for one fixture: the component and its props. */
export interface MountCase {
  kind: MountKind;
  props: MountProps;
  /** The expected canonical HTML. */
  html: string;
}

// fixtures/ at the monorepo root (this file is packages/<pkg>/src/__tests__/fixtureParity.ts).
const FIXTURES_DIR = resolve(__dirname, '../../../../fixtures');

export function loadFixtures(group: FixtureGroup): Fixture[] {
  return JSON.parse(readFileSync(resolve(FIXTURES_DIR, `${group}.json`), 'utf8')) as Fixture[];
}

// ---------------------------------------------------------------------------
// Structural comparison
// ---------------------------------------------------------------------------

export interface NormalNode {
  tag: string;
  classes: string[];
  attrs: Record<string, string>;
  children: Array<NormalNode | string>;
}

/**
 * A style attribute as the CSSOM serializes it. Frameworks write styles through the
 * CSSOM (React always, Vue for :style), which reformats the declarations
 * ("top:12.50%" becomes "top: 12.5%;"), so both sides go through the same serializer.
 */
function normalizeStyle(value: string): string {
  const el = document.createElement('div');
  el.setAttribute('style', value);
  return el.style.cssText;
}

/**
 * Normalize an element tree:
 * - comment nodes are dropped and adjacent text is merged (empty text dropped);
 * - class is compared as a sorted set;
 * - style is compared after CSSOM serialization (see normalizeStyle);
 * - `button[type=button].diff-row-collapsed` is treated as `div.diff-row-collapsed`
 *   (SPEC 13 allows the interactive button; a button without type="button" is not equivalent).
 * Text is compared exactly, so a CR left in rendered text is a difference.
 */
export function normalizeElement(el: Element): NormalNode {
  const classes = Array.from(el.classList).sort();
  let tag = el.tagName.toLowerCase();
  const attrs: Record<string, string> = {};
  for (const a of Array.from(el.attributes)) {
    if (a.name === 'class') continue;
    attrs[a.name] = a.name === 'style' ? normalizeStyle(a.value) : a.value;
  }
  if (tag === 'button' && classes.includes('diff-row-collapsed') && attrs.type === 'button') {
    tag = 'div';
    delete attrs.type;
  }
  const children: Array<NormalNode | string> = [];
  let text = '';
  const flush = () => {
    if (text !== '') children.push(text);
    text = '';
  };
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) text += node.nodeValue ?? '';
    else if (node.nodeType === 1) {
      flush();
      children.push(normalizeElement(node as Element));
    }
    // comments and anything else are ignored
  }
  flush();
  return { tag, classes, attrs, children };
}

/** Parse an HTML fragment that must contain exactly one root element, and normalize it. */
export function parseAndNormalize(html: string): NormalNode {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const roots = Array.from(doc.body.childNodes).filter((n) => n.nodeType !== 8);
  if (roots.length !== 1 || roots[0]!.nodeType !== 1) {
    throw new Error(`expected exactly one root element, got ${roots.length} nodes in: ${html.slice(0, 200)}`);
  }
  return normalizeElement(roots[0] as Element);
}

/** Compare a live element with canonical HTML. */
export function expectSameDom(actual: Element | string, expectedHtml: string): void {
  const got = typeof actual === 'string' ? parseAndNormalize(actual) : normalizeElement(actual);
  expect(got).toEqual(parseAndNormalize(expectedHtml));
}

// ---------------------------------------------------------------------------
// Fixture → component props
// ---------------------------------------------------------------------------

const TEXT_GROUPS = ['chars', 'words', 'wordsWithSpace', 'lines', 'sentences'] as const;
const isTextMode = (v: unknown): v is (typeof TEXT_GROUPS)[number] => (TEXT_GROUPS as readonly unknown[]).includes(v);

/** Split line-view options into component props. */
function lineProps(options: Record<string, unknown>): MountProps {
  const { contextLines, detectMoves, minMoveLines, moveSimilarity, idPrefix, anchors, ...rest } = options;
  return {
    contextLines: contextLines as number | undefined,
    detectMoves: detectMoves as boolean | undefined,
    minMoveLines: minMoveLines as number | undefined,
    moveSimilarity: moveSimilarity as number | undefined,
    idPrefix: idPrefix as string | undefined,
    anchors: anchors as boolean | undefined,
    options: rest,
  };
}

/**
 * The component and props that must render a fixture's expected.html. Components default
 * idPrefix to a per-instance id, so cases that rely on core's default pass "td" explicitly.
 */
export function mountCases(group: FixtureGroup, f: Fixture): MountCase[] {
  const texts = { oldText: f.old, newText: f.new };
  const html = f.expected.html as string;
  switch (group) {
    case 'chars':
    case 'words':
    case 'wordsWithSpace':
    case 'lines':
    case 'sentences':
      return [{ kind: group, props: { ...texts, options: f.options }, html }];
    case 'html': {
      const { similarityThreshold, ignoreFormattingTags, ...options } = f.options;
      const props: MountProps = { ...texts, options };
      if (similarityThreshold !== undefined) props.similarityThreshold = similarityThreshold as number;
      if (ignoreFormattingTags !== undefined) props.ignoreFormattingTags = ignoreFormattingTags as boolean;
      return [{ kind: 'html', props, html }];
    }
    case 'unified':
    case 'split':
      return [{ kind: group, props: { ...texts, ...lineProps(f.options) }, html }];
    case 'stats': {
      const base: MountProps = { ...texts, mode: f.options.mode as string };
      return [
        { kind: 'stats', props: base, html },
        { kind: 'stats', props: { ...base, showSimilarity: false }, html: f.expected.htmlWithoutSimilarity as string },
      ];
    }
    case 'similarity':
      // DiffStats' default mode is words, which is what the similarity fixtures render.
      return [{ kind: 'stats', props: texts, html }];
    case 'heatmap': {
      const { showRemoved, legend, anchors, idPrefix, ...options } = f.options;
      return [
        {
          kind: 'heatmap',
          props: {
            ...texts,
            options,
            showRemoved: showRemoved as boolean | undefined,
            legend: legend as boolean | undefined,
            anchors: anchors as boolean | undefined,
            idPrefix: (idPrefix as string | undefined) ?? 'td',
          },
          html,
        },
      ];
    }
    case 'moves': {
      const { view, ...options } = f.options;
      return [{ kind: view as 'unified' | 'split', props: { ...texts, ...lineProps(options) }, html }];
    }
    case 'minimap': {
      // minimap implies anchors, so the fixture's anchors: true is not passed on.
      const { view, idPrefix, ...options } = f.options;
      delete options.anchors;
      const props: MountProps = isTextMode(view) ? { ...texts, options } : { ...texts, ...lineProps(options) };
      return [{ kind: view as MountKind, props: { ...props, idPrefix: idPrefix as string, minimap: true }, html }];
    }
    case 'timeline': {
      const { mode, labels, idPrefix, anchors, ...options } = f.options;
      return [
        {
          kind: 'timeline',
          props: {
            versions: f.versions,
            mode: mode as string | undefined,
            labels: labels as string[] | undefined,
            idPrefix: (idPrefix as string | undefined) ?? 'td',
            anchors: anchors as boolean | undefined,
            options,
          },
          html,
        },
      ];
    }
    case 'playback': {
      const { mode, speed, idPrefix, anchors } = f.options;
      return [
        {
          kind: 'playback',
          props: {
            ...texts,
            mode: mode as string,
            speed,
            idPrefix: (idPrefix as string | undefined) ?? 'td',
            anchors: anchors as boolean | undefined,
          },
          html,
        },
      ];
    }
  }
}

/** Drop undefined props so component defaults apply. */
export function definedProps(props: MountProps): Record<string, unknown> {
  return Object.fromEntries(Object.entries(props).filter(([, v]) => v !== undefined));
}

// ---------------------------------------------------------------------------
// The suite
// ---------------------------------------------------------------------------

export function runFixtureParity(mount: MountFn): void {
  describe('structural comparator', () => {
    it('ignores class order, comments and style serialization', () => {
      expectSameDom(
        '<div class="b a"><!--x--><span>t</span><span class="diff-added" style="top: 12.5%; height: 0%;" data-change-index="0">u</span></div>',
        '<div class="a b"><span>t</span><span class="diff-added" style="top:12.50%;height:0.00%" data-change-index="0">u</span></div>',
      );
    });
    it('treats button[type=button].diff-row-collapsed as div.diff-row-collapsed, and nothing else', () => {
      expectSameDom(
        '<button type="button" class="diff-row diff-row-collapsed">2 unchanged lines</button>',
        '<div class="diff-row diff-row-collapsed">2 unchanged lines</div>',
      );
      expect(() =>
        expectSameDom('<button class="diff-row diff-row-collapsed">2 unchanged lines</button>', '<div class="diff-row diff-row-collapsed">2 unchanged lines</div>'),
      ).toThrow();
    });
    it('requires exactly one root element in the expected markup', () => {
      expect(() => expectSameDom('<div>a</div>', '<div>a</div><div>b</div>')).toThrow(/exactly one root/);
      expect(() => expectSameDom('<div>a</div>', '<div>a</div>b')).toThrow(/exactly one root/);
    });
    it('detects differences in text, tags, classes, attributes, style and line terminators', () => {
      const base = '<div class="x"><span aria-label="added line 1" data-change-index="0">a </span></div>';
      const same = (html: string) => () => expectSameDom(html, base);
      expect(same('<div class="x"><span aria-label="added line 1" data-change-index="0">a</span></div>')).toThrow();
      expect(same('<div class="x"><em aria-label="added line 1" data-change-index="0">a </em></div>')).toThrow();
      expect(same('<div class="y"><span aria-label="added line 1" data-change-index="0">a </span></div>')).toThrow();
      expect(same('<div class="x"><span aria-label="added line 1" data-change-index="1">a </span></div>')).toThrow();
      expect(same('<div class="x"><span aria-label="added line 1">a </span></div>')).toThrow();
      expect(same('<div class="x"><span aria-label="added line 2" data-change-index="0">a </span></div>')).toThrow();
      expect(same('<div class="x"><span data-change-index="0">a </span></div>')).toThrow();
      expect(same('<div class="x"><span aria-label="added line 1" data-change-index="0" style="color: red;">a </span></div>')).toThrow();
      const el = document.createElement('div');
      el.textContent = 'a\r\nb';
      expect(() => expectSameDom(el, '<div>a\nb</div>')).toThrow();
    });
  });

  describe('fixture parity', () => {
    for (const group of FIXTURE_GROUPS) {
      describe(group, () => {
        for (const f of loadFixtures(group)) {
          it(f.name, () => {
            for (const c of mountCases(group, f)) {
              const mounted = mount(c.kind, c.props);
              try {
                expectSameDom(mounted.element, c.html);
              } finally {
                mounted.unmount();
              }
            }
          });
        }
      });
    }
  });
}
