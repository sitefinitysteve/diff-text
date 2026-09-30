import { describe, expect, it } from 'vitest';
import { computeDiff } from '../computeDiff';
import { playbackStep, renderPlayback } from '../playback';

describe('playback', () => {
  it('adds a sequence number to each changed span and a replay toggle', () => {
    const html = renderPlayback('words', computeDiff('words', 'a b', 'a c'), { idPrefix: 'p', speed: 200 });
    expect(html).toBe(
      '<div class="text-diff-playback-wrap"><input class="diff-replay-input" type="checkbox" id="p-replay">' +
        '<label class="diff-replay" for="p-replay">Replay</label>' +
        '<div class="text-diff text-diff-words text-diff-playback" style="--text-diff-playback-step:200ms">' +
        '<span>a </span><span class="diff-removed" data-change-index="0" style="--td-i:0">b</span>' +
        '<span class="diff-added" data-change-index="1" style="--td-i:1">c</span></div></div>',
    );
  });

  it('floors speed and ignores invalid values', () => {
    expect(playbackStep(250.9)).toBe(250);
    expect(playbackStep(0)).toBeNull();
    expect(playbackStep(0.5)).toBeNull();
    expect(playbackStep(-3)).toBeNull();
    expect(playbackStep('300')).toBeNull();
    expect(playbackStep(Infinity)).toBeNull();
  });

  it('accepts exactly 1 ms', () => {
    expect(playbackStep(1)).toBe(1);
    expect(playbackStep(1.99)).toBe(1);
  });
});
