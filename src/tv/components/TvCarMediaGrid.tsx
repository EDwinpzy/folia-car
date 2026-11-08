// src/tv/components/TvCarMediaGrid.tsx

import type { ReactNode } from 'react';

export const TvCarMediaGrid = ({
    title,
    focusGroup,
    children,
}: {
    title: string;
    focusGroup: string;
    children: ReactNode;
}) => (
    <section className="tv-car-media-section">
        <div className="tv-row-heading">
            <h2>{title}</h2>
        </div>
        <div
            className="tv-car-media-grid"
            data-tv-focus-group={focusGroup}
        >
            {children}
        </div>
    </section>
);
