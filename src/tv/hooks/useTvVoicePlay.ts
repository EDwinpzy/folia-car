import { useCallback, useEffect, useRef } from 'react';
import { omni } from '../../services/onlineMusic/omni';
import type { SongResult } from '../../types';
import { selectTvVoicePlayQueue } from '../model/tvVoicePlay';

// src/tv/hooks/useTvVoicePlay.ts

type NativeVoicePlayPlugin = {
    addListener: (
        eventName: string,
        listener: () => void,
    ) => Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
    consumeVoicePlayRequest: () => Promise<{ query?: string; action?: string } | undefined>;
};

const getPlugin = (): NativeVoicePlayPlugin | null => {
    if (typeof window === 'undefined') return null;
    const capacitor = (window as unknown as {
        Capacitor?: {
            getPlatform?: () => string;
            Plugins?: { FoliaNative?: NativeVoicePlayPlugin };
        };
    }).Capacitor;
    if (capacitor?.getPlatform?.() !== 'android') return null;
    const plugin = capacitor.Plugins?.FoliaNative;
    return plugin && typeof plugin.addListener === 'function'
        && typeof plugin.consumeVoicePlayRequest === 'function'
        ? plugin
        : null;
};

/**
 * Consumes a voice song request from the Android bridge, searches the active Omni provider and
 * hands the playable results to the TV queue. Native events only wake the consumer; the query is
 * read once through consumeVoicePlayRequest so cold starts and activity recreations cannot replay it.
 */
export const useTvVoicePlay = ({
    onPlayTracks,
    onResume,
}: {
    onPlayTracks: (songs: SongResult[], startIndex: number) => void;
    onResume: () => void;
}): void => {
    const onPlayTracksRef = useRef(onPlayTracks);
    onPlayTracksRef.current = onPlayTracks;
    const onResumeRef = useRef(onResume);
    onResumeRef.current = onResume;
    const requestRef = useRef(0);

    const playQuery = useCallback(async (rawQuery: string) => {
        const query = rawQuery.trim();
        if (!query) return;
        const requestId = ++requestRef.current;
        try {
            const page = await omni.searchSongs(query, { limit: 40, offset: 0 });
            if (requestRef.current !== requestId) return;
            const playable = selectTvVoicePlayQueue(page.items, query);
            if (!playable) {
                console.warn(`[TV Voice] No playable result for "${query}" (${page.items.length} rows)`);
                return;
            }
            const song = playable.songs[playable.startIndex];
            console.info(
                `[TV Voice] playing "${song?.name ?? ''}" for "${query}" `
                + `(${page.items.length} rows, start=${playable.startIndex})`,
            );
            onPlayTracksRef.current(playable.songs, playable.startIndex);
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            console.warn('[TV Voice] Song search failed', error);
        }
    }, []);

    useEffect(() => {
        const plugin = getPlugin();
        if (!plugin) return undefined;

        let disposed = false;
        let listenerHandle: { remove: () => Promise<void> } | { remove: () => void } | null = null;

        const consume = async () => {
            try {
                const request = await plugin.consumeVoicePlayRequest();
                if (disposed || !request) return;
                if (request.action === 'resume') {
                    onResumeRef.current();
                    return;
                }
                if (request.query) await playQuery(request.query);
            } catch (error) {
                console.warn('[TV Voice] Failed to consume song request', error);
            }
        };

        const registered = plugin.addListener('voicePlayRequest', () => {
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
            requestRef.current += 1;
            if (listenerHandle) void listenerHandle.remove();
        };
    }, [playQuery]);
};
