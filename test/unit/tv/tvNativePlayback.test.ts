import { describe, expect, it } from 'vitest';
import type { SongResult } from '../../../src/types';
import {
    buildTvNativePlaybackIdentity,
    buildTvNativePlaybackPayload,
    resolveTvNativeMediaAction,
    resolveTvNativeMediaActionForTarget,
} from '../../../src/tv/services/tvNativePlayback';

// test/unit/tv/tvNativePlayback.test.ts

const song = {
    id: 42,
    name: '夜航星',
    artists: [{ id: 1, name: '测试歌手' }],
    album: { id: 1, name: '星海', coverUrl: 'https://example.com/cover.jpg' },
    durationMs: 215000,
    sourceRef: { kind: 'online', providerId: 'netease', mediaId: '42' },
} as SongResult;

describe('TV native playback bridge', () => {
    it('builds a TV-owned native session snapshot', () => {
        const payload = buildTvNativePlaybackPayload({
            song,
            queue: [song],
            status: 'playing',
            positionSeconds: 12.4,
            durationSeconds: 215,
            launchTarget: 'car',
        });

        expect(payload).toEqual(expect.objectContaining({
            title: '夜航星',
            artist: '测试歌手',
            album: '星海',
            coverUrl: 'https://example.com/cover.jpg',
            songKey: 'online:netease:42',
            playing: true,
            position: 12400,
            duration: 215000,
            launchTarget: 'car',
            requestNotificationPermission: false,
        }));
        expect(payload?.queue).toEqual([expect.objectContaining({
            index: 0,
            title: '夜航星',
            artist: '测试歌手',
            songKey: 'online:netease:42',
            duration: 215000,
        })]);
    });

    it('does not publish or restart the service without a song', () => {
        expect(buildTvNativePlaybackPayload({
            song: null,
            status: 'idle',
            positionSeconds: 0,
            durationSeconds: 0,
        })).toBeNull();
    });

    it('deduplicates unchanged metadata but keeps seek positions distinct', () => {
        const first = buildTvNativePlaybackPayload({
            song,
            status: 'playing',
            positionSeconds: 10,
            durationSeconds: 215,
        })!;
        const second = buildTvNativePlaybackPayload({
            song,
            status: 'playing',
            positionSeconds: 18,
            durationSeconds: 215,
        })!;

        expect(buildTvNativePlaybackIdentity(first)).toBe(buildTvNativePlaybackIdentity(first));
        expect(buildTvNativePlaybackIdentity(first)).not.toBe(buildTvNativePlaybackIdentity(second));
    });

    it('keeps native media actions inside the TV vocabulary', () => {
        expect(resolveTvNativeMediaAction('play')).toBe('play');
        expect(resolveTvNativeMediaAction('pause')).toBe('pause');
        expect(resolveTvNativeMediaAction('toggle')).toBe('toggle');
        expect(resolveTvNativeMediaAction('next')).toBe('next');
        expect(resolveTvNativeMediaAction('previous')).toBe('previous');
        expect(resolveTvNativeMediaAction('stop')).toBe('stop');
        expect(resolveTvNativeMediaAction('seek')).toBe('seek');
        expect(resolveTvNativeMediaAction('seekto')).toBeNull();
        expect(resolveTvNativeMediaAction(undefined)).toBeNull();
    });

    it('maps car previous to a real track skip without changing TV behavior', () => {
        expect(resolveTvNativeMediaActionForTarget('previous', 'car')).toBe('skipPrevious');
        expect(resolveTvNativeMediaActionForTarget('previous', 'tv')).toBe('previous');
        expect(resolveTvNativeMediaActionForTarget('next', 'car')).toBe('next');
    });
});
