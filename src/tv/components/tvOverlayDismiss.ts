// src/tv/components/tvOverlayDismiss.ts

import type { MouseEvent } from 'react';

/** Car overlays close from the surrounding touch surface instead of a remote-style close button. */
export const dismissTvOverlayOnBackdrop = (
    onClose?: () => void,
): ((event: MouseEvent<HTMLElement>) => void) | undefined => {
    if (!onClose) return undefined;
    return event => {
        if (event.target === event.currentTarget) onClose();
    };
};
