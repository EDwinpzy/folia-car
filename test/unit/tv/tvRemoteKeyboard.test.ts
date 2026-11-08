// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TvRemoteAction } from '../../../src/tv/input/tvKeys';
import { useTvRemote } from '../../../src/tv/hooks/useTvRemote';

// test/unit/tv/tvRemoteKeyboard.test.ts
// The TV key router must keep consecutive physical presses distinct even when their releases happen
// inside the auto-repeat guard window; holding a key without releasing it is still a repeat.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const calls: Array<{ action: TvRemoteAction; repeat: boolean }> = [];

const Probe = () => {
    useTvRemote({
        onAction: (action, { repeat }) => {
            calls.push({ action, repeat });
            return true;
        },
    });
    return null;
};

let container: HTMLDivElement;
let root: Root;

const key = (type: 'keydown' | 'keyup', value: string) => {
    window.dispatchEvent(new KeyboardEvent(type, { key: value, bubbles: true, cancelable: true }));
};

beforeEach(() => {
    calls.length = 0;
    container = document.body.appendChild(document.createElement('div'));
    root = createRoot(container);
    act(() => root.render(createElement(Probe)));
});

afterEach(() => {
    vi.restoreAllMocks();
    act(() => root.unmount());
    container.remove();
});

describe('TV remote keyboard routing', () => {
    it('keeps consecutive direction presses distinct when each key is released', () => {
        key('keydown', 'ArrowRight');
        key('keyup', 'ArrowRight');
        key('keydown', 'ArrowRight');
        key('keyup', 'ArrowRight');

        expect(calls).toEqual([
            { action: 'right', repeat: false },
            { action: 'right', repeat: false },
        ]);
    });

    it('still treats a second key-down without a release as a repeat', () => {
        const now = vi.spyOn(performance, 'now').mockReturnValue(1_000);
        key('keydown', 'ArrowRight');
        now.mockReturnValue(1_100);
        key('keydown', 'ArrowRight');

        expect(calls).toEqual([
            { action: 'right', repeat: false },
            { action: 'right', repeat: true },
        ]);
    });
});
