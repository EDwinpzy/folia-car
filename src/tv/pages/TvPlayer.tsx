// src/tv/pages/TvPlayer.tsx

import { useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useVisualizerBackgroundConfig } from '../../components/visualizer/useVisualizerBackgroundConfig';
import {
    getSongAlbumLabel,
    getSongArtistLabel,
} from '../../services/onlineMusic/songMetadata';
import { TvBackdrop } from '../components/TvBackdrop';
import { TvControlDock } from '../components/TvControlDock';
import { TvLyricStage } from '../components/TvLyricStage';
import { TvVisualizerStage } from '../components/TvVisualizerStage';
import { useTvAudioAnalyser } from '../hooks/useTvAudioAnalyser';
import type { TvPlayerModel } from '../model/tvTypes';
import { resolveTvVisualTheme } from '../model/tvVisualTheme';
import { resolveTvTouchGesture } from '../model/tvTouchGesture';
import { resolveTvSongCoverUrl, TV_COVER_SIZE } from '../services/tvPlaybackSource';

export const TvPlayer = ({
    player,
    controlsOpen,
    constrained,
    isCar = false,
    onOpenQueue,
    onOpenEffects,
    onRevealControls,
    inert,
}: {
    player: TvPlayerModel;
    controlsOpen: boolean;
    constrained: boolean;
    isCar?: boolean;
    onOpenQueue: () => void;
    onOpenEffects?: () => void;
    onRevealControls: () => void;
    inert: boolean;
}) => {
    const { t } = useTranslation();
    const touchStartRef = useRef<{
        pointerId: number;
        x: number;
        y: number;
        startedOnControl: boolean;
    } | null>(null);
    const song = player.currentSong;
    const coverUrl = resolveTvSongCoverUrl(song, TV_COVER_SIZE.backdrop);
    const artist = song ? getSongArtistLabel(song) : '';
    const album = song ? getSongAlbumLabel(song) : '';
    const statusLabel = player.status === 'loading'
        ? t('tv.player.loading')
        : player.status === 'error'
            ? t('tv.player.playbackFailed')
            : null;
    const theme = useMemo(() => resolveTvVisualTheme(constrained), [constrained]);
    const audio = useTvAudioAnalyser(player.audioRef, player.status);
    const sharedBackgroundConfig = useVisualizerBackgroundConfig();
    const urlBackgroundAvailable = sharedBackgroundConfig.url?.items?.some(item => (
        item.id === sharedBackgroundConfig.url?.selectedId
        && Boolean(item.url?.trim())
    )) ?? false;
    const backgroundMode = player.backgroundMode === 'url' && !urlBackgroundAvailable
        ? 'common'
        : player.backgroundMode;
    const backgroundConfig = useMemo(() => ({
        ...sharedBackgroundConfig,
        mode: backgroundMode,
        transparent: false,
    }), [backgroundMode, sharedBackgroundConfig]);
    const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!isCar) {
            onRevealControls();
            return;
        }
        if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
        const target = event.target instanceof Element ? event.target : null;
        touchStartRef.current = {
            pointerId: event.pointerId,
            x: event.clientX,
            y: event.clientY,
            startedOnControl: Boolean(target?.closest(
                'button, a, input, select, textarea, [role="dialog"]',
            )),
        };
        onRevealControls();
    };
    const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!isCar) return;
        const start = touchStartRef.current;
        touchStartRef.current = null;
        if (!start || start.pointerId !== event.pointerId || start.startedOnControl) return;
        const gesture = resolveTvTouchGesture(
            event.clientX - start.x,
            event.clientY - start.y,
        );
        if (gesture === 'next') {
            player.next();
            onRevealControls();
        } else if (gesture === 'previous') {
            player.skipPrevious();
            onRevealControls();
        } else if (gesture === 'tap') {
            onRevealControls();
        }
    };
    const handlePointerCancel = () => {
        touchStartRef.current = null;
    };

    return (
        <div
            id="tv-layer-player"
            data-tv-layer="player"
            data-tv-player-chrome={controlsOpen ? 'visible' : 'hidden'}
            className="tv-page tv-player-page"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
            inert={inert || undefined}
        >
            <TvBackdrop
                config={backgroundConfig}
                theme={theme}
                coverUrl={coverUrl}
                seed={song?.id}
                audioPower={audio.audioPower}
                audioBands={audio.audioBands}
                paused={player.status !== 'playing'}
                staticMode={constrained}
            />
            {controlsOpen && (
                <header className="tv-player-header" data-tv-player-chrome-part="header">
                    <div className="tv-player-song">
                        <strong>{song?.name || t('tv.player.noSong')}</strong>
                        <small>{[artist, album].filter(Boolean).join(' · ') || t('tv.home.chooseSong')}</small>
                    </div>
                    {statusLabel && (
                        <div className="tv-player-mode tv-player-status" aria-live="polite">
                            <em className={player.status === 'error' ? 'is-error' : undefined}>
                                {statusLabel}
                            </em>
                        </div>
                    )}
                </header>
            )}
            {song && player.lyrics && player.lyrics.lines.length > 0 && player.status !== 'error' ? (
                <TvVisualizerStage
                    key={song.id}
                    song={song}
                    lyrics={player.lyrics}
                    status={player.status}
                    visualizerMode={player.visualizerMode}
                    theme={theme}
                    audioPower={audio.audioPower}
                    audioBands={audio.audioBands}
                    constrained={constrained}
                    currentTime={player.currentTime}
                    isPlayerChromeHidden={!controlsOpen}
                />
            ) : (
                <TvLyricStage
                    song={song}
                    lyrics={player.lyrics}
                    status={player.status}
                    isLyricsLoading={player.isLyricsLoading}
                    currentTime={player.currentTime}
                />
            )}
            {controlsOpen && (
                <TvControlDock
                    player={player}
                    constrained={constrained}
                    onOpenQueue={onOpenQueue}
                    onOpenEffects={onOpenEffects}
                    onPrevious={isCar ? player.skipPrevious : player.previous}
                />
            )}
        </div>
    );
};
