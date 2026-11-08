import { describe, expect, it } from 'vitest';
import type { SongResult } from '../../src/types';
import { selectTvVoicePlayQueue } from '../../src/tv/model/tvVoicePlay';

const song = (id: number, name: string, artist = '周杰伦'): SongResult => ({
    id,
    name,
    artists: [{ id: 1, name: artist }],
    album: { id: 1, name: 'Album' },
    durationMs: 240_000,
    sourceRef: { kind: 'online', providerId: 'kugou', mediaId: String(id) },
});

describe('selectTvVoicePlayQueue', () => {
    it('prefers an exact title over the provider order', () => {
        const selection = selectTvVoicePlayQueue(
            [song(1, '晴天 (Live)'), song(2, '晴天')],
            '晴天',
        );
        expect(selection?.startIndex).toBe(1);
        expect(selection?.songs[1]?.name).toBe('晴天');
    });

    it('matches the artist when the query includes it', () => {
        const selection = selectTvVoicePlayQueue(
            [song(1, '稻香'), song(2, '夜曲', '周杰伦')],
            '周杰伦',
        );
        expect(selection?.startIndex).toBe(0);
    });

    it('returns null when there is nothing to play', () => {
        expect(selectTvVoicePlayQueue([], '晴天')).toBeNull();
    });
});
