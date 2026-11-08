import type { RefObject } from 'react';
import { useRecentPlaysRecorder } from '../../components/app/home/explore/useRecentPlaysRecorder';
import type { SongResult } from '../../types';

// src/tv/components/TvCarRecentPlaysRecorder.tsx
// Connects the car's TV playback deck to Folia's shared recent-play history.

export const TvCarRecentPlaysRecorder = ({
    audioRef,
    currentSong,
}: {
    audioRef: RefObject<HTMLAudioElement | null>;
    currentSong: SongResult | null;
}) => {
    useRecentPlaysRecorder({
        audioRef,
        currentSong,
        activeDeck: 'car-audio',
    });
    return null;
};
