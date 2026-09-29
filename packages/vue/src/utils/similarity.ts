import { diffWords } from 'diff'
import { normalizeQuotes } from './normalizeHtml'

/**
 * Compute text similarity (0-1) based on diff-aligned word matching.
 * Uses Dice coefficient: 2 * unchanged_chars / (old_length + new_length)
 */
export function computeTextSimilarity(oldText: string, newText: string): number {
  const stripHtml = (text: string) => text.replace(/<[^>]*>/g, ' ').trim()
  const cleanOld = normalizeQuotes(stripHtml(oldText))
  const cleanNew = normalizeQuotes(stripHtml(newText))

  if (!cleanOld && !cleanNew) return 1
  if (!cleanOld || !cleanNew) return 0

  const changes = diffWords(cleanOld, cleanNew)
  let unchangedLength = 0
  for (const change of changes) {
    if (!change.added && !change.removed) {
      unchangedLength += change.value.length
    }
  }

  return (2 * unchangedLength) / (cleanOld.length + cleanNew.length)
}
