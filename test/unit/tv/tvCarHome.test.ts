import { describe, expect, it } from 'vitest';
import {
    CAR_HOME_ROW_SIZE,
    selectTvCarQueueWindow,
} from '../../../src/tv/model/tvCarHome';

describe('car home rows', () => {
    it('keeps a short queue intact', () => {
        expect(selectTvCarQueueWindow(['a', 'b'], 1)).toEqual({
            startIndex: 0,
            songs: ['a', 'b'],
        });
    });

    it('caps a long queue around the current track', () => {
        const queue = Array.from({ length: 1_000 }, (_, index) => index);
        const window = selectTvCarQueueWindow(queue, 500);

        expect(window.songs).toHaveLength(CAR_HOME_ROW_SIZE);
        expect(window.songs[Math.floor(CAR_HOME_ROW_SIZE / 2)]).toBe(500);
        expect(window.startIndex).toBe(493);
    });

    it('clamps the window at both ends of the queue', () => {
        const queue = Array.from({ length: 100 }, (_, index) => index);

        expect(selectTvCarQueueWindow(queue, 0)).toEqual({
            startIndex: 0,
            songs: queue.slice(0, CAR_HOME_ROW_SIZE),
        });
        expect(selectTvCarQueueWindow(queue, 99)).toEqual({
            startIndex: 86,
            songs: queue.slice(86),
        });
    });
});
