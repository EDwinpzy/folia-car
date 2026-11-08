// src/tv/model/tvCarRecentPlays.ts

import type { SongResult } from '../../types';
import { getPlaybackSongKey } from '../../utils/appPlaybackGuards';

export type TvRecentPlay = {
    song: SongResult;
    at: number;
};

export const resolveTvCarRecentAccountId = (
    userId: string | number | null | undefined,
): string => String(userId ?? '');

export const findTvCarRecentSongIndex = (
    songs: readonly SongResult[],
    song: SongResult,
): number => {
    const key = getPlaybackSongKey(song);
    return songs.findIndex(candidate => getPlaybackSongKey(candidate) === key);
};

export const mergeTvCarRecentPlays = (
    lists: readonly (readonly TvRecentPlay[])[],
    limit: number,
): SongResult[] => {
    if (limit <= 0) return [];
    const newestBySong = new Map<string, TvRecentPlay>();
    for (const records of lists) {
        for (const record of records) {
            const key = getPlaybackSongKey(record.song);
            const current = newestBySong.get(key);
            if (!current || record.at > current.at) newestBySong.set(key, record);
        }
    }
    return [...newestBySong.values()]
        .sort((left, right) => right.at - left.at)
        .slice(0, limit)
        .map(record => record.song);
};
