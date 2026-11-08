import { describe, expect, it } from 'vitest';
import {
    isTvLikedSnapshotCurrent,
    resolveTvLikedOwnerKey,
} from '../../../src/tv/model/tvLikedSongs';

describe('TV liked-song ownership', () => {
    it('separates providers, accounts and liked collections', () => {
        expect(resolveTvLikedOwnerKey('netease', 'account-a', null)).toBe(
            'netease:account-a:provider',
        );
        expect(resolveTvLikedOwnerKey('netease', 'account-b', null)).not.toBe(
            resolveTvLikedOwnerKey('netease', 'account-a', null),
        );
        expect(resolveTvLikedOwnerKey('kugou', 'account-a', null)).not.toBe(
            resolveTvLikedOwnerKey('netease', 'account-a', null),
        );
        expect(resolveTvLikedOwnerKey('netease', 'account-a', 'liked-a')).not.toBe(
            resolveTvLikedOwnerKey('netease', 'account-a', 'liked-b'),
        );
    });

    it('does not expose the previous account snapshot while the next account loads', () => {
        const accountA = resolveTvLikedOwnerKey('netease', 'account-a', null);
        const accountB = resolveTvLikedOwnerKey('netease', 'account-b', null);

        expect(isTvLikedSnapshotCurrent(accountA, accountA)).toBe(true);
        expect(isTvLikedSnapshotCurrent(accountA, accountB)).toBe(false);
        expect(isTvLikedSnapshotCurrent(null, null)).toBe(false);
    });
});
