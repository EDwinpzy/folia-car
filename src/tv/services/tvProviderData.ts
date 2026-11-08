// src/tv/services/tvProviderData.ts

import { loadProviderAccountSnapshot } from '../../services/onlineMusic/providerAccountCache';
import { omni } from '../../services/onlineMusic/omni';
import { useOnlineProviderAccountStore } from '../../stores/useOnlineProviderAccountStore';
import type { OnlineProviderId } from '../../types/onlineMusic';

const hydrationInFlight = new Map<OnlineProviderId, Promise<void>>();

export const hydrateTvProviderAccount = async (providerId: OnlineProviderId): Promise<void> => {
    const existing = hydrationInFlight.get(providerId);
    if (existing) return existing;
    if (useOnlineProviderAccountStore.getState().accounts[providerId]?.user) return;

    const task = (async () => {
        const snapshot = await loadProviderAccountSnapshot(providerId).catch(() => null);
        if (!snapshot) return;
        const account = useOnlineProviderAccountStore.getState().accounts[providerId];
        if (account?.user) return;
        useOnlineProviderAccountStore.getState().updateAccount(providerId, {
            status: 'authenticated',
            user: snapshot.user,
            collections: snapshot.collections,
            likedSongIds: snapshot.likedSongIds,
            hydration: 'ready',
            freshness: 'stale',
            lastUpdatedAt: snapshot.savedAt,
        });
    })().finally(() => hydrationInFlight.delete(providerId));

    hydrationInFlight.set(providerId, task);
    return task;
};

export const hydrateTvProviderAccounts = async (providerIds: OnlineProviderId[]): Promise<void> => {
    await Promise.all(providerIds.map(providerId => hydrateTvProviderAccount(providerId)));
};

export const refreshTvProviderAccount = (providerId: OnlineProviderId): Promise<boolean> => {
    return omni.readAccount(providerId, 'start')
        .then(outcome => outcome === 'read' || outcome === 'not read');
};

export const logoutTvProviderAccount = async (providerId: OnlineProviderId): Promise<void> => {
    await omni.signOutAccount(providerId);
};
