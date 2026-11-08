// src/tv/components/TvChunkFailureOverlay.tsx

import { House } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// 播放器或特效分包失败时的 TV 可操作提示层；旧 WebView 不能安全地自动刷新页面。
export const TvChunkFailureOverlay = ({ onBackHome }: { onBackHome: () => void }) => {
    const { t } = useTranslation();

    return (
        <section
            id="tv-layer-failure"
            data-tv-layer="failure"
            className="tv-overlay tv-exit-overlay tv-chunk-failure-overlay"
        >
            <div
                className="tv-overlay-panel tv-exit-panel"
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="tv-chunk-failure-title"
            >
                <div className="tv-exit-body">
                    <span className="tv-overlay-icon"><House size={22} /></span>
                    <h2 id="tv-chunk-failure-title">{t('tv.failure.title')}</h2>
                    <p className="tv-chunk-failure-hint">{t('tv.failure.hint')}</p>
                    <div className="tv-exit-actions">
                        <button
                            type="button"
                            className="tv-exit-option is-background"
                            data-tv-focusable="true"
                            data-tv-focus-key="failure-home"
                            onClick={onBackHome}
                        >
                            <House size={22} />
                            <span><strong>{t('tv.failure.home')}</strong></span>
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
};
