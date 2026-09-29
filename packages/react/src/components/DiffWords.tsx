import { createTextDiff, type TextDiffComponent, type TextDiffProps } from './createTextDiff';

export type DiffWordsProps = TextDiffProps;

/** `words` diff. Options: ignoreCase, maxEditLength. */
const DiffWords: TextDiffComponent = createTextDiff('words', 'DiffWords');

export default DiffWords;
