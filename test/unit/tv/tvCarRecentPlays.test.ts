import { describe, expect, it } from 'vitest';
import type { SongResult } from '../../../src/types';
import {
    findTvCarRecentSongIndex,
    mergeTvCarRecentPlays,
    type TvRecentPlay,
} from '../../../src/tv/model/tvCarRecentPlays';

const song = (id: number, sourceRef?: SongResult['sourceRef']): SongResult => ({
    id,
    name: `Song ${id}`,
    artists: [{ id, name: `Artist ${id}` }],
    album: { id, name: `Album ${id}` },
    durationMs: 180000,
    sourceRef: sourceRef ?? { kind: 'online', providerId: 'netease', mediaId: String(id) },
});

const record = (value: SongResult, at: number): TvRecentPlay => ({ song: value, at });

describe('mergeTvCarRecentPlays', () => {
    it('finds the exact playable song in a mixed local and online list', () => {
        const local = song(7, { kind: 'local', mediaId: 'local-7' });
        const online = song(7, { kind: 'online', providerId: 'netease', mediaId: '7' });
        const songs = [online, local];

        expect(findTvCarRecentSongIndex(songs, local)).toBe(1);
        expect(findTvCarRecentSongIndex(songs, online)).toBe(0);
        expect(findTvCarRecentSongIndex(songs, song(8))).toBe(-1);
    });

    it('merges local and online history newest first', () => {
        const local = song(1, { kind: 'local', mediaId: 'local-1' });
        const online = song(2);
        expect(mergeTvCarRecentPlays([
            [record(local, 100), record(online, 300)],
            [record(song(3), 200)],
        ], 10).map(item => item.id)).toEqual([2, 3, 1]);
    });

    it('keeps the newest occurrence of the same playable song', () => {
        const current = song(7);
        const olderCopy = { ...current, name: 'Old title' };
        const newestCopy = { ...current, name: 'New title' };
        expect(mergeTvCarRecentPlays([
            [record(olderCopy, 100)],
            [record(newestCopy, 200)],
        ], 10)[0].name).toBe('New title');
    });

    it('limits the merged list and handles empty history', () => {
        expect(mergeTvCarRecentPlays([], 14)).toEqual([]);
        expect(mergeTvCarRecentPlays([
            [record(song(1), 300), record(song(2), 200)],
        ], 1).map(item => item.id)).toEqual([1]);
        expect(mergeTvCarRecentPlays([[record(song(1), 300)]], 0)).toEqual([]);
    });

    it('does not mutate either source list', () => {
        const first = [record(song(1), 100)];
        const second = [record(song(2), 200)];
        mergeTvCarRecentPlays([first, second], 10);
        expect(first.map(item => item.song.id)).toEqual([1]);
        expect(second.map(item => item.song.id)).toEqual([2]);
    });
});
