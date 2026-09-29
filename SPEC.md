# diff-text behavior contract (SPEC)

This document is the contract that **vue-diff-text**, **react-diff-text**, and **php-diff-text** follow.
The reference implementation is `packages/core` (TypeScript, private workspace package `@diff-text/core`).
The canonical fixtures in `fixtures/*.json` are generated from core (`npm run fixtures`) and are the
executable form of this document. When this text and the fixtures disagree, the fixtures win and this
document has a bug.

A PHP developer should be able to port everything here without reading any JavaScript.

Contents

1. Terminology and string model
2. The Change shape
3. Options per mode
4. The diff algorithm (Myers, jsdiff v8 variant), exactly
5. Tokenizers and equality, per mode
6. diffWords whitespace post-processing
7. Core post-processing (empty values, maxEditLength)
8. Similarity
9. Line model: rows, hunks, collapsing
10. Split model: pairing and intra-line diffs
11. Stats
12. HTML diff
13. Canonical markup (every view)
14. CSS contract
15. Fixture format and how to test against it
16. Platform notes
17. Visualizations: shared rules
18. Element ids (idPrefix) and change anchors
19. Moved blocks (unified, split)
20. Rewrite heatmap
21. Change minimap
22. Revision timeline
23. Animated playback
24. Testing: what each layer proves

---

## 1. Terminology and string model

- **Code point**: one Unicode scalar value. All lengths in this spec are counted in code points
  (JS `[...s].length`, PHP `mb_strlen($s, 'UTF-8')`). An emoji such as U+1F600 is 1; a flag or a ZWJ
  family is several; `e` + U+0301 (combining acute) is 2.
- **Whitespace** (written `WS` below) is exactly the JavaScript `\s` set, which is also the set that
  JavaScript `String.prototype.trim()` removes:

  ```
  U+0009 U+000A U+000B U+000C U+000D U+0020 U+00A0 U+1680 U+2000–U+200A
  U+2028 U+2029 U+202F U+205F U+3000 U+FEFF
  ```

  PHP: PCRE's `\s` does **not** match this set (even with `/u` it misses U+00A0, U+3000, ...), and PHP's
  `trim()` strips `\0` which JS does not. Use an explicit class:
  `[\x{0009}-\x{000D}\x{0020}\x{00A0}\x{1680}\x{2000}-\x{200A}\x{2028}\x{2029}\x{202F}\x{205F}\x{3000}\x{FEFF}]`
  with the `u` modifier, and implement `trim` as removing leading/trailing runs of that class.
- **lowercase(s)**: exactly JavaScript's `String.prototype.toLowerCase()`: the full Unicode
  lowercase mapping (so `İ` → `i̇`, two code points), locale-independent, with the Final_Sigma
  rule (`ΣΟΦΟΣ` → `σοφος`: a capital sigma preceded by a cased letter and not followed by one,
  skipping case-ignorable characters both ways, becomes `ς`; otherwise `σ`), on Unicode 17 data.
  `ignoreCase` lowercases each token on its own, so a lone `Σ` token is `σ`.
  PHP: `mb_strtolower($s, 'UTF-8')` is not enough before PHP 8.3 (no Final_Sigma) and uses the
  build's Unicode tables (8.1: Unicode 14). `Str::lower()` applies Final_Sigma itself and maps the
  letters whose lowercase is newer than Unicode 13 (`CaseData`, generated from Node) before calling
  `mb_strtolower`, so every supported PHP version matches JS.
- **old** / **new**: the two input strings. Inputs are UTF-8 on PHP and UTF-16 strings in JS; they
  denote the same sequence of code points.
- **Ill-formed input.** Every entry point (all text modes, the line views, similarity, heatmap,
  moves, timeline, playback) first replaces what is not a code point with U+FFFD, and then works on
  the result, so values, texts and counts all refer to the replaced string:
  - JS: each lone surrogate (a high surrogate not followed by a low one, or a low one not preceded by
    a high one) becomes one U+FFFD, like `String.prototype.toWellFormed()` (`wellFormed()` in core).
  - PHP: invalid UTF-8 becomes U+FFFD, one per *maximal subpart* of an ill-formed sequence (a
    truncated prefix of a valid sequence, or any other single invalid byte), exactly like the
    WHATWG/`TextDecoder` decoder: `"a\xE2\x82b"` → `a�b`, `"\xED\xA0\x80"` (an encoded surrogate)
    → `���`, `"\xC0\xAF"` → `��`. `Str::utf8()` does this without depending on mbstring's
    substitute character.

## 2. The Change shape

Every text-mode diff returns an ordered list of **changes**:

```json
{ "value": "string", "added": false, "removed": false, "count": 1 }
```

- `added: true` — `value` exists only in new. `removed: true` — only in old. Both false — unchanged.
  `added` and `removed` are never both true.
- `count` — number of tokens the change covers (characters, words, lines, ...).
- For unchanged changes `value` is built from the **new** text's tokens. This matters when
  `ignoreCase` or `ignoreWhitespace` make non-identical tokens compare equal: the unchanged change
  shows the new spelling (`"Hello World"` → `"hello world"` with ignoreCase gives one unchanged change
  `"hello world"`).
- After core post-processing (section 7) no change has an empty `value` and no two neighbours have the
  same kind.
- For every mode except `words`, concatenating the values of unchanged+removed changes reproduces old,
  and unchanged+added reproduces new (unchanged values come from new, so with ignoreCase /
  ignoreWhitespace the old side is reproduced only up to that equivalence). `words` does not have this
  property because of whitespace deduplication (section 6).

## 3. Options per mode

Only these options exist. Everything else (jsdiff's `oneChangePerToken`, `intlSegmenter`,
`ignoreNewlineAtEof`, `comparator`, `callback`, `timeout`, `diffWords`' undocumented
`ignoreWhitespace`) is dropped before calling jsdiff and is not part of the contract.

| option             | chars | words | wordsWithSpace | lines | sentences | meaning |
|--------------------|:-----:|:-----:|:--------------:|:-----:|:---------:|---------|
| `ignoreCase`       |  yes  |  yes  |      yes       |  yes  |    yes    | tokens equal if lowercase(a) == lowercase(b) |
| `ignoreWhitespace` |       |       |                |  yes  |           | lines equal after trim (see 5.4) |
| `newlineIsToken`   |       |       |                |  yes  |           | line terminators become separate tokens |
| `stripTrailingCr`  |       |       |                |  yes  |           | replace every `\r\n` with `\n` before tokenizing |
| `maxEditLength`    |  yes  |  yes  |      yes       |  yes  |    yes    | integer ≥ 0; past this edit distance return a whole replacement (section 7) |

Options given to a mode that does not support them are ignored silently. Boolean options are only
"on" when strictly truthy. `maxEditLength` is floored; negative values are ignored.

The line views (unified, split) accept `ignoreCase`, `ignoreWhitespace`, `stripTrailingCr` and
`contextLines` (default 3), plus the opt-in move options `detectMoves`, `minMoveLines` and
`moveSimilarity` (section 19). They never use `newlineIsToken`.

## 4. The diff algorithm, exactly

All text modes share one algorithm: jsdiff v8's greedy forward Myers search. To produce **identical
change lists** a port must reproduce it exactly, including tie-breaking. In particular:

- Trimming a **common prefix** before running the search is safe (the search starts by consuming it).
- Trimming a **common suffix is NOT safe**: it changes where insertions land. Example (chars):
  `"a"` → `"aa"` must give `[= "a", + "a"]`; suffix trimming would give `[+ "a", = "a"]`.
- A bidirectional / middle-snake (linear space) Myers finds a different optimal path in many cases
  and will not match the fixtures.

Pseudo-code. `O` = old tokens, `N` = new tokens (after dropping empty-string tokens), `eq(a, b)` = the
mode's token equality (section 5). A *component* is `{count, added, removed, prev}` forming a linked
list (newest first); a *path* is `{oldPos, last}` where `last` is a component or null.

```
function diffTokens(O, N, eq, maxEditLength = null):
    oldLen = len(O); newLen = len(N)
    maxEdit = oldLen + newLen
    if maxEditLength !== null: maxEdit = min(maxEdit, maxEditLength)

    best = {}                                   # diagonal k -> path (k may be negative)
    best[0] = {oldPos: -1, last: null}
    newPos = extractCommon(best[0], 0)
    if best[0].oldPos + 1 >= oldLen and newPos + 1 >= newLen:
        return buildValues(best[0].last)

    minDiag = -INF; maxDiag = +INF
    editLength = 1
    while editLength <= maxEdit:
        for k from max(minDiag, -editLength) to min(maxDiag, editLength) step 2:
            removePath = best[k - 1]            # may be undefined
            addPath    = best[k + 1]            # may be undefined
            if removePath defined: best[k - 1] = undefined
            canAdd = false
            if addPath defined:
                addNewPos = addPath.oldPos - k
                canAdd = (0 <= addNewPos and addNewPos < newLen)
            canRemove = removePath defined and removePath.oldPos + 1 < oldLen
            if not canAdd and not canRemove:
                best[k] = undefined
                continue
            if not canRemove or (canAdd and removePath.oldPos < addPath.oldPos):
                base = addToPath(addPath, added=true,  removed=false, oldPosInc=0)
            else:
                base = addToPath(removePath, added=false, removed=true, oldPosInc=1)
            newPos = extractCommon(base, k)
            if base.oldPos + 1 >= oldLen and newPos + 1 >= newLen:
                return buildValues(base.last)
            best[k] = base
            if base.oldPos + 1 >= oldLen: maxDiag = min(maxDiag, k - 1)
            if newPos + 1 >= newLen:      minDiag = max(minDiag, k + 1)
        editLength += 1
    return UNDEFINED                            # maxEditLength exceeded (section 7)

function addToPath(path, added, removed, oldPosInc):
    last = path.last
    if last != null and last.added == added and last.removed == removed:
        # extend the previous component: NEW component object, same prev
        return {oldPos: path.oldPos + oldPosInc,
                last: {count: last.count + 1, added, removed, prev: last.prev}}
    return {oldPos: path.oldPos + oldPosInc,
            last: {count: 1, added, removed, prev: last}}

function extractCommon(path, k):              # mutates path
    oldPos = path.oldPos; newPos = oldPos - k; common = 0
    while newPos + 1 < newLen and oldPos + 1 < oldLen and eq(O[oldPos + 1], N[newPos + 1]):
        newPos++; oldPos++; common++
    if common > 0:
        path.last = {count: common, added: false, removed: false, prev: path.last}
    path.oldPos = oldPos
    return newPos

function buildValues(last):
    components = reverse(walk last via prev)
    oldPos = 0; newPos = 0
    for c in components:
        if not c.removed:
            c.value = join(N[newPos : newPos + c.count]); newPos += c.count
            if not c.added: oldPos += c.count
        else:
            c.value = join(O[oldPos : oldPos + c.count]); oldPos += c.count
    return components (as {value, added, removed, count})
```

Components are immutable once created except through `extractCommon` on the fresh path returned by
`addToPath`, so sharing `prev` chains between paths is safe (PHP: use small objects or arrays of
nodes with integer `prev` indices).

`join` is plain concatenation for every mode except `words` (5.2).

Worked examples (chars mode):

| old      | new      | changes |
|----------|----------|---------|
| `ab`     | `ba`     | `- a`, `= b`, `+ a` |
| `abc`    | `cab`    | `+ c`, `= ab`, `- c` |
| `xaby`   | `xbay`   | `= x`, `- a`, `= b`, `+ a`, `= y` |

## 5. Tokenizers and equality, per mode

In every mode, empty-string tokens are removed after tokenizing. Default equality is
`a === b || (ignoreCase && lowercase(a) === lowercase(b))`.

### 5.1 chars

Tokens are the individual **code points** of the string (surrogate pairs are one token; combining
marks are separate tokens). Default equality.

### 5.2 words

Let `W` (word characters) be this code-point class:

```
a-z A-Z 0-9 _ U+00AD U+00C0–U+00D6 U+00D8–U+00F6 U+00F8–U+02C6 U+02C8–U+02D7 U+02DE–U+02FF U+1E00–U+1EFF
```

(Latin letters with diacritics; excludes × U+00D7, ÷ U+00F7, and the spacing marks U+02C7, U+02D8–U+02DD.)
CJK, Cyrillic, Greek, emoji etc. are **not** in `W`: each such code point is a separate
"punctuation" token.

**Step 1 — parts.** Scan left to right, each time taking the first alternative that matches
(PCRE with `u`): `[W]+` | `WS+` | any single code point not in `W`. Because `WS+` is tried before the
single-code-point alternative, a whitespace code point always lands in a whitespace run.

**Step 2 — stitch whitespace onto neighbours.** Tokens carry their surrounding whitespace, so the
whitespace between two tokens appears in both (trailing on the left one, leading on the right one):

```
tokens = []; prev = null
for part in parts:
    if part is whitespace:
        if prev == null: tokens.push(part)           # text starts with whitespace
        else: tokens[last] = tokens[last] + part      # trailing whitespace of previous token
    else if prev != null and prev is whitespace:
        if tokens[last] == prev:                      # only when the text started with that whitespace
            tokens[last] = prev + part                # merge leading whitespace into this token
        else:
            tokens.push(prev + part)                  # duplicate: leading whitespace of this token
    else:
        tokens.push(part)
    prev = part
```

Examples:

| text              | tokens |
|-------------------|--------|
| `foo bar`         | `"foo "`, `" bar"` |
| `Hello, world!`   | `"Hello"`, `", "`, `" world"`, `"!"` |
| ` foo`            | `" foo"` |
| `foo  `           | `"foo  "` |
| `   ` (only ws)   | `"   "` |
| `a b c`           | `"a "`, `" b "`, `" c"` |
| `东京 is`          | `"东"`, `"京 "`, `" is"` |

**Equality:** if ignoreCase, lowercase both; then `trim(a) === trim(b)`.

**join(tokens)** (used by buildValues): the first token as-is, every later token with its leading
whitespace removed, concatenated. (Consecutive tokens always come from the same text, so this
restores the original whitespace exactly once.)

Then apply the whitespace post-processing of section 6.

### 5.3 wordsWithSpace

Parts only, no stitching. Scan with the first matching alternative:
`\r?\n` | `[W]+` | a run of whitespace excluding `\n` and `\r` (i.e. `[WS minus {U+000A, U+000D}]+`) |
any single code point not in `W`. Note that a lone `\r` not followed by `\n` is matched by the last
alternative as a single token. Default equality, plain concatenation join, no post-processing.

Examples: `"a  b\r\nc"` → `"a"`, `"  "`, `"b"`, `"\r\n"`, `"c"`; `"a\n\nb"` → `"a"`, `"\n"`, `"\n"`, `"b"`.

### 5.4 lines

**Tokenize:**

1. If `stripTrailingCr`, replace every `\r\n` with `\n`.
2. Split on the separators `\n` and `\r\n`, keeping the separators (JS `split(/(\n|\r\n)/)`); this gives
   `[content, sep, content, sep, ..., content]`. A lone `\r` is not a separator.
3. If the final element is empty (the text ends with a separator, or the text is empty), drop it.
4. Without `newlineIsToken`: append each separator to the content before it, so each token is a line
   including its terminator. With `newlineIsToken`: keep contents and separators as separate tokens.
5. Drop empty tokens.

Examples: `"a\nb"` → `"a\n"`, `"b"`; `"a\n\nb\n"` → `"a\n"`, `"\n"`, `"b\n"`; `""` → none;
with newlineIsToken `"a\n\nb"` → `"a"`, `"\n"`, `"\n"`, `"b"` (the empty content between the two
newlines is dropped).

Because the terminator is part of the token, `"b"` (last line, no newline) and `"b\n"` differ:
`"a\nb"` → `"a\nb\n"` gives `= "a\n"`, `- "b"`, `+ "b\n"`.

**Equality:**

```
if ignoreWhitespace:
    if not newlineIsToken or "\n" not in a: a = trim(a)
    if not newlineIsToken or "\n" not in b: b = trim(b)
return a === b || (ignoreCase && lowercase(a) === lowercase(b))
```

(`trim` removes the line terminator too, so `"b  \n"` equals `"b"` under ignoreWhitespace.)

### 5.5 sentences

Scan by index (JS scans UTF-16 units, but every character tested is in the BMP, so scanning code
points gives identical results):

```
result = []; start = 0
for i = 0; i < len(s); i++:
    if i == len(s) - 1:
        result.push(s[start:])                # remainder (from start to end)
        break
    if s[i] in {'.', '!', '?'} and s[i+1] is WS:
        result.push(s[start : i+1])           # the sentence, including its punctuation
        start = i + 1; i = i + 1
        while i + 1 < len(s) and s[i+1] is WS: i++
        result.push(s[start : i+1])           # the whitespace run, as its own token
        start = i + 1
# the loop's i++ then continues from start
```

Then drop empty tokens. Default equality, plain join.

Rules in words: a sentence ends at `.`, `!` or `?` **immediately followed by whitespace**; the
whitespace run after it is a separate token; everything else (including the last sentence, or text
with no terminator) runs to the end. There is no abbreviation handling.

| text                         | tokens |
|------------------------------|--------|
| `Hi. There`                  | `"Hi."`, `" "`, `"There"` |
| `Mr. Smith went home. Bye!`  | `"Mr."`, `" "`, `"Smith went home."`, `" "`, `"Bye!"` |
| `Wait...  what?  Yes.`       | `"Wait..."`, `"  "`, `"what?"`, `"  "`, `"Yes."` |
| `a.b. c`                     | `"a.b."`, `" "`, `"c"` |
| `Hi. ` (trailing space)      | `"Hi."`, `" "` |
| `End.\n`                     | `"End."`, `"\n"` |
| `` (empty)                   | none |

## 6. diffWords whitespace post-processing

After buildValues (with words' join), jsdiff tidies whitespace so it is not shown twice. This step is
skipped if the result is undefined (maxEditLength exceeded).

Walk the changes, tracking the last unchanged change (`startKeep`) and the at-most-one insertion and
at-most-one deletion seen since it:

```
lastKeep = null; ins = null; del = null
for c in changes:
    if c.added: ins = c
    else if c.removed: del = c
    else:
        if ins or del: dedupe(lastKeep, del, ins, c)
        lastKeep = c; ins = null; del = null
if ins or del: dedupe(lastKeep, del, ins, null)
```

Helpers (all whitespace is `WS`):

- `leadingWs(s)` — the longest WS prefix. `trailingWs(s)` — the longest WS suffix.
- `commonPrefix(a, b)` / `commonSuffix(a, b)` — longest common prefix/suffix (code-unit exact).
- `removePrefix(s, p)` / `removeSuffix(s, p)` — `s` must start/end with `p`; cut it off.
- `replacePrefix(s, old, new)` / `replaceSuffix(s, old, new)` — `s` must start/end with `old`; swap
  it for `new`. `replaceSuffix` with empty `old` appends `new`.
- `maximumOverlap(a, b)` — the longest string that is both a suffix of `a` and a prefix of `b`.

`dedupe(startKeep, del, ins, endKeep)` mutates the values in place:

```
if del and ins:
    [oldPre, oldSuf] = [leadingWs(del.value), trailingWs(del.value)]
    [newPre, newSuf] = [leadingWs(ins.value), trailingWs(ins.value)]
    if startKeep:
        p = commonPrefix(oldPre, newPre)
        startKeep.value = replaceSuffix(startKeep.value, newPre, p)
        del.value = removePrefix(del.value, p)
        ins.value = removePrefix(ins.value, p)
    if endKeep:
        s = commonSuffix(oldSuf, newSuf)
        endKeep.value = replacePrefix(endKeep.value, newSuf, s)
        del.value = removeSuffix(del.value, s)
        ins.value = removeSuffix(ins.value, s)

else if ins:                                    # insertion only
    if startKeep: ins.value = ins.value without leadingWs(ins.value)
    if endKeep:   endKeep.value = endKeep.value without leadingWs(endKeep.value)

else if startKeep and endKeep:                  # deletion between two keeps
    newWsFull = leadingWs(endKeep.value)
    delStart = leadingWs(del.value); delEnd = trailingWs(del.value)
    newWsStart = commonPrefix(newWsFull, delStart)
    del.value = removePrefix(del.value, newWsStart)
    newWsEnd = commonSuffix(removePrefix(newWsFull, newWsStart), delEnd)
    del.value = removeSuffix(del.value, newWsEnd)
    endKeep.value = replacePrefix(endKeep.value, newWsFull, newWsEnd)
    startKeep.value = replaceSuffix(startKeep.value, newWsFull,
                                    newWsFull[0 : len(newWsFull) - len(newWsEnd)])

else if endKeep:                                # deletion at the very start
    o = maximumOverlap(trailingWs(del.value), leadingWs(endKeep.value))
    del.value = removeSuffix(del.value, o)

else if startKeep:                              # deletion at the very end
    o = maximumOverlap(trailingWs(startKeep.value), leadingWs(del.value))
    del.value = removePrefix(del.value, o)
```

Note the insertion-only branch strips leading whitespace from `endKeep` even when it is the
`startKeep` of the next group; process groups strictly in order as above.

Worked examples (K = unchanged, D = removed, I = added):

1. `foo bar baz` → `foo baz`.
   Old tokens `"foo "`, `" bar "`, `" baz"`; new `"foo "`, `" baz"`.
   Before: K`"foo "` D`" bar "` K`" baz"`. Deletion between keeps: newWsFull = `" "`,
   delStart = `" "`, newWsStart = `" "`, D → `"bar "`; remaining newWsFull = `""` so newWsEnd = `""`;
   K2 → replacePrefix(`" baz"`, `" "`, `""`) = `"baz"`; K1 → replaceSuffix(`"foo "`, `" "`, `" "`) = `"foo "`.
   **Result:** K`"foo "` D`"bar "` K`"baz"`.
2. `foo bar baz` → `foo qux baz`.
   Before: K`"foo "` D`" bar "` I`" qux "` K`" baz"`. Both: common leading `" "` goes to K1 (unchanged),
   common trailing `" "` stays on K2. **Result:** K`"foo "` D`"bar"` I`"qux"` K`" baz"`.
3. `foo\nbar baz` → `foo baz`.
   Before: K`"foo "` D`"\nbar "` K`" baz"` (K1 is built from new's token `"foo "`).
   newWsFull = `" "`, delStart = `"\n"` → newWsStart = `""`; delEnd = `" "` → newWsEnd = `" "`,
   D → `"\nbar"`, K2 keeps `" baz"`, K1 → replaceSuffix(`"foo "`, `" "`, `""`) = `"foo"`.
   **Result:** K`"foo"` D`"\nbar"` K`" baz"`.
4. `foo baz` → `foo\nbar baz`.
   Before: K`"foo\n"` I`"\nbar "` K`" baz"`. Insertion only: I loses its leading `"\n"`, K2 loses its
   leading `" "`. **Result:** K`"foo\n"` I`"bar "` K`"baz"`.
5. `foo   bar baz` → `foo  baz`.
   Before: K`"foo  "` D`"   bar "` K`"  baz"`. newWsFull = `"  "`, delStart = `"   "` → newWsStart = `"  "`,
   D → `" bar "`; remaining `""` → newWsEnd = `""`; K2 → `"baz"`; K1 stays `"foo  "`.
   **Result:** K`"foo  "` D`" bar "` K`"baz"`.
6. `foo bar` → `bar` (deletion at start). Old tokens `"foo "`, `" bar"`; new `"bar"`.
   Before: D`"foo "` K`"bar"`. maximumOverlap(`" "`, `""`) = `""`, nothing removed.
   **Result:** D`"foo "` K`"bar"`.
7. `foo bar` → `foo` (deletion at end). Before: K`"foo"` D`" bar"`; maximumOverlap(`""`, `" "`) = `""`.
   **Result:** K`"foo"` D`" bar"`.
8. `Hello, world!` → `Hello world!`. Old tokens `"Hello"`, `", "`, `" world"`, `"!"`; new `"Hello "`,
   `" world"`, `"!"`. Before: K`"Hello "` D`", "` K`" world!"`. newWsFull = `" "`, delStart = `""` →
   newWsStart = `""`; delEnd = `" "` → newWsEnd = `" "`, D → `","`; K1 → replaceSuffix(`"Hello "`, `" "`, `""`).
   **Result:** K`"Hello"` D`","` K`" world!"`.

## 7. Core post-processing

Applied by `computeDiff` to every mode's result, after section 6:

1. **maxEditLength fallback.** If the search returned UNDEFINED, the result is a whole replacement:
   `{value: old, removed: true, count: tokenCount(old)}` (omitted if old is empty) followed by
   `{value: new, added: true, count: tokenCount(new)}` (omitted if new is empty), where tokenCount is
   the number of non-empty tokens under the mode's tokenizer and options. Identical inputs never hit
   the fallback, even with `maxEditLength: 0`.
2. **Drop empty values** and **merge neighbours of the same kind** (values concatenated, counts
   summed). Normally a no-op; it guarantees renderers never see empty spans.

## 8. Similarity

A number in [0, 1] used by the HTML full-replacement threshold, the stats badge, the heatmap,
near-match moves and the timeline. It replaces the 1.5.x metric, which could exceed 1
(`a b` vs `a          b` gave 1.60).

The input kind matters. `html` (default **true**) says the inputs are HTML, so anything between
`<` and the next `>` is a tag and is ignored. Only the HTML view's `similarityThreshold` uses
that. Every text view passes **`html: false`**: the stats badge, the heatmap (20), near-match
moves (19) and the timeline (22), so in plain text `1 < 2 and 3 > 2` vs `1 2` is 4/11, not 1.
API: core `computeSimilarity(old, new, {html})`, PHP `Similarity::compute($old, $new, $html)`.

```
function prepare(s, html):
    s = replace lone surrogates / invalid UTF-8 (section 1)
    if html: s = replace every match of /<[^>]*>/ in s with " "   # strip tags
    s = normalizeQuotes(s)                                   # 12.1
    s = replace every run of WS in s with " "; s = trim(s)   # collapse whitespace

function nonWs(s): number of code points of s that are not WS

function similarity(old, new, html = true):
    a = prepare(old, html); b = prepare(new, html)
    if a == "" and b == "": return 1
    if a == "" or b == "": return 0
    changes = words diff of (a, b)          # sections 4-7, no options
    return similarityFromChanges(changes, a, b)

function similarityFromChanges(changes, a, b):
    total = nonWs(a) + nonWs(b)
    if total == 0: return 1
    unchanged = sum of nonWs(c.value) for unchanged c
    return clamp(2 * unchanged / total, 0, 1)
```

Compute in IEEE double precision exactly as written (`2 * unchanged / total`), so results match to
the last bit.

**Similarity is directional** (old → new) and not symmetric, by design: it is computed from the
diff that is shown, and when several minimal diffs exist the old → new search can keep different
words than new → old would. `cc b` → `b!cc` keeps only `b` (2·1/7 = 2/7) while `b!cc` → `cc b`
keeps `cc` (4/7). Callers that need a symmetric score can take the max or mean of both
directions; the library never does.

| old              | new              | similarity |
|------------------|------------------|------------|
| `a b`            | `a          b`   | 1 |
| `Hello, world!`  | `Hello world!`   | 22/23 = 0.9565217391304348 |
| `a 😀`           | `a`              | 2/3 |
| `<p></p>`        | `<br>`           | 1 (both empty after prepare) |
| `abc`            | ``               | 0 |
| `1 < 2 and 3 > 2` | `1 2`           | html: 1 (`< 2 and 3 >` is a "tag"); text: 4/11 |
| `abc defghij`    | `abc klmnopq`    | 6/20, which is exactly the double 0.3 |

## 9. Line model: rows, hunks, collapsing

### 9.1 Rows

`buildRows(old, new, {ignoreCase, ignoreWhitespace, stripTrailingCr})` runs the lines diff with those
options (never newlineIsToken) and splits each change value into lines:

- cut after every `\n`; a trailing piece without `\n` is also a line;
- remove the terminator from each line: a final `\r\n` or `\n` (a lone `\r` stays).

Each line becomes a row, numbered from 1 per side:

```json
{ "type": "equal",   "oldNo": 3, "newNo": 4, "text": "..." }
{ "type": "removed", "oldNo": 5,             "text": "..." }
{ "type": "added",               "newNo": 6, "text": "..." }
```

Absent fields are omitted (not null). Equal rows carry the new text (section 2).

With `detectMoves: true` the rows then go through move detection (section 19), which turns some
removed/added rows into `moved-from` / `moved-to` rows. Everything below treats moved rows as
changed rows (they are never `equal`).

### 9.2 Hunks

`buildHunks(old, new, options)` with `contextLines` (default 3; negative or non-numeric → 3; floored):

1. Mark a row **visible** if it is changed, or an equal row within `contextLines` rows (in row
   order) of a changed row.
   If at least one row is visible, any invisible run of exactly one row becomes visible too:
   folding a single line would save no space.
2. Group maximal runs of equally-visible rows into blocks, in order.
3. A visible run becomes a hunk; an invisible run becomes a collapsed block:

```json
{ "type": "hunk", "oldStart": 7, "oldLines": 7, "newStart": 7, "newLines": 7, "rows": [ ...rows ] }
{ "type": "collapsed", "count": 6, "oldStart": 1, "newStart": 1, "rows": [ ...hidden equal rows ] }
```

- `oldStart` = (number of old lines in all earlier blocks) + 1; `newStart` likewise.
- `oldLines` = rows in the block with an `oldNo`; `newLines` = rows with a `newNo`.
- `count` = number of hidden rows (≥ 2 whenever the input has changes). Collapsed blocks keep their rows so interactive renderers
  can expand them.

Consequences: two changes merge into one hunk when at most `2·contextLines` equal rows separate them;
a single leftover equal line is shown rather than collapsed; identical non-empty inputs produce a single
collapsed block; two empty inputs produce `[]`.

## 10. Split model

`buildSplitRows(old, new, options)` returns the same block list as buildHunks, but each visible
hunk's `rows` are **split rows**:

```json
{ "type": "equal",    "left": {cell}, "right": {cell} }
{ "type": "modified", "left": {cell}, "right": {cell} }
{ "type": "removed",  "left": {cell} }
{ "type": "added",                    "right": {cell} }
```

A cell is `{ "type": "equal"|"removed"|"added", "lineNo": n, "text": "...", "parts"?: [changes] }`.

Pairing: equal rows map one-to-one. Within each maximal run of consecutive changed rows, collect the
removed rows (in order) and the added rows (in order); the i-th removed pairs with the i-th added
(`modified`); leftovers produce `removed`-only or `added`-only rows, removed leftovers first
(they are the tail of the shorter side, so at most one kind has leftovers).

Intra-line diff on each `modified` row:

1. If either line is longer than **1000** code points, skip (no `parts`). Exactly 1000 is diffed.
2. Otherwise run the **wordsWithSpace** diff (sections 4-7) on the two line texts with `ignoreCase`
   if set. (Not `words`: its whitespace deduplication, section 6, rewrites unchanged runs with the
   new text's spacing, so the old column would show the new indentation.)
3. If `similarityFromChanges(changes, oldLine, newLine) < 0.3` (section 8, **without** `prepare`),
   skip. Exactly 0.3 keeps the parts.
4. Otherwise build each side's parts so that **each column reproduces its own line exactly**:
   - `right.parts` = the changes that are not removed (values from the new line, as everywhere);
   - `left.parts` = the changes that are not added, each with its value re-read from the **old**
     line: walk the old line's wordsWithSpace tokens and give every such change the concatenation
     of its next `count` tokens. Removed values are unchanged by this; unchanged values now carry
     the old spelling (they differ from the right side only under `ignoreCase`).

   So `join(left.parts) == left.text` and `join(right.parts) == right.text`, and both sides list
   the same unchanged runs (same counts, in order). Example: `    return x;` → `  return y;` gives
   left `[−"    ", ="return " (2), −"x", =";"]`, right `[+"  ", ="return " (2), +"y", =";"]`; a
   whitespace-only change `a b` → `a  b` gives left `[="a", −" ", ="b"]`, right `[="a", +"  ", ="b"]`.

Collapsed blocks are identical to section 9.2.

With moves (section 19) the pairing walks each changed run in row order with two buffers
(removed, added): a `removed`/`added` row is appended to its buffer; a `moved-from`/`moved-to`
row first **flushes** the buffers (pairing them as above) and is then emitted as its own row,
`{ "type": "moved-from", "left": {cell} }` or `{ "type": "moved-to", "right": {cell} }`; an equal
row or the end of the run flushes too. Moved cells are `{type, lineNo, text, move, counterpart}`
and never get `parts`. Without moved rows this is exactly the pairing above.

## 11. Stats

```json
{ "added": 12, "removed": 3, "unchanged": 40, "unit": "codepoints" }
```

- `computeStats(changes)`: sum of code-point lengths of the added, removed and unchanged values.
  `unit: "codepoints"`. (For words mode this counts the deduplicated values.)
- The badge's similarity is the plain-text one: `similarity(old, new, html: false)` (section 8).
- `lineStats(blocks)` (unified or split): `unit: "lines"`. Unified rows count by type
  (`moved-from` counts as removed, `moved-to` as added). Split rows: equal +1 unchanged; otherwise
  +1 removed if `left`, +1 added if `right`. Collapsed blocks add `count` to unchanged.

## 12. HTML diff

One engine on every platform: core (`html.ts`, `htmlLexer.ts`, `htmlTokens.ts`, `htmlRender.ts`,
`htmlEntities.ts`) and PHP (`DiffHtml`, `HtmlLexer`, `HtmlTokenizer`, `HtmlDiffRenderer`,
`HtmlEntities`) produce **byte-identical** output, and the `html` fixtures compare `expected.html`
exactly. Inputs are trusted HTML: callers must sanitize untrusted input.

### 12.1 Normalization helpers

- `normalizeQuotes(s)`: U+201C, U+201D, U+201E → `"`; U+2018, U+2019, U+201A → `'`.
- `stripFormattingTags(s)`: lex `s` (12.2.2) and drop every `open`, `close` or `void` segment whose
  name is one of `strong em b i u s mark sub sup`; every other segment is kept byte for byte. So a
  `>` inside a quoted attribute value does not end the tag (`<b title="a>b">x</b>` → `x`,
  `<strong class="x">y</strong>` → `y`), `<b/>` is removed too, and comments, CDATA, doctypes and
  raw text elements (`<script>"<b>"</script>`) are untouched. A tag with an unbalanced quote is not a
  tag (12.2.2) and is kept.

### 12.2 Algorithm

`diffHtml(old, new, options)` returns `{html, fullReplacement, similarity?}`; `html` is the inner
markup (section 13.5 wraps it). Options (anything else is ignored):

| option | default | meaning |
|--------|---------|---------|
| `similarityThreshold` | null | a number enables the full replacement (step 2) |
| `ignoreFormattingTags` | true | drop formatting tags (12.1) before diffing; only a literal `false` turns it off |
| `orphanMatchThreshold` | 0.3 | orphan grouping (step 7); a value that is not a finite number means 0.3 |
| `ignoreCase` | false | text keys are lowercased (JS truthiness, section 3) |
| `maxEditLength` | none | as in section 3 (floored, negative ignored), counted in tokens |

#### 12.2.1 Steps

1. **Scrub.** Invalid input becomes U+FFFD: PHP replaces each invalid UTF-8 sequence (`mb_scrub`
   with substitute character U+FFFD); JS replaces each lone UTF-16 surrogate. Everything below
   (including the full replacement) uses the scrubbed strings.
2. **Full replacement.** If `similarityThreshold` is a number and both inputs are non-empty, compute
   `similarity(old, new)` (section 8) and include it in the result. If `similarity < threshold`,
   return
   `<div class="diff-removed" data-change-index="0">OLD</div><div class="diff-added" data-change-index="1">NEW</div>`
   with OLD and NEW the scrubbed inputs, unescaped. Threshold 0 never triggers; null never computes
   similarity. Otherwise continue (the result keeps `similarity`).
3. **Tokenize** both inputs (12.2.2–12.2.4).
4. **Diff** the token keys with the section 4 algorithm (jsdiff `diffArrays` over the keys; PHP
   interns keys to integers and calls `Myers::diff`). If `maxEditLength` is exceeded the result is
   "delete every old token, insert every new token".
5. **Items.** Walk the operations: each run of equal tokens is an item `EQ(old tokens, new tokens)`;
   every maximal sequence of deletes/inserts between two equal runs is one item
   `CHG(removed = the deleted old tokens, added = the inserted new tokens)`, each list in document
   order. Items alternate.
6. **Sliding** (12.2.5), then 7. **orphan grouping** (12.2.6), then 8. **rendering** (12.2.7).

#### 12.2.2 Lexing

The lexer cuts the input into segments; concatenating their `raw` strings gives the input back.
Scan for the next `<` at position p (everything between constructs is a `text` segment):

| at p | segment | ends | if the end is missing |
|------|---------|------|-----------------------|
| `<!--` | comment | after the first `-->` found from p+4 | runs to the end of the input |
| `<![CDATA[` | opaque | after the first `]]>` from p+9 | the `<` is text |
| `<!` + ASCII letter, or `<?` | opaque (doctype, processing instruction) | after the first `>` from p+2 | the `<` is text |
| `</` + ASCII letter | close tag | tag grammar | the `<` is text |
| `<` + ASCII letter | open tag | tag grammar | the `<` is text |
| anything else | the `<` is text | | |

**Tag grammar**, from the first letter of the name: the name runs to the first of
`TAB LF FF CR space / > " '` (names are ASCII-lowercased; non-ASCII letters are not folded). Then,
repeatedly: `>` ends the tag; `"` or `'` jumps past the next identical quote (if there is none the
tag is unterminated); any other character is skipped. Reaching the end of the input without `>`
means unterminated. So an unbalanced attribute quote turns the whole would-be tag into text:
`<p title="x>two</p>` is the text `<p title="x>two` followed by a close tag `</p>`.

An open tag is `void` if its name is one of
`area base br col embed hr img input link meta param source track wbr` or its raw text ends with
`/>` (self-closing is honored for every name). An open tag named
`script style textarea title xmp iframe noembed noframes` is a **raw text element**: the segment
(`raw` kind) runs from its `<` to the end of the first end tag, found by searching the
ASCII-lowercased input for `</name` followed by one of `TAB LF FF CR space / >` and then the next
`>`. If there is none, the segment runs to the end of the input and is **unclosed**.
So `</SCRIPT>` closes `<script>`, and a `</div>` inside a script is part of the script.

#### 12.2.3 Text units and tokens

Every `text` segment is split into **units**, one decoded code point each:

- `&#DIGITS;` / `&#xHEX;`: strip leading zeros; more than 8 digits, value 0, a surrogate
  (U+D800–U+DFFF) or a value above U+10FFFF decode to U+FFFD; otherwise the code point.
- `&NAME;` where NAME (`[A-Za-z][A-Za-z0-9]*`, case-sensitive) is in the entity table: the table's
  code point. The table is the 252 HTML 4.01 entities plus `apos` (the same data string in
  `htmlEntities.ts` and `HtmlEntities.php`). Other names (e.g. HTML5's `&check;`) and `&` without a
  terminating `;` are not entities: the `&` is an ordinary unit.
- A `<` (one that did not start a construct): a unit whose output form is `&lt;`.
- Any other code point: itself.

Each unit keeps its source form (`raw`) for output. Units are classified by their decoded code
point: **WS** (the section 1 set, including U+00A0 and so `&nbsp;`), **WORD** (`0-9 A-Z a-z _`,
U+00AA, U+00AD, U+00B5, U+00BA, U+00C0–U+00D6, U+00D8–U+00F6, U+00F8–U+02FF, U+0370–U+0374,
U+0376–U+037D, U+037F–U+0383, U+0386, U+0388–U+0481, U+048A–U+052F, U+0531–U+0556, U+0561–U+0587,
U+05D0–U+05EA, U+0620–U+064A, U+0660–U+0669, U+066E–U+06D3, U+1E00–U+1FFF), **EXT** (U+0300–U+036F,
U+0483–U+0489, U+1AB0–U+1AFF, U+1DC0–U+1DFF, U+20D0–U+20FF, U+FE00–U+FE0F, U+FE20–U+FE2F,
U+1F3FB–U+1F3FF, U+E0020–U+E007F, U+E0100–U+E01EF), **ZWJ** (U+200D), **RI** (U+1F1E6–U+1F1FF),
**OTHER** (everything else, e.g. CJK, punctuation, emoji). Tokens, left to right:

- a maximal run of WS units → a `space` token;
- otherwise a base: a maximal run of WORD/EXT units starting with WORD; or two RI units (a flag); or
  one unit. Then extend while the next unit is EXT, or is ZWJ followed by a non-WS unit (take both).
  → a `text` token. Surrogate pairs, flags, ZWJ sequences, combining marks and variation selectors
  are never split.

#### 12.2.4 Tokens and keys

Walk the segments in order, keeping a list of open formatting elements (only used when
`ignoreFormattingTags` is false):

| segment | token | key |
|---------|-------|-----|
| comment | none (comments are dropped) | |
| opaque | `opaque`, raw as written | `!` + raw |
| raw text element | `raw`; if unclosed, raw + `</name>` | `!` + raw |
| open / close / void named `strong em b i u s mark sub sup` with `ignoreFormattingTags` | none | |
| open | `open` | `<` + name (attributes ignored: an attribute-only change is "equal" and the new tag is shown) |
| close | `close` | `</` + name |
| void | `void` | `<` + name + `/` + attrs, where attrs = raw without `<name` and `>`, ASCII-whitespace runs (`TAB LF FF CR space`) collapsed to one space, one leading/trailing space removed, then one trailing `/` removed, then collapsed and stripped again (`<img src="a">` equals `<img src="a" />`) |
| text | `space` tokens | ` ` (all whitespace runs are equal) |
| | `text` tokens | `t` + ctx + `>` + K, where K = normalizeQuotes(decoded text), lowercased with `ignoreCase`, and ctx = the open formatting element names, deduplicated, sorted, joined with `,` (empty when formatting tags are ignored) |

Formatting tracking (`ignoreFormattingTags: false`): an open formatting tag appends its name; a
close formatting tag removes the last occurrence of its name. So bold "World" and plain "World"
differ (shown as removed + added), and `<b><i>x</i></b>` equals `<i><b>x</b></i>`.
Each `text` token also has a **length**: its number of units (decoded code points).

#### 12.2.5 Sliding

Myers can split a structural change unevenly (`<div><div>a</div><div>b</div></div>` →
`<div><div>a</div></div>` deletes `<div>b` and a later `</div>`). Sliding fixes this. Process the
items left to right (index k). Skip EQ items and changes with both or neither side non-empty. For a
pure change on side S (removed: EQ side `old`; added: EQ side `new`):

- `seq` = (previous EQ's S-side tokens) + (the run) + (next EQ's S-side tokens); the run is the
  window `[start0, start0 + len)`.
- Candidates: moving left one step is allowed while `seq[s-1].key == seq[s+len-1].key` (s ≥ 1),
  giving start `s-1`; keep going from there. Moving right is allowed while
  `seq[s].key == seq[s+len].key` (s + len < |seq|), giving start `s+1`.
- `unpaired(tokens)`: stack pairing over open/close tokens (a close pops only when the top has its
  name, otherwise it counts as unpaired); result = unpaired closes + opens left on the stack.
- `score(start)`: let L be the S side of item k-2 (if the previous EQ and item k-2 exist) and R the S
  side of item k+2 (if the next EQ and item k+2 exist). If start = 0 and L exists, the window merges
  with L; if start + len = |seq| and R exists, it merges with R. Score =
  unpaired(merged-with-L? L : [] + window + merged-with-R? R : []) + (L not merged ? unpaired(L) : 0)
  + (R not merged ? unpaired(R) : 0).
- Candidates are considered left ones first (nearest first), then right ones (nearest first). The
  best starts as the original position; a candidate replaces it when its score is lower, or (only
  once the best is no longer the original) when its score is equal and it is nearer to the original,
  or equally near and further left. So a change only moves when that strictly reduces unpaired tags.
- Moving rebuilds the neighbours: the previous EQ gets `seq[0, best)` on side S and the same number
  of tokens from the start of (previous EQ other side + next EQ other side); the next EQ gets the
  rest. An EQ that becomes empty disappears, and the moved change merges with the neighbouring
  change (removed lists concatenated, added lists concatenated, in document order). Continue with
  the item after the (merged) change.

#### 12.2.6 Orphan grouping

An EQ item at index k with CHG items on both sides is an **orphan** when it contains only `text`
and `space` tokens and

```
surrounding = textLen(prev.removed) + textLen(prev.added) + textLen(next.removed) + textLen(next.added)
surrounding > 0  and  textLen(EQ new tokens) / surrounding < orphanMatchThreshold
```

where textLen sums the lengths of `text` tokens (whitespace does not count). The division is IEEE
double; the comparison is strict (`ab XYZ cde` → `fg XYZ hij`: 3/10 = 0.3 is not an orphan at the
default 0.3, `ab XY cde` → `fg XY hij`: 2/10 is). Orphan status is decided on the items as they are
after sliding. Then walk left to right: an orphan whose previous output item is a change is merged
with it and with the next item into one change (removed = prev.removed + EQ old tokens +
next.removed; added = prev.added + EQ new tokens + next.added), and the next item is skipped; a
chain of orphans therefore merges into one change. Runs containing a tag are never absorbed;
threshold 0 disables grouping.

#### 12.2.7 Rendering

Keep a stack of open element names and a marker counter N (from 0). `marker(cls, content)` is
`<span class="diff-CLS" data-change-index="N">content</span>` (N then increments), CLS `added` or
`removed`. **Marker content** tokens are `text`, `space` and `void` tokens named `img`.

- **New-document tags** (EQ new tokens and added tokens): `open` → emit raw, push. `close` → if the
  name is on the stack, emit `</x>` for every element above its last occurrence (popping them), then
  emit raw and pop; otherwise drop it. `void`, `raw`, `opaque` → emit raw.
- **EQ**: emit the new tokens (`text`/`space` raw, tags as above).
- **CHG**: first the removed run, then the added run.
- **Added run**: collect marker content raw into a buffer; at any other token flush the buffer as
  `added`, then handle the token as a new-document tag. Flush at the end.
- **Removed run**: pair open/close tokens inside the run (a close pairs with the innermost open only
  when the names match). Walk the run: marker content goes into the buffer (but first, if a
  separator is pending, the buffer does not end with ASCII whitespace and the token's raw does not
  start with it, append one space). An `open` that has a pair and is **allowed here** flushes the
  buffer, is emitted and pushed, and marks its pair as kept; a kept `close` flushes, is emitted and
  pops. Any other token is dropped (the marker continues across it); if it is a tag named in
  BREAKING and the buffer is non-empty, a separator becomes pending. Flushing clears the separator.
  Flush the buffer as `removed` at the end.
- **Flush(cls, content)** (content non-empty): if the top of the stack is a restricted parent (below):
  content made only of `TAB LF FF CR space` is emitted raw for `added` and dropped for `removed`;
  otherwise removed content is wrapped: `tr` → `<td>…</td>`, `table`/`thead`/`tbody`/`tfoot` →
  `<tr><td>…</td></tr>`, `ul`/`ol`/`menu` → `<li>…</li>`, `dl` → `<dd>…</dd>` (other restricted
  parents: no wrapper). Everything else: `marker(cls, content)`.
- At the end, emit `</x>` for every element left on the stack, innermost first.

**Allowed here** (a removed element may be emitted at the current position), with P the top of the
stack: never for `html head body`; if the name has required parents, P must be one of them; else if
there is no P, yes; else if P is a restricted parent, the name must be one of its allowed children;
else a BLOCK name is not allowed in a PHRASING parent; `a` is not allowed when an `a` is open;
otherwise yes.

- Required parents: `li` ← `ul ol menu`; `tr` ← `table thead tbody tfoot`; `td th` ← `tr`;
  `thead tbody tfoot caption colgroup` ← `table`; `dt dd` ← `dl`; `option` ← `select optgroup datalist`;
  `optgroup` ← `select`.
- Restricted parents (allowed children): `ul ol menu` (`li`); `table` (`caption colgroup thead tbody
  tfoot tr`); `thead tbody tfoot` (`tr`); `tr` (`td th`); `colgroup` (`col`); `dl` (`dt dd div`);
  `select` (`option optgroup`); `optgroup` (`option`); `html` (`head body`); `head` (`title meta link
  style script base noscript template`).
- BLOCK: `address article aside blockquote details dialog div dl fieldset figcaption figure footer
  form h1 h2 h3 h4 h5 h6 header hgroup hr main menu nav ol p pre section table ul`.
- PHRASING parents: `p h1 h2 h3 h4 h5 h6 pre span a em strong b i u s mark sub sup small big code
  abbr cite q kbd samp var time label button dt legend summary font tt del ins dfn bdi bdo`.
- BREAKING: BLOCK plus `li dt dd tr td th caption thead tbody tfoot br`.

### 12.3 Guarantees and examples

For any input the output is balanced (every emitted open tag is closed, in order), markers contain
only text and `<img>` and never nest, no text contains an unescaped `<`, and `data-change-index`
runs 0, 1, 2, … in document order. The text outside `diff-removed` markers is the new document's
text and the text outside `diff-added` markers is the old one's (decoded, whitespace ignored, up to
the key equivalences: quotes, and case with `ignoreCase`). When the new document is valid (elements
in allowed parents, text only where phrasing content is allowed), so is the output. The new
document's structure is taken as written: HTML's implicit end tags (`<p>a<p>b`) are not applied.

| old | new | html |
|-----|-----|------|
| `<ul><li>a</li><li>b</li></ul>` | `<ul><li>a</li></ul>` | `<ul><li>a</li><li><span class="diff-removed" data-change-index="0">b</span></li></ul>` |
| `<table><tr><td></td></tr></table>` | `<table><tr><td>one</td></tr></table><p>one<br>one</p>` | `<table><tr><td><span class="diff-added" data-change-index="0">one</span></td></tr></table><p><span class="diff-added" data-change-index="1">one</span><br><span class="diff-added" data-change-index="2">one</span></p>` |
| `<div><p>a</p></div><p>b</p>` | `<p>b</p>` | `<div><p><span class="diff-removed" data-change-index="0">a</span></p></div><p>b</p>` (sliding) |
| `<p>see <a href="/y">docs</a> now</p>` | `<p><a href="/x">see now</a></p>` | `<p><a href="/x">see <span class="diff-removed" data-change-index="0">docs </span>now</a></p>` (no `<a>` in `<a>`) |
| `<p class="a">Hello</p>` | `<p class="b">Hello</p>` | `<p class="b">Hello</p>` |
| `<p>&eacute;cole &amp; co&nbsp;x</p>` | `<p>école & co` U+00A0 `x</p>` | the new input, unchanged |
| `<p>one</p>` | `<p>one</p><p title="x>two</p>` | `<p>one</p><span class="diff-added" data-change-index="0">&lt;p title="x>two</span>` |
| `<p>make this bold now</p>` | `<p>make <strong>this bold</strong> now</p>`, `ignoreFormattingTags: false` | `<p>make <span class="diff-removed" data-change-index="0">this bold</span><strong><span class="diff-added" data-change-index="1">this bold</span></strong> now</p>` |

### 12.4 Marker-text extraction (fixtures and tests)

The `html` fixtures also record `addedText` / `removedText`, extracted from the output like this.
Walk the HTML left to right, keeping a stack of open elements:

- `<!-- … -->`: skip.
- `<` followed by a letter, `/` or `!`: a tag, ending at the first `>` that is not inside a `"…"` or
  `'…'` attribute value. `<!…>` (doctype, CDATA) is skipped. A closing tag pops the stack (and must
  match the top, otherwise the HTML is invalid). A void element or a tag ending in `/>` is not
  pushed. An opening raw text element (12.2.2) skips to the end of its end tag. Any other opening
  tag is pushed, marked `added` if its `class` attribute contains the token `diff-added`, `removed`
  if it contains `diff-removed`.
- Anything else is text, up to the next tag start. Its **owner** is the nearest marked element on the
  stack (if none, it is ignored). Decode entities (`&amp; &lt; &gt; &quot; &apos; &nbsp;`, `&#N;`,
  `&#xH;`; other named entities stay as written) and append to the owner's side.
- At the end the stack must be empty.

Finally, for each side: replace U+00A0 with a space, collapse WS runs to one space, trim. Texts from
separate markers are concatenated with **no** separator (`<li>c</li><li>d</li>` both added → `"cd"`).

## 13. Canonical markup

General rules, for every view:

- No whitespace or newlines between tags, no trailing newline. Attribute order exactly as shown.
  Attribute values use double quotes.
- Before escaping, every `\r\n` and lone `\r` in emitted text becomes `\n` (display only; diffing uses the original text). HTML parsers do the same, so this keeps server output identical to the parsed DOM.
- Text is escaped by replacing `&` `<` `>` `"` `'` with `&amp;` `&lt;` `&gt;` `&quot;` `&#39;`
  (exactly these five, exactly these forms; PHP: use `strtr`, not `htmlspecialchars`, whose `'` form
  varies by flag).
- The minus sign is U+2212 `−`, never ASCII `-`.
- Changes with empty values are skipped (and do not consume an index).
- Vue/React must produce the same elements, classes, attributes and text (they may add
  framework-internal attributes, and may render the collapsed row as a `<button type="button">`
  with the same classes and text that expands to the hidden rows).

### 13.1 Text modes

Container class per mode: `chars` → `text-diff-chars`, `words` → `text-diff-words`,
`wordsWithSpace` → `text-diff-words-with-space`, `lines` → `text-diff-lines`,
`sentences` → `text-diff-sentences`.

```html
<div class="text-diff text-diff-words"><span>foo </span><span class="diff-removed" data-change-index="0">bar</span><span class="diff-added" data-change-index="1">qux</span><span> baz</span></div>
```

- Unchanged: `<span>TEXT</span>`. Added: `<span class="diff-added" data-change-index="N">TEXT</span>`.
  Removed: `<span class="diff-removed" data-change-index="N">TEXT</span>`.
- N counts added and removed spans together, 0-based, in document order.
- No changes (both inputs empty): `<div class="text-diff text-diff-words"></div>`.

### 13.2 Unified

```html
<div class="text-diff text-diff-unified">
  <div class="diff-row diff-row-collapsed">2 unchanged lines</div>
  <div class="diff-row diff-row-equal"><span class="diff-gutter diff-gutter-old">3</span><span class="diff-gutter diff-gutter-new">3</span><span class="diff-sign" aria-hidden="true"> </span><span class="diff-line">b</span></div>
  <div class="diff-row diff-row-removed" role="group" aria-label="removed line 4" data-change-index="0"><span class="diff-gutter diff-gutter-old">4</span><span class="diff-gutter diff-gutter-new"></span><span class="diff-sign" aria-hidden="true">−</span><span class="diff-line">c</span></div>
  <div class="diff-row diff-row-added" role="group" aria-label="added line 4"><span class="diff-gutter diff-gutter-old"></span><span class="diff-gutter diff-gutter-new">4</span><span class="diff-sign" aria-hidden="true">+</span><span class="diff-line">C</span></div>
  <div class="diff-row diff-row-collapsed">4 unchanged lines</div>
</div>
```

(Shown indented for reading; the real output has no whitespace between tags.)

- One `div.diff-row` per row, blocks in order. Row class `diff-row-equal|removed|added`.
- Children, in order: old gutter (old line number or empty), new gutter (new line number or empty),
  sign (`" "`, `−`, `+`), line text (escaped; may be empty).
- Changed rows have `role="group"` and `aria-label="removed line N"` (old number) or
  `aria-label="added line N"` (new number).
- `data-change-index="N"` is on the **first row of each contiguous run of changed rows** (a removed
  run followed directly by an added run is one run). N is 0-based across the whole view. Runs never
  span collapsed blocks.
- Collapsed block: `<div class="diff-row diff-row-collapsed">1 unchanged line</div>`, or
  `N unchanged lines` for N ≠ 1.
- **Empty state**: when no visible row is changed (identical inputs or both empty):
  `<div class="text-diff text-diff-unified"><div class="diff-empty">No changes</div></div>`.

### 13.3 Split

```html
<div class="text-diff text-diff-split">
  <div class="diff-row diff-row-modified" data-change-index="0">
    <div class="diff-cell diff-cell-old diff-cell-removed" role="group" aria-label="removed line 1"><span class="diff-gutter">1</span><span class="diff-sign" aria-hidden="true">−</span><span class="diff-line"><span>The quick </span><span class="diff-removed">brown</span><span> fox</span></span></div>
    <div class="diff-cell diff-cell-new diff-cell-added" role="group" aria-label="added line 1"><span class="diff-gutter">1</span><span class="diff-sign" aria-hidden="true">+</span><span class="diff-line"><span>The quick </span><span class="diff-added">red</span><span> fox</span></span></div>
  </div>
  <div class="diff-row diff-row-equal">
    <div class="diff-cell diff-cell-old"><span class="diff-gutter">2</span><span class="diff-sign" aria-hidden="true"> </span><span class="diff-line">jumps over</span></div>
    <div class="diff-cell diff-cell-new"><span class="diff-gutter">2</span><span class="diff-sign" aria-hidden="true"> </span><span class="diff-line">jumps over</span></div>
  </div>
  <div class="diff-row diff-row-added" data-change-index="1">
    <div class="diff-cell diff-cell-old diff-cell-empty"></div>
    <div class="diff-cell diff-cell-new diff-cell-added" role="group" aria-label="added line 3"><span class="diff-gutter">3</span><span class="diff-sign" aria-hidden="true">+</span><span class="diff-line">new</span></div>
  </div>
  <div class="diff-row diff-row-collapsed">5 unchanged lines</div>
</div>
```

- Row class `diff-row-equal|modified|removed|added`; each non-collapsed row has exactly two cells,
  old then new.
- Cell: `div.diff-cell.diff-cell-old|new`, plus `diff-cell-removed|added` with `role="group"` and
  `aria-label="removed line N"` / `"added line N"` when changed. A missing side is
  `<div class="diff-cell diff-cell-old diff-cell-empty"></div>` (or `-new`).
- Cell children: `span.diff-gutter` (line number), sign, `span.diff-line`.
- `span.diff-line` contains the escaped text, or, when the cell has `parts`, one span per part:
  `<span>` unchanged, `<span class="diff-removed">` / `<span class="diff-added">` (no
  `data-change-index` on intra-line spans).
- `data-change-index` on the first row of each contiguous run of non-equal rows, as in unified.
- Collapsed block and empty state as in unified, with container `text-diff text-diff-split`.

### 13.4 Stats badge

```html
<div class="text-diff-stats" data-unit="lines"><span class="diff-stat diff-stat-added"><span aria-hidden="true">+3</span><span class="diff-sr">3 lines added</span></span><span class="diff-stat diff-stat-removed"><span aria-hidden="true">−2</span><span class="diff-sr">2 lines removed</span></span><span class="diff-stat diff-stat-unchanged"><span aria-hidden="true">=8</span><span class="diff-sr">8 lines unchanged</span></span><span class="diff-stat diff-stat-similarity">86% similar</span></div>
```

- `data-unit` is `codepoints` or `lines`.
- Visible text `+A`, `−R` (U+2212), `=U`; screen-reader text `N UNIT added|removed|unchanged` where
  UNIT is `line`/`lines` or `character`/`characters` (singular only for N = 1; `0 lines`).
- The similarity span is present only when a similarity is given: `P% similar` with
  `P = floor(similarity * 100 + 0.5)`. (PHP: do **not** use `round()`, whose pre-rounding turns
  28.499999999999996 into 29; JS gives 28.)

### 13.5 HTML view

```html
<div class="text-diff text-diff-html">INNER</div>
```

where INNER is `diffHtml(...).html` (section 12).

## 14. CSS contract

`packages/core/src/style.css` is the canonical stylesheet; each package ships a copy. It styles only
the classes above. Theme it with these custom properties on any ancestor (usually `:root`):

| property | default (light) | used for |
|----------|-----------------|----------|
| `--text-diff-added-bg` | `#ddfbe6` | inline added background, added stat |
| `--text-diff-added-color` | `#008000` | inline added text, added edge |
| `--text-diff-added-decoration` | `none` | inline added text-decoration |
| `--text-diff-removed-bg` | `#fce9e9` | inline removed background, removed stat |
| `--text-diff-removed-color` | `#c70000` | inline removed text, removed edge |
| `--text-diff-removed-decoration` | `line-through` | inline removed text-decoration |
| `--text-diff-line-added-bg` | `#f0fbf3` | added row/cell wash (split, unified) |
| `--text-diff-line-removed-bg` | `#fdf3f3` | removed row/cell wash |
| `--text-diff-gutter-bg` | `transparent` | line-number gutters |
| `--text-diff-gutter-color` | `#8a919e` | line numbers |
| `--text-diff-sign-added-color` | = added color | `+` sign |
| `--text-diff-sign-removed-color` | = removed color | `−` sign |
| `--text-diff-rule-color` | `#e2e5ea` | borders, dividers, empty-cell hatch |
| `--text-diff-collapsed-bg` | `#f4f6f8` | collapsed row |
| `--text-diff-collapsed-color` | `#5b6270` | collapsed row text, neutral stats |
| `--text-diff-empty-color` | `#5b6270` | "No changes" text |
| `--text-diff-font-mono` | system mono stack | split/unified font |
| `--text-diff-current-outline` | `2px solid currentColor` | current change, `:target` anchors |
| `--text-diff-heat-0-bg` | `transparent` | heatmap bucket 0 (unchanged) |
| `--text-diff-heat-1-bg` … `-4-bg` | `#fdf4c8` `#fbe38e` `#f9c27e` `#f59d8f` | heatmap buckets 1–4 |
| `--text-diff-heat-removed-color` | `#8a919e` | removed-sentence markers |
| `--text-diff-move-0` … `-5` | `#6d4fe0` `#0b8aa6` `#b86100` `#c2256d` `#2d5fd6` `#4d7c0f` | move color slots (row tint 9%, sign, link) |
| `--text-diff-minimap-width` | `14px` | minimap strip width |
| `--text-diff-minimap-height` | `100vh` | strip height cap (the strip is `min(this, diff height)`) |
| `--text-diff-minimap-top` | `0px` | sticky offset |
| `--text-diff-minimap-bg` | `#f4f6f8` | strip background |
| `--text-diff-minimap-added` / `-removed` | = added / removed color | marks |
| `--text-diff-minimap-modified` | `#b7791f` | marks for mixed runs |
| `--text-diff-minimap-moved` | = move slot 0 | marks for moves |
| `--text-diff-timeline-active-bg` / `-color` | `#2f3542` / `#ffffff` | checked timeline step |
| `--text-diff-playback-step` | `350ms` | delay between consecutive changes |
| `--text-diff-playback-duration` | `400ms` | per-change animation length |

Dark defaults are opt-in (`data-theme="dark"` or class `dark` on an ancestor, or class
`text-diff-dark`); values set on an ancestor always win over both default sets. The private
`--_td-*` set is defined on `.text-diff`, `.text-diff-stats`, `.text-diff-minimap`,
`.text-diff-timeline` and `.text-diff-playback-wrap`, and the dark selectors cover all five.
No view uses a colored left-border "accent bar". Non-color indicators:
`+`/`−` signs, a 3px inset edge on changed lines, line-through on inline removals, and
`forced-colors` borders. The split view stacks its two sides when its container is narrower than
640px (container query); empty cells and the duplicate new side of equal rows are hidden when stacked.

## 15. Fixture format and how to test against it

`fixtures/<group>.json` is an array of cases:

```json
{ "name": "...", "old": "...", "new": "...", "options": { ... },
  "expected": { "changes": [...], "html": "...", "similarity": 0.95, "stats": {...} } }
```

| group | options | expected | compare |
|-------|---------|----------|---------|
| `chars`, `words`, `wordsWithSpace`, `lines`, `sentences` | text-mode options (section 3) | `changes`, `html` (renderText), `stats` (computeStats) | changes deep-equal; html byte-equal |
| `similarity` | `{}` | `similarity` (html input), `similarityText` (`html: false`), `stats` (words diff of the raw inputs), `html` (renderStats(stats, similarityText)) | similarities within 1e-12; html byte-equal |
| `unified` | line-view options incl. `contextLines` (0 and 3) | `hunks` (buildHunks), `html` (renderUnified), `stats` (lineStats) | all exact |
| `split` | line-view options incl. `contextLines` (0, 1 and 3) | `hunks` (buildSplitRows), `html` (renderSplit), `stats` | all exact |
| `stats` | `{mode}`: a text mode, `unified` (lineStats of buildHunks, default context) or `split` | `stats`, `similarity` (`html: false`), `html` (with similarity), `htmlWithoutSimilarity` | exact |
| `html` | diffHtml options | `html` (renderHtmlDiff), `addedText`, `removedText` (12.4), `fullReplacement`, `similarity?`; case has `mustBeValidHtml: true` | html byte-equal on every platform; similarity within 1e-12 |
| `heatmap` | `ignoreCase?` + render options `showRemoved?`, `legend?`, `anchors?`, `idPrefix?` | `heatmap` (buildHeatmap: `segments`, `exact`), `html` (renderHeatmap) | segments exact except `similarity` (within 1e-12); html byte-equal |
| `moves` | `view` (`unified`/`split`), line-view options with `detectMoves: true`, `idPrefix: "mv"`, optional `minMoveLines`, `moveSimilarity`, `contextLines` | `moves` (buildMoves on the full rows), `hunks`, `html` (renderUnified/renderSplit with the options), `stats` | all exact |
| `minimap` | `view` (a text mode, `unified` or `split`), diff options, `idPrefix: "mm"`, `anchors: true` | `marks` (integers), `minimap` (renderMinimap), `diff` (the anchored view), `html` (renderWithMinimap) | all exact |
| `timeline` | case has **`versions`** (array) instead of `old`/`new`; options `mode?`, `labels?`, diff/line options, `idPrefix: "tl"` | `mode`, `labels`, `steps` (`step`, `fromLabel`, `toLabel`, `stats`, `similarity`), `html` (renderTimeline) | similarity within 1e-12; rest exact |
| `playback` | `mode`, `speed?` (any JSON value), `idPrefix?`, `anchors?` | `changes` (computeDiff with no options), `html` (renderPlayback) | exact |

JSON strings may contain any Unicode (emoji, CJK, `\r`). Optional model fields are omitted, never
null. Regenerate with `npm run fixtures`; CI runs `npm run fixtures:check`, which fails if the
committed fixtures differ from what core produces.

## 16. Platform notes

- **Unsupported everywhere:** jsdiff's `intlSegmenter` (JS-only), `oneChangePerToken`,
  `ignoreNewlineAtEof`, custom comparators, async callbacks, `timeout`.
- **PHP:** needs `ext-mbstring`. Port sections 4–7 literally (greedy forward Myers, common-prefix
  trimming allowed, no suffix trimming). Use the explicit WS class from section 1 everywhere (`trim`,
  word tokenizer, sentence splitter, similarity). Use `strtr` for escaping and
  `floor($s * 100 + 0.5)` for percentages. The HTML engine is ported literally too (section 12).
  A `<details>`-based collapsed row is allowed as an opt-in extra but the default output must be the
  canonical `<div>`.
- **Vue/React:** call `@diff-text/core` (bundled at build time); render the same structure as
  section 13. Navigation (`next()`/`prev()`) targets `[data-change-index="N"]`.
- **Security:** HTML inputs are rendered raw. Callers must sanitize untrusted HTML.
- **Visualizations (17–23), PHP traps:** similarity must be bit-exact (section 8) because the
  heatmap compares it with `>=` against 0.25/0.5/0.75/1 and sums it in the alignment DP; use
  `floor($s * 100 + 0.5)` for percents; minimap positions with `intdiv` only; sort move blocks
  with a comparator on the integer new position (`usort` is not stable in PHP < 8.0, but keys are
  unique here); iterate candidate lists in ascending row order, never over array keys whose order
  you did not build; build strings with `.` in the exact attribute order shown. `Str::lower()`
  (section 1, not bare `mb_strtolower`) for ignoreCase keys.

---

## 17. Visualizations: shared rules

Sections 18–23 add five display-only visualizations. They follow every rule of section 13
(no whitespace between tags, attribute order exactly as shown, the five-character escaping,
U+2212 for minus) and add these:

- **No JavaScript.** Every behavior is static HTML + CSS: anchors (`href="#id"`), CSS-only radio
  and checkbox inputs, and CSS animations. PHP output must be byte-identical to core.
- **Deterministic arithmetic.** Positions are integers computed with integer math (section 21).
  The only floats are similarities (section 8, IEEE double, bit-exact) and sums of them in the
  heatmap alignment (section 20), which are compared, never printed.
- **Stable order.** Every list is ordered by an explicit rule (document order, line number, or the
  scan order written in the pseudo-code). Nothing depends on hash-map iteration order or locale.
- **Opt-in.** Moves (`detectMoves`) and anchors (`anchors`) default to off, so sections 13.1–13.3
  output is unchanged unless they are requested.

## 18. Element ids (idPrefix) and change anchors

Every renderer that can emit an id takes `idPrefix`: a non-empty string, default `"td"` (any
other value, including `""`, means `"td"`). It is escaped like text wherever it is emitted
(`id`, `href`, `name`, `for`). Use something matching `[A-Za-z][A-Za-z0-9_-]*`; renderers do not
validate it.

| id | where | when |
|----|-------|------|
| `{p}-change-{N}` | the element that carries `data-change-index="N"` (text spans, unified rows, split rows, heatmap spans) | `anchors: true` |
| `{p}-move-{M}-from` / `{p}-move-{M}-to` | the move link of the first row of move block M (section 19) | moved rows exist |
| `{p}-rev-{K}` (and `name="{p}-rev"`) | timeline radios (section 22) | always |
| `{p}-replay` | playback checkbox (section 23) | always |

**Anchors.** With `anchors: true` (default false), `id="{p}-change-N"` is inserted **immediately
after `class`**. The full attribute orders become:

- text-mode span: `class`, `id`, `data-change-index` (playback adds `style` last);
- unified row: `class`, `id`, `role`, `aria-label`, `data-move`, `data-change-index`;
- split row: `class`, `id`, `data-move`, `data-change-index`;
- heatmap sentence/removed span: `class`, `data-heat` (sentences only), `id`, `data-change-index`, `title`.

```html
<div class="text-diff text-diff-words"><span>a </span><span class="diff-removed" id="td-change-0" data-change-index="0">b</span><span class="diff-added" id="td-change-1" data-change-index="1">c</span></div>
```

## 19. Moved blocks (unified, split)

Options (line views): `detectMoves` (boolean, default false), `minMoveLines` (default 1; a number
≥ 1 is floored, anything else means 1), `moveSimilarity` (a number strictly between 0 and 1 turns
on near matches with that threshold; anything else, including the default 1, means exact only).

### 19.1 Detection

Input: the full row list of section 9.1 (before collapsing). Output: blocks
`{ "id": 0, "oldStart": 1, "newStart": 6, "lines": 3 }` (1-based line numbers).

```
region[i]: rows are split into change regions = maximal runs of non-equal rows, numbered 0, 1, ...
R = number of removed rows, A = number of added rows
if R * A == 0 or R * A > 1_000_000: return []                  # MOVE_MAX_PAIRS
near = (threshold < 1) and R * A <= 250_000                     # MOVE_MAX_NEAR_PAIRS

norm(row) = trim(collapse(row.text))                            # collapse: every WS run -> " "
            then lowercase() if ignoreCase                       # (section 1 WS, trim, lowercase)
blank(i)  = norm(i) == ""
eq(i, j)  = norm(i) == norm(j)
            or (near and not blank(i) and not blank(j)
                and similarity(norm(i), norm(j), html: false) >= threshold)   # section 8

assigned = all false; found = []
loop:
    best = none; bestLen = 0
    for aj in row indices of added rows, ascending:
        if assigned[aj] or blank(aj): continue
        for ri in row indices of removed rows, ascending:
            if assigned[ri] or region[ri] == region[aj] or not eq(ri, aj): continue
            len = 1
            while rows[ri+len] is removed and rows[aj+len] is added
                  and not assigned[ri+len] and not assigned[aj+len] and eq(ri+len, aj+len):
                len++
            while blank(aj + len - 1): len--                   # never end on a blank line
            if len > bestLen: best = (ri, aj); bestLen = len     # strict: first found wins ties
    if bestLen == 0 or bestLen < minMoveLines: break
    mark rows ri..ri+bestLen-1 and aj..aj+bestLen-1 assigned; found.push(best, bestLen)
sort found by aj ascending; ids 0, 1, 2, ... in that order
block = { id, oldStart: rows[ri].oldNo, newStart: rows[aj].newNo, lines: len }
```

Consequences: blocks are disjoint on both sides; a block never starts or ends with a blank line
(blank lines inside a block are kept), so a blank-only block cannot exist; a line whose only
change is in place (same change region, e.g. re-indented) is never a move; ties go to the
smallest new position, then the smallest old position. For exact mode a port may index removed
rows by `norm` (candidate lists in ascending row order); that gives the same result.

### 19.2 Rows

Each covered removed row becomes
`{ "type": "moved-from", "oldNo": 1, "text": "a", "move": 0, "counterpart": 6 }` and each covered
added row `{ "type": "moved-to", "newNo": 6, "text": "a", "move": 0, "counterpart": 1 }`, where
row k of a block (0-based) pairs old line `oldStart + k` with new line `newStart + k`, and
`counterpart` is the other side's line number. Hunks (9.2) and split pairing (10) then run as usual.

### 19.3 Markup

Color slot: class `diff-move-{M mod 6}`. The sign is `−` for moved-from and `+` for moved-to. The
label is `line L moved to line C` (moved-from; L = old line) or `line L moved from line C`
(moved-to; L = new line). Each moved row ends with a counterpart link; only the **first row of a
block** has the link id. "First row" = a moved row whose previous rendered row (in the same
hunk; a collapsed row resets) is not a row of the same type with the same move id.

Unified (a new fifth child after `diff-line`):

```html
<div class="diff-row diff-row-moved-from diff-move-0" role="group" aria-label="line 1 moved to line 6" data-move="0" data-change-index="0"><span class="diff-gutter diff-gutter-old">1</span><span class="diff-gutter diff-gutter-new"></span><span class="diff-sign" aria-hidden="true">−</span><span class="diff-line">a</span><a class="diff-move-link" id="td-move-0-from" href="#td-move-0-to">moved to line 6</a></div>
<div class="diff-row diff-row-moved-to diff-move-0" role="group" aria-label="line 7 moved from line 2" data-move="0"><span class="diff-gutter diff-gutter-old"></span><span class="diff-gutter diff-gutter-new">7</span><span class="diff-sign" aria-hidden="true">+</span><span class="diff-line">b</span><a class="diff-move-link" href="#td-move-0-from">moved from line 2</a></div>
```

Split (row: `class`, `id`, `data-move`, `data-change-index`; the moved cell carries the label and
the link; the other side is an empty cell):

```html
<div class="diff-row diff-row-moved-from diff-move-0" data-move="0" data-change-index="0"><div class="diff-cell diff-cell-old diff-cell-moved-from" role="group" aria-label="line 1 moved to line 6"><span class="diff-gutter">1</span><span class="diff-sign" aria-hidden="true">−</span><span class="diff-line">a</span><a class="diff-move-link" id="td-move-0-from" href="#td-move-0-to">moved to line 6</a></div><div class="diff-cell diff-cell-new diff-cell-empty"></div></div>
```

`data-change-index` runs (13.2) treat moved rows as changed rows. Link element: `class`, `id`
(first row only), `href`; its text is `moved to line C` / `moved from line C`.

## 20. Rewrite heatmap

`buildHeatmap(old, new, {ignoreCase})` → `{ "segments": [...], "exact": false }`;
`renderHeatmap(heatmap, {showRemoved = true, legend = true, anchors, idPrefix})`.

### 20.1 Algorithm

```
isSentence(t) = t has at least one non-WS code point
newTokens = sentence tokens of new (section 5.5)
O = [t in sentence tokens of old if isSentence(t)];  N = [t in newTokens if isSentence(t)]
key(s) = lowercase(s) if ignoreCase else s
sim(i, j) = similarity(key(O[i]), key(N[j]), html: false)      # section 8, bit-exact double
matches = []                                                     # (oldIndex, newIndex, sim), increasing

1. Prefix/suffix: pre = length of the longest common prefix of O and N under key equality;
   suf = the same for suffixes, over what is left after the prefix. Each such pair is a match
   with sim 1.
2. Middle: n = |O| - pre - suf, m = |N| - pre - suf.
   a. If n > 500 or m > 500 (HEAT_MAX_SENTENCES): exact = true. Run the section 4 algorithm on the
      two arrays of middle keys (tokens = array elements, equality ===, no empty-token removal);
      every unchanged element pair is a match with sim 1.
   b. Else, if n > 0 and m > 0: weighted alignment.
        W[i][j] = sim(pre+i, pre+j) if that is >= 0.5 else NONE        # HEAT_MATCH_THRESHOLD
        D[0][*] = D[*][0] = 0.0
        for i = 1..n, j = 1..m:
            best = D[i-1][j]
            if D[i][j-1] > best: best = D[i][j-1]
            if W[i-1][j-1] != NONE and D[i-1][j-1] + W[i-1][j-1] > best:
                best = D[i-1][j-1] + W[i-1][j-1]
            D[i][j] = best
        backtrack from (n, m) while i > 0 and j > 0:
            if W[i-1][j-1] != NONE and D[i][j] == D[i-1][j-1] + W[i-1][j-1]:
                match (pre+i-1, pre+j-1, W[i-1][j-1]); i--; j--
            else if D[i][j] == D[i-1][j]: i--
            else: j--
3. Runs: walk the matches in order with a final sentinel (|O|, |N|). Between two consecutive
   matches the unmatched old run and new run are paired positionally (k-th with k-th), each pair
   getting sim(oi, nj). Leftovers are removed old sentences / added new sentences.
4. Each new sentence j:
     unpaired  → heat 4, status "added", similarity 0, changed 100 (no "old")
     paired    → heat = heatLevel(s), changed = changedPercent(s), old = O[oi], and
                 status = "unchanged" if heat == 0, "edited" if s >= 0.5, else "rewritten"
   heatLevel(s): s >= 1 → 0; s >= 0.75 → 1; s >= 0.5 → 2; s >= 0.25 → 3; else 4
   changedPercent(s): 0 if s >= 1, else max(1, 100 - floor(s * 100 + 0.5))
5. Removed old sentence oi (neither matched nor positionally paired) is placed immediately before
   the new sentence of the first match (in `matches`, not positional pairs) whose old index is
   > oi, or at the very end if there is none. Several at one place keep old order.
6. Segments: walk newTokens; a non-sentence token becomes {type: "gap", text}; before each
   sentence token emit its removed sentences ({type: "removed", text}), then the sentence
   {type: "sentence", text, heat, status, similarity, changed, old?}. Finally the end removals.
```

Notes for ports:

- Matched pairs (step 2b) always have `s >= 0.5`; positional pairs in step 3 after 2b always have
  `s < 0.5` (otherwise the alignment was not optimal), so "edited" ⇔ heat 1–2 and "rewritten" ⇔
  heat 3–4, except after the exact fallback where a positional pair may land in any bucket.
- Unchanged but not identical sentences exist: whitespace, quote style or tag-only changes give
  similarity 1 (section 8) and heat 0.
- The DP adds doubles in exactly the order written, compares with strict `>`, and the backtrack
  compares with `==` against the very same expression, so both languages reproduce it exactly.
  Do not round, do not use an epsilon, do not reorder the additions.
- **Result-neutral shortcut (optional):** before computing `sim` for a pair, skip it (NONE) when
  `4 * min(a, b) < a + b` or `4 * I < a + b`, where `a`, `b` are the non-WS code-point counts of
  the prepared keys (section 8 `prepare`) and `I` is the multiset intersection, weighted by
  non-WS length, of their `words` tokens after trim. Both are upper bounds on the unchanged count,
  so such pairs are below 0.5 anyway. Core uses it; the fixtures do not depend on it.
- The concatenation of all non-removed segment texts is exactly the new text.

### 20.2 Markup

```html
<div class="text-diff text-diff-heatmap"><div class="diff-heat-text"><span class="diff-heat" data-heat="1" data-change-index="0" title="lightly edited, 12% changed">The cat sat on a mat.<span class="diff-sr"> (lightly edited, 12% changed)</span></span><span> </span><span class="diff-heat-removed" data-change-index="1" title="removed sentence"><span class="diff-sr">removed sentence: </span>It was warm.</span><span class="diff-heat" data-heat="0">The end.</span></div><ul class="diff-heat-legend" aria-label="Heat legend"><li class="diff-heat-key" data-heat="0"><span class="diff-heat-swatch" aria-hidden="true"></span>unchanged (1)</li>…<li class="diff-heat-key diff-heat-key-removed"><span class="diff-heat-swatch" aria-hidden="true"></span>removed (1)</li></ul></div>
```

- gap: `<span>TEXT</span>`.
- heat 0 sentence: `<span class="diff-heat" data-heat="0">TEXT</span>` (no index, no title).
- heat ≥ 1 sentence: `<span class="diff-heat" data-heat="H"[ id="{p}-change-N"] data-change-index="N" title="LABEL">TEXT<span class="diff-sr"> (LABEL)</span></span>`.
- removed (only when `showRemoved`; otherwise skipped without consuming an index):
  `<span class="diff-heat-removed"[ id=…] data-change-index="N" title="removed sentence"><span class="diff-sr">removed sentence: </span>TEXT</span>`.
- N counts heat ≥ 1 sentences and shown removed markers together, 0-based, in document order.
- LABEL: `new sentence` (status added); `rewritten, P% changed` (status rewritten and heat 4);
  otherwise `HEAT_LABELS[heat], P% changed`, with P = `changed`.
  `HEAT_LABELS = ["unchanged", "lightly edited", "edited", "heavily edited", "rewritten or new"]`.
- Legend (unless `legend: false`): one `<li class="diff-heat-key" data-heat="H">` per bucket 0–4
  with text `HEAT_LABELS[H] (COUNT)` (count of sentences in that bucket), then, when
  `showRemoved`, `<li class="diff-heat-key diff-heat-key-removed">` with `removed (COUNT)`
  (count of shown removed markers).
- Both inputs empty: `<div class="text-diff text-diff-heatmap"><div class="diff-heat-text"></div>` + legend + `</div>`.

Heat is never conveyed by color alone: title, screen-reader text, and the legend carry it, and
buckets 3/4 add a dotted/solid underline.

## 21. Change minimap

### 21.1 Positions

All positions are **hundredths of a percent** (integers 0..10000):

```
hundredths(part, total) = 0 if total <= 0
                          else floor((2 * part * 10000 + total) / (2 * total))   # integer division
format(h) = floor(h / 100) + "." + two-digit (h mod 100) + "%"                   # 1250 → "12.50%", 5 → "0.05%"
mark(start, end, total): top = hundredths(start, total); height = hundredths(end, total) - top
```

This is round-half-up of `part / total * 100` to two decimals, done exactly. PHP: `intdiv`;
never `round()` (pre-rounding), `sprintf('%.2f')` or `number_format` (binary floats). JS: the
division of two integers below 2^53 floored with `Math.floor` is exact for totals below ~1e11.
Because `height` is a difference of two rounded values, `top + height <= 10000` always.

**Text modes** (`minimapMarksText(changes)`): `total` = code points of all non-removed changes
(the new text). Walk the changes (skipping empty values) with `offset` = new-text code points so
far. Added change of length L: mark(offset, offset + L), kind `added`, then offset += L. Removed:
mark(offset, offset), kind `removed`. Unchanged: offset += L. Mark N is change index N.

**Line views** (`minimapMarksLines(hunks)`, unified or split, same result for both): `total` =
number of new-side lines (collapsed `count` + rows with `newNo` / split rows with `right`). Walk
the blocks; a *run* is a maximal sequence of non-equal rows inside a visible hunk (a collapsed
block or an equal row ends it) — exactly the runs that get `data-change-index`. For each run:
`start` = new lines before its first row, `lines` = rows in it with a new side; mark(start,
start + lines). Kind: `added` if all rows are added, `removed` if all removed, `moved` if all
are moved-from/moved-to, otherwise `modified`.

### 21.2 Markup

```html
<nav class="text-diff-minimap" aria-label="Change minimap"><a class="diff-minimap-mark diff-minimap-removed" href="#td-change-0" style="top:66.67%;height:0.00%" aria-label="Change 1: removed"></a><a class="diff-minimap-mark diff-minimap-added" href="#td-change-1" style="top:66.67%;height:33.33%" aria-label="Change 2: added"></a></nav>
```

- One `<a>` per mark: `class`, `href="#{p}-change-{N}"`, `style="top:T;height:H"` (no spaces,
  no trailing `;`), `aria-label="Change {N+1}: {kind}"`. No marks: an empty `<nav …></nav>`.
- The diff must be rendered with `anchors: true` and the same idPrefix for the links to land.
- `renderWithMinimap(diffHtml, minimapHtml)` = `<div class="text-diff-with-minimap">` + diff +
  minimap + `</div>`. CSS makes it a two-column grid and the strip `position: sticky` with height
  `min(var(--text-diff-minimap-height, 100vh), 100%)`; zero-height marks get `min-height: 3px`.

## 22. Revision timeline

`buildTimeline(versions, {mode = "words", labels, ...diff/line options})`: `mode` is a text mode,
`unified` or `split` (anything else → `words`). Labels: `labels[i]` when it is a string, else
`v{i+1}`. For each K = 1..len-1 a step diffs `versions[K-1]` → `versions[K]`:
`{step: K, fromLabel, toLabel, stats, similarity, changes | hunks}` with `computeDiff` +
`computeStats` (text modes) or `buildHunks`/`buildSplitRows` + `lineStats`, and
`similarity = similarity(versions[K-1], versions[K], html: false)` (section 8).

`renderTimeline(timeline, {idPrefix, anchors})`:

```html
<div class="text-diff-timeline" role="group" aria-label="Revision timeline"><input class="diff-rev-input" type="radio" name="td-rev" id="td-rev-1"><label class="diff-rev-label" for="td-rev-1">v1 → v2</label><div class="diff-rev-panel" role="group" aria-label="v1 → v2"><div class="diff-rev-caption">v1 → v2</div>STATS DIFF</div><input class="diff-rev-input" type="radio" name="td-rev" id="td-rev-2" checked><label …>v2 → v3</label><div class="diff-rev-panel" …>…</div></div>
```

- Per step, in this order: input, label, panel. Only the **last** input has ` checked` (bare
  boolean attribute; frameworks may render `checked=""`).
- CAPTION = escaped fromLabel + ` → ` (U+2192, one space each side) + escaped toLabel; used as
  label text, panel `aria-label` and caption text.
- STATS = `renderStats(stats, similarity)` (13.4). DIFF = `renderText` / `renderUnified` /
  `renderSplit` with `idPrefix = "{p}-rev-{K}"` (raw prefix; escaped when emitted) and the same
  `anchors`, so ids never collide across panels.
- Fewer than two versions: `<div class="text-diff-timeline" role="group" aria-label="Revision timeline"><div class="diff-empty">Nothing to compare</div></div>`.
- CSS: inputs are visually hidden but focusable (arrow keys move between radios); labels are
  flex `order: 0`, panels `order: 1; flex-basis: 100%; display: none`, and
  `.diff-rev-input:checked + .diff-rev-label + .diff-rev-panel { display: block }`. No ids in CSS.

## 23. Animated playback

`renderPlayback(mode, changes, {idPrefix, speed, anchors})`, text modes only:

```html
<div class="text-diff-playback-wrap"><input class="diff-replay-input" type="checkbox" id="td-replay"><label class="diff-replay" for="td-replay">Replay</label><div class="text-diff text-diff-words text-diff-playback" style="--text-diff-playback-step:200ms"><span>a </span><span class="diff-removed" data-change-index="0" style="--td-i:0">b</span><span class="diff-added" data-change-index="1" style="--td-i:1">c</span></div></div>
```

- The inner div is exactly 13.1's markup plus class `text-diff-playback` and, on every changed span,
  a last attribute `style="--td-i:N"` where N is its `data-change-index`.
- `speed`: if it is a finite number, `ms = floor(speed)`; when `ms >= 1` the inner div gets
  `style="--text-diff-playback-step:{ms}ms"` (after `class`). Otherwise (absent, non-number,
  < 1 after flooring) no style attribute.
- CSS: each changed span animates with `animation-delay: calc(var(--td-i) * var(--text-diff-playback-step, 350ms))`
  and `animation-fill-mode: both`. Removed text starts plain and ends struck through and faded
  (opacity 0.55); added text fades in. **Replay** without JS: the checkbox toggles the
  `animation-name` between two identical keyframe sets (`td-play-*-a` / `td-play-*-b`) via
  `.diff-replay-input:checked ~ .text-diff-playback …`; changing the name restarts every
  animation, so each click replays from the start. (Chosen over `:target`, which scrolls the page
  and needs a unique fragment per replay.)
- `prefers-reduced-motion: reduce`: animations are off, the final (static) state shows at once,
  and the Replay control is hidden.

---

## 24. Testing: what each layer proves

No single layer is trusted on its own; each one answers a different question.

| layer | where | proves | does **not** prove |
|-------|-------|--------|--------------------|
| **Fixtures** | `fixtures/*.json` (`npm run fixtures`), `packages/php/tests/FixturesTest.php`, the Vue/React `fixtureParity` tests | Every port produces the same bytes as core for ~450 cases: a **cross-platform lock**. CI (`fixtures:check`) also catches any unreviewed change of core's output. | That core is right. The fixtures are generated from core, so a core bug is faithfully locked in (the old split column did exactly that). |
| **jsdiff parity** | `packages/php/tests/data/generate-jsdiff-cases.cjs` → `jsdiff-cases.php`, `JsdiffParityTest.php` | The PHP text engine against an **independent oracle**: jsdiff v8 itself (tokens, change lists, tie-breaking, maxEditLength fallbacks with jsdiff's token counts, three ~2500-character unrelated pairs with over 1024 edits), `String.prototype.toLowerCase()` (400 case-folding strings, Final_Sigma contexts) and WHATWG `TextDecoder` (300 invalid UTF-8 byte strings). | Anything above the text engine (line views, HTML, visualizations): those rely on fixtures plus properties. |
| **Property tests** | `packages/core/src/__tests__/properties.test.ts` (fast-check, fixed seed), `packages/php/tests/PropertiesTest.php` and `MyersTest.php` (seeded) | Invariants of this document checked against oracles that do not reuse the code under test: reconstruction of both inputs (section 2), token counts, code-point stats, **minimality against an LCS dynamic program** in every mode with and without ignoreCase, similarity range and identity, hunk invariants (9.2), rows = split lines (9.1), split order and line stats, split parts reproduce each cell (10), rendered markup round trip and change indexes (13), moves undo to the plain rows, the heatmap keeps the new text and uses each old sentence once, one minimap mark per change index. | Exact expected values: a property can hold for a wrong but consistent answer. |
| **Goldens** | `packages/core/src/__tests__/boundaries.test.ts`, `packages/php/tests/BoundariesTest.php` | **Hand-verified** boundary values, each with a comment saying why it is right: the 1000/1001 code-point intra-line bound (and an emoji line), exactly 0.3 similarity, maxEditLength 0 / exact / fractional / negative, contextLines −1 / NaN / `'2'` / 1.7 / Infinity, identical one-line input, split at context 0, whitespace-only and ignoreCase intra-line parts, html vs text similarity, similarity direction, ill-formed input, case folding. | Coverage of the general case (that is the properties' job). |

When the PHP Myers engine dropped jsdiff's two unreachable branches (the proof is in
`Myers::forward()`), it was also compared with jsdiff exhaustively: every pair of binary strings up
to length 8 and ternary strings up to length 5, plus random pairs up to 3000 tokens, all identical.
Mutation testing (Stryker for core, Infection for PHP) is run on demand to find assertions that
are missing: a surviving mutant is either given a test or documented as equivalent.
