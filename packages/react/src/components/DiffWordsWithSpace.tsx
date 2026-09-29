import { createTextDiff, type TextDiffComponent, type TextDiffProps } from './createTextDiff';

export type DiffWordsWithSpaceProps = TextDiffProps;

/** `wordsWithSpace` diff. Options: ignoreCase, maxEditLength. */
const DiffWordsWithSpace: TextDiffComponent = createTextDiff('wordsWithSpace', 'DiffWordsWithSpace');

export default DiffWordsWithSpace;
