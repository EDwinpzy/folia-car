// src/tv/hooks/useTvNativePlayback.ts

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TvPlayerModel } from '../model/tvTypes';
import {
    buildTvNativePlaybackIdentity,
    buildTvNativePlaybackPayload,
    loadTvNativePlaybackPlugin,
    resolveTvNativeMediaActionForTarget,
    type TvNativePlaybackPlugin,
} from '../services/tvNativePlayback';

export type TvNativePlaybackController = {
    available: boolean;
    canBackground: boolean;
    canExit: boolean;
    moveToBackground: () => Promise<boolean>;
    exitApp: () => Promise<boolean>;
};

/**
 * Keeps Android's MediaSession and foreground service in sync with TV's own queue.
 *
 * The phone bridge reads a different Zustand store, so TV needs a separate snapshot source.
 * Position is only pushed on real state changes (play/pause/seek/track), which avoids restarting
 * a foreground service from the background every second on Android 12+.
 */
export const useTvNativePlayback = (
    player: TvPlayerModel,
    launchTarget: 'tv' | 'car' = 'tv',
): TvNativePlaybackController => {
    const [plugin, setPlugin] = useState<TvNativePlaybackPlugin | null>(null);
    const [foregroundRevision, setForegroundRevision] = useState(0);
    const lastIdentityRef = useRef('');
    const actionLockRef = useRef<'background' | 'exit' | null>(null);
    const exitRequestedRef = useRef(false);

    const {
        audioRef,
        currentSong,
        queue,
        status,
        duration,
        positionRevision,
        currentTime,
        playQueue,
        resumeCurrent,
        pause,
        togglePlayback,
        next,
        previous,
        skipPrevious,
        seekTo,
    } = player;

    useEffect(() => {
        let disposed = false;
        void loadTvNativePlaybackPlugin().then(resolved => {
            if (!disposed) setPlugin(resolved);
        });
        return () => {
            disposed = true;
        };
    }, []);

    useEffect(() => {
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                setForegroundRevision(revision => revision + 1);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        return () => document.removeEventListener('visibilitychange', handleVisibility);
    }, []);

    useEffect(() => {
        if (!plugin || exitRequestedRef.current) return;
        const audioPosition = audioRef.current?.currentTime;
        const positionSeconds = typeof audioPosition === 'number' && Number.isFinite(audioPosition)
            ? audioPosition
            : currentTime.get();
        const payload = buildTvNativePlaybackPayload({
            song: currentSong,
            queue,
            status,
            positionSeconds,
            durationSeconds: duration,
            launchTarget: launchTarget === 'car' ? 'car' : 'tv',
        });

        if (!payload) {
            if (lastIdentityRef.current) {
                lastIdentityRef.current = '';
                void plugin.clearPlaybackState().catch(() => undefined);
            }
            return;
        }

        const identity = buildTvNativePlaybackIdentity(payload);
        if (identity === lastIdentityRef.current) return;
        lastIdentityRef.current = identity;
        void plugin.updatePlaybackState(payload).catch(() => {
            if (lastIdentityRef.current === identity) lastIdentityRef.current = '';
        });
    }, [
        audioRef,
        currentSong,
        currentTime,
        duration,
        foregroundRevision,
        launchTarget,
        plugin,
        positionRevision,
        queue,
        status,
    ]);

    useEffect(() => {
        if (!plugin) return undefined;
        let disposed = false;
        let listenerHandle: { remove: () => Promise<void> } | { remove: () => void } | null = null;
        const registered = plugin.addListener('mediaAction', ({ action, position }) => {
            if (disposed) return;
            const resolved = resolveTvNativeMediaActionForTarget(action, launchTarget);
            if (resolved === 'play') resumeCurrent();
            else if (resolved === 'pause') pause();
            else if (resolved === 'toggle') togglePlayback();
            else if (resolved === 'next') next();
            else if (resolved === 'previous') previous();
            else if (resolved === 'skipPrevious') skipPrevious();
            else if (resolved === 'stop') pause();
            else if (resolved === 'seek' && typeof position === 'number') {
                seekTo(position / 1000);
            }
        });

        Promise.resolve(registered)
            .then(handle => {
                if (disposed) {
                    void handle.remove();
                    return;
                }
                listenerHandle = handle;
            })
            .catch(() => undefined);

        return () => {
            disposed = true;
            if (listenerHandle) void listenerHandle.remove();
        };
    }, [
        launchTarget,
        next,
        pause,
        plugin,
        previous,
        resumeCurrent,
        seekTo,
        skipPrevious,
        togglePlayback,
    ]);

    useEffect(() => {
        if (!plugin?.consumeQueuePlayRequest) return undefined;
        let disposed = false;
        let listenerHandle: { remove: () => Promise<void> } | { remove: () => void } | null = null;
        let consuming = false;

        const consume = async () => {
            if (disposed || consuming || queue.length === 0) return;
            consuming = true;
            try {
                const request = await plugin.consumeQueuePlayRequest?.();
                const index = request?.index;
                if (
                    !disposed
                    && typeof index === 'number'
                    && Number.isInteger(index)
                    && index >= 0
                    && index < queue.length
                ) {
                    playQueue(queue, index);
                }
            } catch {
                // A stale browser selection is harmless; the user can choose again.
            } finally {
                consuming = false;
            }
        };

        const registered = plugin.addListener('mediaPlayRequest', () => {
            if (!disposed) void consume();
        });
        Promise.resolve(registered)
            .then(handle => {
                if (disposed) {
                    void handle.remove();
                    return;
                }
                listenerHandle = handle;
                void consume();
            })
            .catch(() => undefined);

        return () => {
            disposed = true;
            if (listenerHandle) void listenerHandle.remove();
        };
    }, [playQueue, plugin, queue]);

    const moveToBackground = useCallback(async (): Promise<boolean> => {
        if (!plugin?.moveTaskToBack || actionLockRef.current) return false;
        actionLockRef.current = 'background';
        try {
            await plugin.moveTaskToBack();
            return true;
        } catch {
            return false;
        } finally {
            actionLockRef.current = null;
        }
    }, [plugin]);

    const exitApp = useCallback(async (): Promise<boolean> => {
        if (actionLockRef.current) return false;
        actionLockRef.current = 'exit';
        exitRequestedRef.current = true;
        pause();
        try {
            await plugin?.clearPlaybackState().catch(() => undefined);
        } finally {
            actionLockRef.current = null;
        }
        if (!plugin?.exitApp) return false;
        try {
            await plugin.exitApp();
            return true;
        } catch {
            return false;
        }
    }, [pause, plugin]);

    return {
        available: Boolean(plugin),
        canBackground: Boolean(plugin?.moveTaskToBack),
        canExit: Boolean(plugin?.exitApp),
        moveToBackground,
        exitApp,
    };
};
