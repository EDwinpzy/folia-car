// src/tv/hooks/useTvLibrary.ts

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    recentPlayRecordsOf,
    watchRecentPlays,
} from '../../components/app/home/explore/recentPlays';
import { getLocalSongs } from '../../services/db';
import { omni } from '../../services/onlineMusic/omni';
import { buildLocalQueue } from '../../services/playbackAdapters';
import type { SongResult } from '../../types';
import type { ProviderCollection } from '../../types/onlineMusic';
import {
    mergeTvCarRecentPlays,
    resolveTvCarRecentAccountId,
} from '../model/tvCarRecentPlays';
import {
    isTvLikedSnapshotCurrent,
    resolveTvLikedOwnerKey,
} from '../model/tvLikedSongs';
import type { TvAccountModel } from './useTvAccount';

const TV_LOCAL_ROW_SIZE = 14;

export type TvLibraryModel = {
    localSongs: SongResult[];
    recentLocalSongs: SongResult[];
    recentPlayedSongs: SongResult[];
    likedSongs: SongResult[];
    playlists: ProviderCollection[];
    isLoadingLocal: boolean;
    isLoadingLiked: boolean;
    likedError: string | null;
    refreshLocalSongs: () => Promise<number>;
};

const readLocalQueue = async (): Promise<SongResult[]> => {
    const songs = await getLocalSongs();
    const sorted = [...songs].sort((left, right) => right.addedAt - left.addedAt);
    return buildLocalQueue(sorted);
};

export const useTvLibrary = (account: TvAccountModel): TvLibraryModel => {
    const [localSongs, setLocalSongs] = useState<SongResult[]>([]);
    const [likedSongs, setLikedSongs] = useState<SongResult[]>([]);
    const [loadedLikedOwnerKey, setLoadedLikedOwnerKey] = useState<string | null>(null);
    const [isLoadingLocal, setIsLoadingLocal] = useState(true);
    const [isLoadingLikedState, setIsLoadingLiked] = useState(false);
    const [likedError, setLikedError] = useState<string | null>(null);
    const [recentPlaysRevision, setRecentPlaysRevision] = useState(0);
    const likedRequestRef = useRef(0);
    const userId = account.activeAccount?.user?.id ?? null;
    const providerId = account.activeProviderId;
    const likedCollection = useMemo(
        () => account.activeAccount?.collections.find(collection => collection.isLiked === true) ?? null,
        [account.activeAccount?.collections],
    );
    const likedOwnerKey = useMemo(
        () => resolveTvLikedOwnerKey(
            providerId,
            userId,
            likedCollection?.id === undefined ? null : String(likedCollection.id),
        ),
        [likedCollection?.id, providerId, userId],
    );

    const refreshLocalSongs = useCallback(async (): Promise<number> => {
        setIsLoadingLocal(true);
        try {
            const nextLocalSongs = await readLocalQueue();
            setLocalSongs(nextLocalSongs);
            return nextLocalSongs.length;
        } catch (error) {
            console.warn('[TV Library] Local library unavailable', error);
            setLocalSongs([]);
            throw error;
        } finally {
            setIsLoadingLocal(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        setIsLoadingLocal(true);
        void readLocalQueue()
            .then(songs => {
                if (cancelled) return;
                setLocalSongs(songs);
            })
            .catch(error => {
                console.warn('[TV Library] Local library unavailable', error);
                if (!cancelled) setLocalSongs([]);
            })
            .finally(() => {
                if (!cancelled) setIsLoadingLocal(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        const requestId = ++likedRequestRef.current;
        if (!userId) {
            setLikedSongs([]);
            setLoadedLikedOwnerKey(null);
            setIsLoadingLiked(false);
            setLikedError(null);
            return;
        }

        setIsLoadingLiked(true);
        setLikedError(null);
        void (async () => {
            if (likedCollection) {
                const page = await omni.getCollectionTracks(likedCollection, {
                    limit: Math.max(1, likedCollection.trackCount ?? 500),
                    offset: 0,
                });
                return page.items;
            }
            const answer = await omni.getProviderLikedSongIds(providerId, userId);
            const details = await omni.getSongDetails(providerId, answer.ids);
            return details.flatMap(detail => detail.status === 'found' ? [detail.song] : []);
        })()
            .then(songs => {
                if (likedRequestRef.current !== requestId) return;
                setLikedSongs(songs);
                setLoadedLikedOwnerKey(likedOwnerKey);
            })
            .catch(error => {
                if (likedRequestRef.current !== requestId) return;
                console.warn('[TV Library] Liked songs unavailable', error);
                setLikedSongs([]);
                setLoadedLikedOwnerKey(likedOwnerKey);
                setLikedError(error instanceof Error ? error.message : 'liked-songs-unavailable');
            })
            .finally(() => {
                if (likedRequestRef.current === requestId) setIsLoadingLiked(false);
            });
    }, [likedCollection, likedOwnerKey, providerId, userId]);

    useEffect(() => watchRecentPlays(() => {
        setRecentPlaysRevision(revision => revision + 1);
    }), []);

    const playlists = useMemo(
        () => (account.activeAccount?.collections ?? []).filter(collection => (
            collection.type === 'playlist' || collection.type === 'cloud'
        )),
        [account.activeAccount?.collections],
    );

    const recentLocalSongs = useMemo(
        () => localSongs.slice(0, TV_LOCAL_ROW_SIZE),
        [localSongs],
    );
    const recentPlayedSongs = useMemo(() => {
        const records = [recentPlayRecordsOf({ kind: 'local' })];
        records.push(recentPlayRecordsOf({
            kind: 'online',
            providerId,
            accountId: resolveTvCarRecentAccountId(userId),
        }));
        return mergeTvCarRecentPlays(records, TV_LOCAL_ROW_SIZE);
    }, [providerId, recentPlaysRevision, userId]);
    const currentLikedSongs = isTvLikedSnapshotCurrent(
        loadedLikedOwnerKey,
        likedOwnerKey,
    ) ? likedSongs : [];
    const isLoadingLiked = userId !== null
        && (isLoadingLikedState || !isTvLikedSnapshotCurrent(loadedLikedOwnerKey, likedOwnerKey));

    return {
        localSongs,
        recentLocalSongs,
        recentPlayedSongs,
        likedSongs: currentLikedSongs,
        playlists,
        isLoadingLocal,
        isLoadingLiked,
        likedError,
        refreshLocalSongs,
    };
};
