// src/tv/model/tvCarHome.ts

export const CAR_HOME_ROW_SIZE = 14;

export type TvCarQueueWindow<T> = {
    startIndex: number;
    songs: T[];
};

/** Keeps a car home row small while keeping the current queue item visible. */
export const selectTvCarQueueWindow = <T>(
    queue: readonly T[],
    currentIndex: number,
    limit = CAR_HOME_ROW_SIZE,
): TvCarQueueWindow<T> => {
    if (queue.length === 0 || limit <= 0) return { startIndex: 0, songs: [] };
    if (queue.length <= limit) return { startIndex: 0, songs: [...queue] };

    const safeCurrentIndex = Math.max(0, Math.min(currentIndex, queue.length - 1));
    const startIndex = Math.max(
        0,
        Math.min(
            safeCurrentIndex - Math.floor(limit / 2),
            queue.length - limit,
        ),
    );
    return {
        startIndex,
        songs: queue.slice(startIndex, startIndex + limit),
    };
};
