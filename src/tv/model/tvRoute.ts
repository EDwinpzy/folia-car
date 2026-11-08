// src/tv/model/tvRoute.ts

import type { TvLayerId } from '../input/focusDom';
import type { TvOverlay, TvPage } from './tvTypes';

export type TvRoute = {
    page: TvPage;
    overlay: TvOverlay | null;
};

export const TV_HOME_ROUTE: TvRoute = { page: 'home', overlay: null };

export const resolveTvLayer = (route: TvRoute): TvLayerId => {
    if (route.overlay) return route.overlay;
    return route.page === 'player' ? 'player' : 'home';
};

/** 特效面板只能从播放器控制栏打开；分包晚到不能覆盖用户已经切到的其他层。 */
export const resolveTvEffectsRoute = (route: TvRoute): TvRoute => (
    route.page === 'player' && route.overlay === 'controls'
        ? { ...route, overlay: 'effects' }
        : route
);

/**
 * Returns the route one Back press should reveal. The TV home root opens the leave overlay so the
 * listener explicitly chooses background playback or a full exit; it never falls through to
 * Android's generic moveTaskToBack path without feedback.
 */
export const resolveTvBackRoute = (
    route: TvRoute,
    { offerExit = true }: { offerExit?: boolean } = {},
): TvRoute | null => {
    if (
        route.overlay === 'login'
        || route.overlay === 'collection'
        || route.overlay === 'search'
        || route.overlay === 'controls'
        || route.overlay === 'exit'
    ) {
        return { ...route, overlay: null };
    }
    if (route.overlay === 'queue') {
        return route.page === 'home' ? TV_HOME_ROUTE : { ...route, overlay: 'controls' };
    }
    if (route.overlay === 'effects') {
        return { ...route, overlay: 'controls' };
    }
    if (route.page === 'player') return TV_HOME_ROUTE;
    if (!offerExit) return null;
    return { page: 'home', overlay: 'exit' };
};
