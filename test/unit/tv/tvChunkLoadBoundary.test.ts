// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TvChunkLoadBoundary } from '@/tv/components/TvChunkLoadBoundary';

// test/unit/tv/tvChunkLoadBoundary.test.ts
// A stale lazy chunk must be handed to the TV failure layer instead of unmounting the whole app.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BrokenLazySurface = () => {
    throw new Error(
        'Failed to fetch dynamically imported module: https://localhost/assets/TvPlayer-old.js',
    );
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
});

describe('TvChunkLoadBoundary', () => {
    it('hands a lazy chunk failure to the TV failure layer without crashing the root', async () => {
        const onChunkError = vi.fn();
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await act(async () => {
            root.render(createElement(
                TvChunkLoadBoundary,
                {
                    onChunkError,
                    children: createElement(BrokenLazySurface),
                },
            ));
        });

        expect(onChunkError).toHaveBeenCalledTimes(1);
        expect(onChunkError.mock.calls[0][0]).toBeInstanceOf(Error);
        expect(container.textContent).toBe('');
    });

    it('treats a missing lazy CSS file as a chunk failure', async () => {
        const onChunkError = vi.fn();
        const BrokenCssSurface = () => {
            throw new Error(
                'Unable to preload CSS for https://localhost/assets/TvPlayer-old.css',
            );
        };
        vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await act(async () => {
            root.render(createElement(
                TvChunkLoadBoundary,
                {
                    onChunkError,
                    children: createElement(BrokenCssSurface),
                },
            ));
        });

        expect(onChunkError).toHaveBeenCalledTimes(1);
        expect(container.textContent).toBe('');
    });
});
