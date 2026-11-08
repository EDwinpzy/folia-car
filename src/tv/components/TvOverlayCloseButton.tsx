// src/tv/components/TvOverlayCloseButton.tsx

import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const TvOverlayCloseButton = ({ onClose }: { onClose: () => void }) => {
    const { t } = useTranslation();

    return (
        <button
            type="button"
            className="tv-overlay-close"
            data-tv-focusable="true"
            data-tv-focus-key="overlay-close"
            aria-label={t('ui.close')}
            onClick={onClose}
        >
            <X size={22} />
        </button>
    );
};
