// src/car/useCarInputModality.ts

import { useEffect } from 'react';

const TOUCH_INPUT_CLASS = 'is-touch-input';

/**
 * Car screens are touch-first. Keep TV focus styling available for steering-wheel and head-unit
 * keys, but do not leave remote-control focus rings on controls the driver just tapped.
 */
export const useCarInputModality = (enabled: boolean): void => {
    useEffect(() => {
        if (!enabled) return undefined;
        const app = document.querySelector<HTMLElement>('.tv-app.is-car');
        if (!app) return undefined;

        const useTouchInput = () => app.classList.add(TOUCH_INPUT_CLASS);
        const useKeyboardInput = () => app.classList.remove(TOUCH_INPUT_CLASS);

        useTouchInput();
        window.addEventListener('pointerdown', useTouchInput, true);
        window.addEventListener('touchstart', useTouchInput, true);
        window.addEventListener('keydown', useKeyboardInput, true);
        return () => {
            window.removeEventListener('pointerdown', useTouchInput, true);
            window.removeEventListener('touchstart', useTouchInput, true);
            window.removeEventListener('keydown', useKeyboardInput, true);
            app.classList.remove(TOUCH_INPUT_CLASS);
        };
    }, [enabled]);
};
