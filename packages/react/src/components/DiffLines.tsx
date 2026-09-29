import { createTextDiff, type TextDiffComponent, type TextDiffProps } from './createTextDiff';

export type DiffLinesProps = TextDiffProps;

/** `lines` diff. Options: ignoreCase, maxEditLength, ignoreWhitespace, newlineIsToken, stripTrailingCr. */
const DiffLines: TextDiffComponent = createTextDiff('lines', 'DiffLines');

export default DiffLines;
