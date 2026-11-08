// src/tv/model/tvLikedSongs.ts

import type { MediaId } from '../../types/onlineMusic';

export const resolveTvLikedOwnerKey = (
    providerId: string,
    userId: MediaId | null,
    collectionId: string | null,
): string | null => (
    userId === null
        ? null
        : `${providerId}:${String(userId)}:${collectionId ?? 'provider'}`
);

export const isTvLikedSnapshotCurrent = (
    loadedOwnerKey: string | null,
    currentOwnerKey: string | null,
): boolean => loadedOwnerKey !== null && loadedOwnerKey === currentOwnerKey;
