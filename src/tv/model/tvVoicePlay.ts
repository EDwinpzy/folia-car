import { isSongUnavailable } from '../../services/onlineMusic/songAvailability';
import type { SongResult } from '../../types';

// src/tv/model/tvVoicePlay.ts

export type TvVoicePlayQueue = {
    songs: SongResult[];
    startIndex: number;
};

const normalize = (value: string): string => (
    value.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '')
);

/**
 * Keeps unavailable rows out of a voice-started queue and prefers an exact title match over the
 * provider's first suggestion. Ties keep search order.
 */
export const selectTvVoicePlayQueue = (
    songs: SongResult[],
    query: string,
): TvVoicePlayQueue | null => {
    const playable = songs.filter(song => !isSongUnavailable(song));
    if (playable.length === 0) return null;

    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return { songs: playable, startIndex: 0 };

    let startIndex = 0;
    let bestScore = -1;
    playable.forEach((song, index) => {
        const title = normalize(song.name);
        const artist = normalize(song.artists.map(item => item.name).join(' '));
        const score = title === normalizedQuery
            ? 4
            : title.startsWith(normalizedQuery)
                ? 3
                : title.includes(normalizedQuery)
                    ? 2
                    : artist.includes(normalizedQuery)
                        ? 1
                        : 0;
        if (score > bestScore) {
            bestScore = score;
            startIndex = index;
        }
    });

    return { songs: playable, startIndex };
};
