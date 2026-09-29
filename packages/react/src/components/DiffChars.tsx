import { createTextDiff, type TextDiffComponent, type TextDiffProps } from './createTextDiff';

export type DiffCharsProps = TextDiffProps;

/** `chars` diff. Options: ignoreCase, maxEditLength. */
const DiffChars: TextDiffComponent = createTextDiff('chars', 'DiffChars');

export default DiffChars;
