// src/tv/TvApp.tsx

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyKeepScreenOn, readStoredKeepScreenOn } from '../services/androidKeepScreenOn';
import { useNativeBackButton } from '../hooks/useNativeBackButton';
import { canRetryLogin } from '../library/core/account/accountRules';
import { useCarInitialFocus } from '../car/useCarInitialFocus';
import { useCarInputModality } from '../car/useCarInputModality';
import { TvCarToolbar } from '../car/TvCarToolbar';
import type { SongResult } from '../types';
import type { ProviderCollection } from '../types/onlineMusic';
import { TvChunkFailureOverlay } from './components/TvChunkFailureOverlay';
import { TvChunkLoadBoundary } from './components/TvChunkLoadBoundary';
import { TvCarRecentPlaysRecorder } from './components/TvCarRecentPlaysRecorder';
import { TvCollectionOverlay } from './components/TvCollectionOverlay';
import { TvExitOverlay } from './components/TvExitOverlay';
import { TvLoginOverlay } from './components/TvLoginOverlay';
import { TvQueueOverlay } from './components/TvQueueOverlay';
import { TvSearchOverlay } from './components/TvSearchOverlay';
import { useTvAccount } from './hooks/useTvAccount';
import { useTvControlsAutoHide } from './hooks/useTvControlsAutoHide';
import { useTvFocus } from './hooks/useTvFocus';
import { useTvLibrary } from './hooks/useTvLibrary';
import { useTvNativePlayback } from './hooks/useTvNativePlayback';
import { useTvPerformanceProfile } from './hooks/useTvPerformanceProfile';
import { useTvPlayer } from './hooks/useTvPlayer';
import { useTvRemote } from './hooks/useTvRemote';
import { useTvVoicePlay } from './hooks/useTvVoicePlay';
import { clickFocusedTvElement } from './input/focusDom';
import { isTvDirection, type TvRemoteAction } from './input/tvKeys';
import {
    createTvTrackSkipGesture,
    TV_TRACK_SKIP_INTERVAL_MS,
} from './input/tvTrackSkipGesture';
import { shouldRevealTvPlayerChrome } from './model/tvPlayerChrome';
import {
    resolveTvBackRoute,
    resolveTvEffectsRoute,
    resolveTvLayer,
    TV_HOME_ROUTE,
    type TvRoute,
} from './model/tvRoute';
import { TvHome } from './pages/TvHome';

let playerImportPromise: Promise<typeof import('./pages/TvPlayer')> | null = null;
let effectsImportPromise: Promise<typeof import('./components/TvEffectsOverlay')> | null = null;

// Reuse the in-flight import so a user action cannot start a second Vite preload that skips
// the CSS dependency still being loaded by the idle prefetch.
const loadTvPlayer = () => {
    playerImportPromise ??= import('./pages/TvPlayer');
    return playerImportPromise;
};
const loadTvEffectsOverlay = () => {
    effectsImportPromise ??= import('./components/TvEffectsOverlay');
    return effectsImportPromise;
};

const TvPlayer = lazy(() => loadTvPlayer().then(module => ({ default: module.TvPlayer })));
const TvEffectsOverlay = lazy(() => (
    loadTvEffectsOverlay().then(module => ({ default: module.TvEffectsOverlay }))
));

const RESET_FOCUS_MEMORY_LAYERS = [
    'exit',
    'login',
    'collection',
    'search',
    'queue',
    'effects',
    'failure',
] as const;

export const TvApp = ({ variant = 'tv' }: { variant?: 'tv' | 'car' } = {}) => {
    const isCar = variant === 'car';
    const player = useTvPlayer();
    const nativePlayback = useTvNativePlayback(player, isCar ? 'car' : 'tv');
    const performanceProfile = useTvPerformanceProfile();
    const constrained = isCar || performanceProfile.tier === 'constrained';
    useCarInitialFocus(isCar);
    useCarInputModality(isCar);
    const account = useTvAccount({ onProviderSwitch: player.pause });
    const library = useTvLibrary(account);
    const trackSkipGestureRef = useRef(createTvTrackSkipGesture());
    const pendingChromeRevealTimerRef = useRef<number | null>(null);
    const [route, setRoute] = useState<TvRoute>(TV_HOME_ROUTE);
    const [collection, setCollection] = useState<ProviderCollection | null>(null);
    const [loginError, setLoginError] = useState<string | null>(null);
    const [chunkFailure, setChunkFailure] = useState(false);
    const loginCompletionBaselineRef = useRef<number | null>(null);
    const playerChunkPrefetchFailedRef = useRef(false);
    const effectsChunkPrefetchFailedRef = useRef(false);
    const routeRef = useRef(route);
    routeRef.current = route;
    const activeLayer = chunkFailure ? 'failure' : resolveTvLayer(route);

    const reportChunkFailure = useCallback((error: unknown) => {
        console.warn('[TV App] Chunk load failed', error);
        if (routeRef.current.page === 'player') setChunkFailure(true);
    }, []);

    const dismissChunkFailure = useCallback(() => {
        setChunkFailure(false);
        setRoute(TV_HOME_ROUTE);
    }, []);

    useNativeBackButton();

    useEffect(() => {
        const idleWindow = window as Window & {
            requestIdleCallback?: (
                callback: () => void,
                options?: { timeout: number },
            ) => number;
            cancelIdleCallback?: (handle: number) => void;
        };
        let idleHandle: number | null = null;
        let timeoutHandle: number | null = null;
        const preload = () => {
            void loadTvPlayer().catch(error => {
                console.warn('[TV App] Player chunk preload failed', error);
                playerChunkPrefetchFailedRef.current = true;
            });
            if (isCar) return;
            void loadTvEffectsOverlay().catch(error => {
                console.warn('[TV App] Effects chunk preload failed', error);
                effectsChunkPrefetchFailedRef.current = true;
            });
        };
        if (typeof idleWindow.requestIdleCallback === 'function') {
            idleHandle = idleWindow.requestIdleCallback(preload, { timeout: 3500 });
        } else {
            timeoutHandle = window.setTimeout(preload, 1200);
        }
        return () => {
            if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle);
            if (timeoutHandle !== null) window.clearTimeout(timeoutHandle);
        };
    }, [isCar]);

    const closeAccount = useCallback(() => {
        if (account.pendingSwitch) account.cancelSwitch(account.pendingSwitch.request.id);
        account.closeLogin();
        setRoute(current => ({ ...current, overlay: null }));
        setLoginError(null);
        loginCompletionBaselineRef.current = null;
    }, [account.cancelSwitch, account.closeLogin, account.pendingSwitch]);

    const cancelPendingChromeReveal = useCallback(() => {
        if (pendingChromeRevealTimerRef.current === null) return;
        window.clearTimeout(pendingChromeRevealTimerRef.current);
        pendingChromeRevealTimerRef.current = null;
    }, []);

    const revealPlayerChrome = useCallback(() => {
        cancelPendingChromeReveal();
        setRoute(current => (
            current.page === 'player' && !current.overlay
                ? { ...current, overlay: 'controls' }
                : current
        ));
    }, [cancelPendingChromeReveal]);

    const schedulePlayerChromeReveal = useCallback(() => {
        cancelPendingChromeReveal();
        // A hidden-player horizontal press may start a double-tap skip. Delay chrome
        // activation until the second press can no longer complete that gesture.
        pendingChromeRevealTimerRef.current = window.setTimeout(() => {
            pendingChromeRevealTimerRef.current = null;
            trackSkipGestureRef.current.clear();
            revealPlayerChrome();
        }, TV_TRACK_SKIP_INTERVAL_MS);
    }, [cancelPendingChromeReveal, revealPlayerChrome]);

    const closeControls = useCallback(() => {
        cancelPendingChromeReveal();
        trackSkipGestureRef.current.clear();
        setRoute(current => (
            current.overlay === 'controls' ? { ...current, overlay: null } : current
        ));
    }, [cancelPendingChromeReveal]);

    const hideControls = useCallback(() => closeControls(), [closeControls]);
    const touchControls = useTvControlsAutoHide({
        active: !chunkFailure && route.page === 'player' && route.overlay === 'controls',
        onHide: hideControls,
        timeoutMs: isCar ? 10_000 : undefined,
    });
    const revealPlayerChromeFromTouch = useCallback(() => {
        revealPlayerChrome();
        touchControls();
    }, [revealPlayerChrome, touchControls]);
    const defaultFocus = useMemo(() => ({
        home: isCar ? 'car-play' : 'home-hero',
        controls: 'controls-play',
        effects: `effects-lyrics-${player.visualizerMode}`,
        queue: player.currentIndex >= 0
            ? 'queue-current'
            : player.queue[0]
                ? `queue-${player.queue[0].id}-0`
                : undefined,
        collection: 'collection-play-all',
        search: 'search-input',
        exit: 'exit-background',
        failure: 'failure-home',
        login: account.pendingSwitch
            ? 'login-switch-confirm'
            : account.login?.methods[0]
                ? `login-method-${account.login.methods[0].id}`
                : account.login
                    ? account.login.localService.failed
                        ? 'login-restart'
                        : canRetryLogin(account.login, Date.now())
                            ? 'login-retry'
                            : `login-provider-${account.activeProviderId}`
                    : `login-provider-${account.activeProviderId}`,
    }), [
        account.activeProviderId,
        account.login,
        account.pendingSwitch,
        isCar,
        player.currentIndex,
        player.queue[0]?.id,
        player.visualizerMode,
    ]);
    const { moveFocus } = useTvFocus(
        activeLayer,
        `${route.page}:${route.overlay}:${collection?.id ?? ''}:${player.currentIndex}:${
            account.login?.phase ?? ''
        }:${account.pendingSwitch?.request.id ?? ''}`,
        defaultFocus,
        RESET_FOCUS_MEMORY_LAYERS,
    );

    const goBack = useCallback((): boolean => {
        if (route.overlay === 'login') {
            closeAccount();
            return true;
        }
        const next = resolveTvBackRoute(route, { offerExit: !isCar });
        if (!next) return false;
        if (route.overlay === 'collection') setCollection(null);
        setRoute(next);
        return true;
    }, [closeAccount, isCar, route]);

    const handleAction = useCallback((
        action: TvRemoteAction,
        { repeat }: { repeat: boolean },
    ): boolean => {
        if (action === 'back') {
            cancelPendingChromeReveal();
            trackSkipGestureRef.current.clear();
            if (chunkFailure) {
                setChunkFailure(false);
                setRoute(TV_HOME_ROUTE);
                return true;
            }
            return goBack();
        }

        if (chunkFailure) {
            if (action === 'ok') return clickFocusedTvElement();
            if (isTvDirection(action)) return moveFocus(action);
            return true;
        }

        if (route.page === 'player' && !route.overlay) {
            if (shouldRevealTvPlayerChrome(action)) {
                if (action === 'left' || action === 'right') {
                    if (repeat) {
                        cancelPendingChromeReveal();
                        trackSkipGestureRef.current.clear();
                        return true;
                    }
                    if (trackSkipGestureRef.current.press(action, performance.now())) {
                        cancelPendingChromeReveal();
                        if (action === 'left') player.skipPrevious();
                        else player.next();
                        return true;
                    }
                    schedulePlayerChromeReveal();
                    return true;
                }
                trackSkipGestureRef.current.clear();
                revealPlayerChrome();
                return true;
            }
        }

        cancelPendingChromeReveal();
        if (
            route.page === 'player'
            && route.overlay === 'controls'
            && !repeat
            && (action === 'left' || action === 'right')
        ) {
            if (trackSkipGestureRef.current.press(action, performance.now())) {
                if (action === 'left') player.skipPrevious();
                else player.next();
                return true;
            }
        } else {
            trackSkipGestureRef.current.clear();
        }

        if (action === 'ok') return clickFocusedTvElement();
        if (isTvDirection(action)) return moveFocus(action);
        if (action === 'menu') return false;
        return false;
    }, [
        cancelPendingChromeReveal,
        chunkFailure,
        goBack,
        player,
        revealPlayerChrome,
        route,
        moveFocus,
        schedulePlayerChromeReveal,
    ]);

    useTvRemote({
        onAction: handleAction,
        onHandledKey: () => {
            if (!chunkFailure && route.overlay === 'controls') touchControls();
        },
    });

    useEffect(() => {
        if (route.overlay !== 'login' || account.pendingSwitch) return;
        const completion = account.lastLoginCompletion;
        if (
            !completion
            || completion.outcome !== 'completed'
            || completion.sessionId === loginCompletionBaselineRef.current
        ) return;
        loginCompletionBaselineRef.current = completion.sessionId;
        setRoute(current => ({ ...current, overlay: null }));
        setLoginError(null);
    }, [account.lastLoginCompletion, account.pendingSwitch, route.overlay]);

    useEffect(() => {
        applyKeepScreenOn(route.page === 'player' || readStoredKeepScreenOn());
    }, [route.page]);

    useEffect(() => () => cancelPendingChromeReveal(), [cancelPendingChromeReveal]);

    const openAccount = useCallback(() => {
        setLoginError(null);
        loginCompletionBaselineRef.current = account.lastLoginCompletion?.sessionId ?? null;
        setRoute(current => ({ ...current, overlay: 'login' }));
    }, [account.lastLoginCompletion]);

    const openSearch = useCallback(() => {
        setRoute(current => (
            current.page === 'home' ? { ...current, overlay: 'search' } : current
        ));
    }, []);

    const openPlayer = useCallback(() => {
        if (playerChunkPrefetchFailedRef.current) {
            setChunkFailure(true);
            return;
        }
        setRoute(current => ({ ...current, page: 'player', overlay: null }));
    }, []);

    const openCarQueue = useCallback(() => {
        setRoute(current => ({ ...current, overlay: 'queue' }));
    }, []);

    const openEffects = useCallback(() => {
        if (effectsChunkPrefetchFailedRef.current) {
            setChunkFailure(true);
            return;
        }
        void loadTvEffectsOverlay()
            .then(() => {
                setRoute(resolveTvEffectsRoute);
            })
            .catch(reportChunkFailure);
    }, [reportChunkFailure]);

    const leaveInBackground = useCallback(() => {
        setRoute(current => (
            current.overlay === 'exit' ? { ...current, overlay: null } : current
        ));
        void nativePlayback.moveToBackground().then(moved => {
            if (moved) return;
            setRoute(current => (
                current.overlay ? current : { ...current, overlay: 'exit' }
            ));
        });
    }, [nativePlayback.moveToBackground]);

    const exitTvApp = useCallback(() => {
        void nativePlayback.exitApp();
    }, [nativePlayback.exitApp]);

    const activateHero = useCallback(() => {
        if (player.currentSong) {
            player.resumeCurrent();
            openPlayer();
            return;
        }
        if (library.localSongs.length > 0) {
            player.playQueue(library.localSongs, 0);
            openPlayer();
            return;
        }
        if (library.likedSongs.length > 0) {
            player.playQueue(library.likedSongs, 0);
            openPlayer();
            return;
        }
        if (!account.isAuthenticated) openAccount();
    }, [account.isAuthenticated, library.likedSongs, library.localSongs, openAccount, openPlayer, player]);

    const playTracks = useCallback((songs: SongResult[], startIndex: number) => {
        if (songs.length === 0) return;
        player.playQueue(songs, startIndex);
        setCollection(null);
        openPlayer();
    }, [openPlayer, player]);

    useTvVoicePlay({ onPlayTracks: playTracks, onResume: activateHero });

    const openCollection = useCallback((nextCollection: ProviderCollection) => {
        setCollection(nextCollection);
        setRoute(current => ({ ...current, overlay: 'collection' }));
    }, []);

    return (
        <div
            className={`tv-app${route.page === 'player' ? ' is-player' : ''}${
                constrained ? ' is-constrained' : ''
            }${isCar ? ' is-car' : ''}`}
            data-tv-performance-tier={performanceProfile.tier}
            data-tv-variant={variant}
        >
            <audio
                ref={player.audioRef}
                className="tv-audio"
                preload="metadata"
                playsInline
                crossOrigin="anonymous"
            />
            {isCar && (
                <TvCarRecentPlaysRecorder
                    audioRef={player.audioRef}
                    currentSong={player.currentSong}
                />
            )}
            <TvChunkLoadBoundary
                key={route.page}
                onChunkError={reportChunkFailure}
            >
                {route.page === 'home' ? (
                    <TvHome
                        account={account}
                        library={library}
                        player={player}
                        onActivateHero={activateHero}
                        onOpenAccount={openAccount}
                        onOpenSearch={openSearch}
                        onPlayTracks={playTracks}
                        onOpenCollection={openCollection}
                        isCar={isCar}
                        carConsole={isCar ? (
                            <TvCarToolbar
                                player={player}
                                onActivateHero={activateHero}
                                onOpenPlayer={openPlayer}
                                onOpenQueue={openCarQueue}
                            />
                        ) : undefined}
                        inert={route.overlay !== null}
                    />
                ) : (
                    <Suspense fallback={<div className="tv-page tv-player-page" aria-busy="true" />}>
                        <TvPlayer
                            player={player}
                            controlsOpen={route.overlay === 'controls' || route.overlay === 'queue'}
                            constrained={constrained}
                            isCar={isCar}
                            onOpenQueue={() => setRoute(current => ({ ...current, overlay: 'queue' }))}
                            onOpenEffects={isCar ? undefined : openEffects}
                            onRevealControls={revealPlayerChromeFromTouch}
                            inert={route.overlay !== null && route.overlay !== 'controls'}
                        />
                    </Suspense>
                )}
                {route.overlay === 'queue' && (
                    <TvQueueOverlay
                        queue={player.queue}
                        currentIndex={player.currentIndex}
                        onClose={isCar ? goBack : undefined}
                        showCloseButton={!isCar}
                        onPlay={index => {
                            player.playQueue(player.queue, index);
                            setRoute({ page: 'player', overlay: 'controls' });
                        }}
                    />
                )}
                {route.overlay === 'effects' && (
                    <Suspense fallback={null}>
                        <TvEffectsOverlay
                            visualizerMode={player.visualizerMode}
                            backgroundMode={player.backgroundMode}
                            onVisualizerModeChange={player.setVisualizerMode}
                            onBackgroundModeChange={player.setBackgroundMode}
                            onClose={isCar ? goBack : undefined}
                        />
                    </Suspense>
                )}
                {route.overlay === 'collection' && collection && (
                    <TvCollectionOverlay
                        collection={collection}
                        onPlayTracks={playTracks}
                        onClose={isCar ? goBack : undefined}
                        showCloseButton={!isCar}
                    />
                )}
                {route.overlay === 'search' && (
                    <TvSearchOverlay
                        onPlayTracks={playTracks}
                        onClose={isCar ? goBack : undefined}
                        showCloseButton={!isCar}
                    />
                )}
                {route.overlay === 'login' && (
                    <TvLoginOverlay
                        account={account}
                        startError={loginError}
                        onSwitchConfirmed={closeAccount}
                        onClose={isCar ? goBack : undefined}
                        showCloseButton={!isCar}
                    />
                )}
                {route.overlay === 'exit' && !isCar && (
                    <TvExitOverlay
                        isPlaying={player.status === 'playing'}
                        canBackground={nativePlayback.canBackground}
                        canExit={nativePlayback.canExit}
                        onBackground={leaveInBackground}
                        onExit={exitTvApp}
                        onClose={isCar ? goBack : undefined}
                    />
                )}
            </TvChunkLoadBoundary>
            {chunkFailure && <TvChunkFailureOverlay onBackHome={dismissChunkFailure} />}
        </div>
    );
};
