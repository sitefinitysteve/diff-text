import { createTextDiff, type TextDiffComponent, type TextDiffProps } from './createTextDiff';

export type DiffSentencesProps = TextDiffProps;

/** `sentences` diff. Options: ignoreCase, maxEditLength. */
const DiffSentences: TextDiffComponent = createTextDiff('sentences', 'DiffSentences');

export default DiffSentences;
