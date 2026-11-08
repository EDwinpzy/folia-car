import { describe, expect, it } from 'vitest';
import { resolveTvTouchGesture } from '../../../src/tv/model/tvTouchGesture';

describe('car touch gestures', () => {
    it('uses a short horizontal swipe for track changes', () => {
        expect(resolveTvTouchGesture(-120, 18)).toBe('next');
        expect(resolveTvTouchGesture(120, -18)).toBe('previous');
    });

    it('treats a short movement as a tap', () => {
        expect(resolveTvTouchGesture(8, 5)).toBe('tap');
        expect(resolveTvTouchGesture(-10, -8)).toBe('tap');
    });

    it('ignores vertical drags and movement too short for a deliberate swipe', () => {
        expect(resolveTvTouchGesture(26, 90)).toBe(null);
        expect(resolveTvTouchGesture(60, 8)).toBe(null);
        expect(resolveTvTouchGesture(150, 130)).toBe(null);
    });
});
