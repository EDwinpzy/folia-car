// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTvFocus } from '@/tv/hooks/useTvFocus';

// A lazy TV surface can commit after the route has already switched layers.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let showEffects: ((shown: boolean) => void) | null;

const TvFocusHarness = () => {
    const [effectsShown, setEffectsShown] = useState(false);
    showEffects = setEffectsShown;
    useTvFocus('effects', 'effects', { effects: 'effects-selected' });
    return effectsShown
        ? createElement(
            'div',
            { id: 'tv-layer-effects', 'data-tv-layer': 'effects' },
            createElement('button', {
                type: 'button',
                'data-tv-focusable': 'true',
                'data-tv-focus-key': 'effects-selected',
            }),
        )
        : createElement('div');
};

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue(
        [{}] as unknown as DOMRectList,
    );
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
        configurable: true,
        value: () => undefined,
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    showEffects = null;
    delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('useTvFocus', () => {
    it('moves focus into a lazy layer when its root mounts late', async () => {
        await act(async () => {
            root.render(createElement(TvFocusHarness));
        });
        expect(document.activeElement).toBe(document.body);

        await act(async () => {
            showEffects?.(true);
            await Promise.resolve();
        });

        expect(document.activeElement?.getAttribute('data-tv-focus-key'))
            .toBe('effects-selected');
    });
});
