/**
 * Animated playback (SPEC section 23): the text-mode view with a CSS animation
 * delay per change and a CSS-only "Replay" toggle. No JavaScript.
 */
import { escapeHtml, idPrefixOf, modeClass, renderTextSpans } from './render';
import type { Change, RenderOptions, TextMode } from './types';

export interface PlaybackOptions extends RenderOptions {
  /** Milliseconds between consecutive changes; overrides --text-diff-playback-step. */
  speed?: number;
}

/** speed → integer milliseconds, or null when absent/invalid (< 1 after flooring). */
export function playbackStep(speed: unknown): number | null {
  if (typeof speed !== 'number' || !Number.isFinite(speed)) return null;
  const ms = Math.floor(speed);
  return ms >= 1 ? ms : null;
}

export function renderPlayback(mode: TextMode, changes: Change[], options: PlaybackOptions = {}): string {
  const p = escapeHtml(idPrefixOf(options));
  const step = playbackStep(options.speed);
  const style = step === null ? '' : ` style="--text-diff-playback-step:${step}ms"`;
  return (
    '<div class="text-diff-playback-wrap">' +
    `<input class="diff-replay-input" type="checkbox" id="${p}-replay">` +
    `<label class="diff-replay" for="${p}-replay">Replay</label>` +
    `<div class="text-diff ${modeClass(mode)} text-diff-playback"${style}>` +
    renderTextSpans(changes, options, (i) => ` style="--td-i:${i}"`) +
    '</div></div>'
  );
}
