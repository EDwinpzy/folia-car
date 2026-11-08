import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadProviderAccountSnapshot } from '../../../src/services/onlineMusic/providerAccountCache';
import { useOnlineProviderAccountStore } from '../../../src/stores/useOnlineProviderAccountStore';
import { hydrateTvProviderAccount } from '../../../src/tv/services/tvProviderData';

// test/unit/tv/tvProviderData.test.ts
// TV account hydration skips IndexedDB once a provider account is already available.

vi.mock('../../../src/services/onlineMusic/providerAccountCache', () => ({
    loadProviderAccountSnapshot: vi.fn(),
}));

describe('TV provider account hydration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        useOnlineProviderAccountStore.getState().clearAccount('netease');
    });

    it('does not reread the snapshot when the account is already hydrated', async () => {
        useOnlineProviderAccountStore.getState().updateAccount('netease', {
            status: 'authenticated',
            user: { id: 'listener', nickname: 'Listener' },
            hydration: 'ready',
        });

        await hydrateTvProviderAccount('netease');

        expect(loadProviderAccountSnapshot).not.toHaveBeenCalled();
    });
});
