// src/tv/model/tvTouchGesture.ts

const MIN_SWIPE_PX = 72;
const MAX_TAP_PX = 16;
const HORIZONTAL_DOMINANCE = 1.25;

export type TvTouchGesture = 'previous' | 'next' | 'tap' | null;

/** Resolves a car touch gesture from the distance travelled after pointer down. */
export const resolveTvTouchGesture = (deltaX: number, deltaY: number): TvTouchGesture => {
    const horizontal = Math.abs(deltaX);
    const vertical = Math.abs(deltaY);
    if (horizontal >= MIN_SWIPE_PX && horizontal > vertical * HORIZONTAL_DOMINANCE) {
        return deltaX < 0 ? 'next' : 'previous';
    }
    if (Math.hypot(deltaX, deltaY) <= MAX_TAP_PX) return 'tap';
    return null;
};
