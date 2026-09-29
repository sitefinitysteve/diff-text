import DiffChars from './components/DiffChars.vue';
import DiffWords from './components/DiffWords.vue';
import DiffWordsWithSpace from './components/DiffWordsWithSpace.vue';
import DiffLines from './components/DiffLines.vue';
import DiffSentences from './components/DiffSentences.vue';
import DiffHtml from './components/DiffHtml.vue';

// Export all components
export {
  DiffChars,
  DiffWords,
  DiffWordsWithSpace,
  DiffLines,
  DiffSentences,
  DiffHtml,
};

// For backward compatibility, export DiffWordsWithSpace as TextDiff
export { DiffWordsWithSpace as TextDiff };
