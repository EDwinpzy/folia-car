import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    noteSongPlayed,
    recentPlayRecordsOf,
    resetRecentPlays,
} from '../../../src/components/app/home/explore/recentPlays';
import type { SongResult } from '../../../src/types';
import { resolveTvCarRecentAccountId } from '../../../src/tv/model/tvCarRecentPlays';

const guestSong: SongResult = {
    id: 71,
    name: 'Guest song',
    artists: [],
    album: { id: 0, name: '' },
    durationMs: 180000,
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: '71' },
};

describe('car recent-play scopes', () => {
    beforeEach(() => {
        const entries = new Map<string, string>();
        vi.stubGlobal('localStorage', {
            getItem: (key: string) => entries.get(String(key)) ?? null,
            setItem: (key: string, value: string) => entries.set(String(key), String(value)),
            removeItem: (key: string) => entries.delete(String(key)),
            clear: () => entries.clear(),
            key: (index: number) => [...entries.keys()][index] ?? null,
            get length() {
                return entries.size;
            },
        });
        resetRecentPlays();
    });

    afterEach(() => {
        resetRecentPlays();
        vi.unstubAllGlobals();
    });

    it('reads the guest online scope when nobody is signed in', () => {
        const accountId = resolveTvCarRecentAccountId(null);
        noteSongPlayed(guestSong, accountId);

        expect(accountId).toBe('');
        expect(recentPlayRecordsOf({
            kind: 'online',
            providerId: 'netease',
            accountId,
        }).map(record => record.song.id)).toEqual([71]);
    });

    it('keeps signed-in history under that account', () => {
        expect(resolveTvCarRecentAccountId('profile-9')).toBe('profile-9');
    });
});
