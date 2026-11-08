// src/car/useCarInitialFocus.ts

import { useEffect } from 'react';

const CAR_PRIMARY_FOCUS_KEY = 'car-play';
const CAR_CONSOLE_SELECTOR = '.tv-car-console';
const INITIAL_FOCUS_GRACE_MS = 5_000;
const INITIAL_FOCUS_INTERVAL_MS = 200;
const RESUME_FOCUS_DELAY_MS = 120;
const RESUME_FOCUS_GRACE_MS = 1_200;
const RESUME_FOCUS_INTERVAL_MS = 100;

/**
 * Android WebView can auto-focus the first DOM control after the car page loads, overriding the
 * focus chosen during React mount. Reassert the playback control during cold start, and restore the
 * last car-console control when the activity comes back from an OEM settings screen.
 */
export const useCarInitialFocus = (enabled: boolean): void => {
    useEffect(() => {
        if (!enabled) return undefined;
        let stopped = false;
        let initialInterval = 0;
        let initialDeadline = 0;
        let resumeTimer = 0;
        let resumeInterval = 0;
        let resumeDeadline = 0;
        let lastConsoleFocusKey = CAR_PRIMARY_FOCUS_KEY;

        const readActiveFocusKey = (): string => {
            const active = document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            return active?.dataset.tvFocusKey ?? '';
        };

        const focusCarControl = (focusKey: string) => {
            document.querySelector<HTMLElement>(
                `[data-tv-focus-key="${focusKey}"]`,
            )?.focus({ preventScroll: true });
        };

        const reassertCarFocus = () => {
            if (stopped) return;
            const activeKey = readActiveFocusKey();
            if (activeKey && activeKey !== 'home-hero') {
                return;
            }
            focusCarControl(lastConsoleFocusKey);
        };

        const stopInitialReassert = () => {
            window.clearInterval(initialInterval);
            window.clearTimeout(initialDeadline);
        };

        const stopResumeReassert = () => {
            window.clearTimeout(resumeTimer);
            window.clearInterval(resumeInterval);
            window.clearTimeout(resumeDeadline);
        };

        const stopFocusReassert = () => {
            stopInitialReassert();
            stopResumeReassert();
        };

        const scheduleResumeFocus = () => {
            if (stopped) return;
            stopResumeReassert();
            resumeTimer = window.setTimeout(() => {
                reassertCarFocus();
                resumeInterval = window.setInterval(
                    reassertCarFocus,
                    RESUME_FOCUS_INTERVAL_MS,
                );
            }, RESUME_FOCUS_DELAY_MS);
            resumeDeadline = window.setTimeout(
                stopResumeReassert,
                RESUME_FOCUS_GRACE_MS,
            );
        };

        const rememberConsoleFocus = (event: FocusEvent) => {
            const target = event.target;
            if (!(target instanceof HTMLElement) || !target.closest(CAR_CONSOLE_SELECTOR)) {
                return;
            }
            const focusKey = target.dataset.tvFocusKey;
            if (focusKey) lastConsoleFocusKey = focusKey;
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') scheduleResumeFocus();
        };

        document.addEventListener('focusin', rememberConsoleFocus, true);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', scheduleResumeFocus);
        window.addEventListener('pageshow', scheduleResumeFocus);
        window.addEventListener('keydown', stopFocusReassert, true);
        window.addEventListener('pointerdown', stopFocusReassert, true);
        window.addEventListener('touchstart', stopFocusReassert, true);
        initialInterval = window.setInterval(reassertCarFocus, INITIAL_FOCUS_INTERVAL_MS);
        initialDeadline = window.setTimeout(stopInitialReassert, INITIAL_FOCUS_GRACE_MS);
        reassertCarFocus();

        return () => {
            stopped = true;
            stopInitialReassert();
            stopResumeReassert();
            document.removeEventListener('focusin', rememberConsoleFocus, true);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', scheduleResumeFocus);
            window.removeEventListener('pageshow', scheduleResumeFocus);
            window.removeEventListener('keydown', stopFocusReassert, true);
            window.removeEventListener('pointerdown', stopFocusReassert, true);
            window.removeEventListener('touchstart', stopFocusReassert, true);
        };
    }, [enabled]);
};
