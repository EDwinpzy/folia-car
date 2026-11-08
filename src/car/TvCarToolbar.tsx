// src/car/TvCarToolbar.tsx

import { motion, useMotionValueEvent, useTransform } from 'framer-motion';
import {
    ListMusic,
    Music2,
    Pause,
    Play,
    SkipBack,
    SkipForward,
} from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getSongArtistLabel } from '../services/onlineMusic/songMetadata';
import { formatTvTime } from '../tv/model/tvLyricFill';
import type { TvPlayerModel } from '../tv/model/tvTypes';
import { resolveTvSongCoverUrl, TV_COVER_SIZE } from '../tv/services/tvPlaybackSource';

export const TvCarToolbar = ({
    player,
    onActivateHero,
    onOpenPlayer,
    onOpenQueue,
}: {
    player: TvPlayerModel;
    onActivateHero: () => void;
    onOpenPlayer: () => void;
    onOpenQueue: () => void;
}) => {
    const { t } = useTranslation();
    const song = player.currentSong;
    const coverUrl = resolveTvSongCoverUrl(song, TV_COVER_SIZE.row);
    const isPlaying = player.status === 'playing';
    const transportLabel = isPlaying ? t('tv.player.pause') : t('tv.player.play');
    const statusMessage = player.status === 'loading' ? t('tv.car.preparing') : null;
    const elapsedLabelRef = useRef<HTMLSpanElement>(null);
    const remainingLabelRef = useRef<HTMLSpanElement>(null);
    const lastClockSecondRef = useRef(Number.NaN);
    const progress = useTransform(
        player.currentTime,
        time => (player.duration > 0 ? Math.max(0, Math.min(1, time / player.duration)) : 0),
    );
    const progressKnobLeft = useTransform(progress, value => `${value * 100}%`);
    const writeClock = useCallback((time: number) => {
        const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
        const currentSecond = Math.floor(safeTime);
        if (currentSecond === lastClockSecondRef.current) return;
        lastClockSecondRef.current = currentSecond;
        if (elapsedLabelRef.current) {
            elapsedLabelRef.current.textContent = formatTvTime(safeTime);
        }
        if (remainingLabelRef.current) {
            remainingLabelRef.current.textContent = `-${formatTvTime(
                Math.max(0, player.duration - safeTime),
            )}`;
        }
    }, [player.duration]);

    useMotionValueEvent(player.currentTime, 'change', writeClock);
    useEffect(() => {
        lastClockSecondRef.current = Number.NaN;
        writeClock(player.currentTime.get());
    }, [player.currentTime, writeClock]);

    const togglePlayback = () => {
        if (song) player.togglePlayback();
        else onActivateHero();
    };

    return (
        <section id="tv-layer-car-console" className="tv-car-console" aria-label={t('tv.car.title')}>
            <div className="tv-car-console-body">
                <button
                    type="button"
                    className="tv-car-now-playing"
                    data-tv-focusable="true"
                    data-tv-focus-key="car-open-player"
                    onClick={onOpenPlayer}
                >
                    <span className="tv-car-art">
                        {coverUrl
                            ? <img src={coverUrl} alt="" loading="eager" decoding="async" />
                            : <Music2 size={34} />}
                    </span>
                    <span className="tv-car-now-content">
                        <span className="tv-car-now-copy">
                            <strong>{song?.name || t('tv.car.noSong')}</strong>
                            <span>{song ? getSongArtistLabel(song) : t('tv.car.noSongHint')}</span>
                        </span>
                        <span className="tv-car-console-progress" aria-hidden="true">
                            <span className="tv-car-progress-rail">
                                <motion.i style={{ scaleX: progress }} />
                                <motion.span
                                    className="tv-car-progress-knob"
                                    style={{ left: progressKnobLeft }}
                                />
                            </span>
                            <span className="tv-car-progress-meta">
                                <span ref={elapsedLabelRef}>
                                    {formatTvTime(player.currentTime.get())}
                                </span>
                                <span ref={remainingLabelRef}>
                                    -{formatTvTime(Math.max(
                                        0,
                                        player.duration - player.currentTime.get(),
                                    ))}
                                </span>
                            </span>
                        </span>
                    </span>
                </button>
                <div className="tv-car-transport">
                    <button
                        type="button"
                        data-tv-focusable="true"
                        data-tv-focus-key="car-previous"
                        onClick={player.skipPrevious}
                        aria-label={t('tv.player.previous')}
                    >
                        <SkipBack size={28} fill="currentColor" />
                    </button>
                    <button
                        type="button"
                        className="is-primary"
                        data-tv-focusable="true"
                        data-tv-focus-key="car-play"
                        onClick={togglePlayback}
                        aria-label={transportLabel}
                    >
                        {isPlaying
                            ? <Pause size={34} fill="currentColor" />
                            : <Play size={34} fill="currentColor" />}
                    </button>
                    <button
                        type="button"
                        data-tv-focusable="true"
                        data-tv-focus-key="car-next"
                        onClick={player.next}
                        aria-label={t('tv.player.next')}
                    >
                        <SkipForward size={28} fill="currentColor" />
                    </button>
                </div>
                <button
                    type="button"
                    className="tv-car-queue"
                    data-tv-focusable="true"
                    data-tv-focus-key="car-open-queue"
                    onClick={onOpenQueue}
                    aria-label={t('tv.player.queue')}
                >
                    <ListMusic size={26} />
                </button>
            </div>
            {statusMessage && (
                <footer className="tv-car-console-footer">
                    <span className="tv-car-console-status" aria-live="polite">
                        {statusMessage}
                    </span>
                </footer>
            )}
        </section>
    );
};
