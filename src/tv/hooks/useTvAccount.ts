// src/tv/hooks/useTvAccount.ts

import { useCallback, useEffect, useMemo } from 'react';
import {
    useLibraryAccountLogin,
    useLibraryAccountPendingSwitch,
    useLibraryAccountProviders,
    useLibraryAccountSelector,
} from '../../library/core/account/useLibraryAccount';
import { useLibraryAccountController } from '../../library/app/useLibraryAccountController';
import { useOnlineProviderAccountStore } from '../../stores/useOnlineProviderAccountStore';
import type { OnlineProviderId } from '../../types/onlineMusic';
import {
    hydrateTvProviderAccounts,
    logoutTvProviderAccount,
    refreshTvProviderAccount,
} from '../services/tvProviderData';

export type TvAccountModel = ReturnType<typeof useTvAccount>;

export const useTvAccount = ({ onProviderSwitch }: { onProviderSwitch?: () => void } = {}) => {
    const controller = useLibraryAccountController({
        logout: logoutTvProviderAccount,
        confirmLogout: async () => true,
        switchCleanup: {
            leaveProvider: () => onProviderSwitch?.(),
            holdsSongsOf: () => false,
            dropSongsOf: () => undefined,
        },
    });
    const { providers, activeProviderId } = useLibraryAccountProviders(controller);
    const login = useLibraryAccountLogin(controller);
    const pendingSwitch = useLibraryAccountPendingSwitch(controller);
    const lastLoginCompletion = useLibraryAccountSelector(
        controller,
        snapshot => snapshot.lastLoginCompletion,
    );
    const activeAccount = useOnlineProviderAccountStore(state => state.accounts[state.activeProviderId]);
    const activeProvider = useMemo(
        () => providers.find(provider => provider.providerId === activeProviderId) ?? null,
        [activeProviderId, providers],
    );
    const providerKey = providers.map(provider => provider.providerId).join('|');

    useEffect(() => {
        void hydrateTvProviderAccounts(providers.map(provider => provider.providerId))
            .then(() => refreshTvProviderAccount(activeProviderId))
            .catch(() => undefined);
        // Provider registration is stable at startup; the key covers a late mod registry load.
    }, [providerKey, activeProviderId]);

    const startLogin = useCallback(async () => {
        await controller.startLogin(activeProviderId);
    }, [activeProviderId, controller]);

    const retryLogin = useCallback(async () => {
        await controller.retryLogin();
    }, [controller]);

    const selectProvider = useCallback(async (providerId: OnlineProviderId) => {
        const result = await controller.selectProvider(providerId);
        return result.action === 'login'
            ? controller.startLogin(providerId)
            : result;
    }, [controller]);

    const confirmSwitch = useCallback(async (requestId: number) => (
        controller.confirmSwitch(requestId)
    ), [controller]);

    const cancelSwitch = useCallback((requestId: number) => (
        controller.cancelSwitch(requestId)
    ), [controller]);

    const selectLoginMethod = useCallback(async (methodId: string) => {
        await controller.selectLoginMethod(methodId);
    }, [controller]);

    const closeLogin = useCallback(() => {
        controller.closeLogin();
    }, [controller]);

    const restartLoginService = useCallback(async () => {
        await controller.restartLocalService();
    }, [controller]);

    const logout = useCallback(async () => {
        await controller.logout(activeProviderId);
    }, [activeProviderId, controller]);

    return {
        controller,
        providers,
        activeProviderId: activeProviderId as OnlineProviderId,
        activeProvider,
        activeAccount,
        login,
        pendingSwitch,
        lastLoginCompletion,
        isAuthenticated: Boolean(activeAccount?.user),
        providerLabel: activeProvider?.shortName || activeProvider?.displayName || activeProviderId,
        startLogin,
        retryLogin,
        selectProvider,
        confirmSwitch,
        cancelSwitch,
        selectLoginMethod,
        closeLogin,
        restartLoginService,
        logout,
    };
};
