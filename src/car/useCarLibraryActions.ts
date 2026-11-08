// src/car/useCarLibraryActions.ts

import { useCallback, useRef, useState } from 'react';
import {
    isAndroidNativeRuntime,
    pickAndroidLocalMusic,
    scanAndroidDeviceMusic,
} from '../services/nativeLocalMusic';
import {
    openDefaultMusicPlayerSettings,
    type DefaultMusicSettingsMode,
} from './androidCarSettings';

export type CarLibraryActionKind = 'scan' | 'import' | 'default-player';

export type CarLibraryActionResult = {
    kind: CarLibraryActionKind;
    status: 'success' | 'empty' | 'error' | 'unavailable';
    count?: number;
    settingsMode?: DefaultMusicSettingsMode;
};

export type CarLibraryActionsModel = {
    busy: CarLibraryActionKind | null;
    result: CarLibraryActionResult | null;
    scanDeviceMusic: () => Promise<void>;
    importMusic: () => Promise<void>;
    openDefaultPlayerSettings: () => Promise<void>;
};

/** Car-only local-library actions. The shared TV library supplies the post-import refresh. */
export const useCarLibraryActions = (
    refreshLocalSongs: () => Promise<number>,
): CarLibraryActionsModel => {
    const [busy, setBusy] = useState<CarLibraryActionKind | null>(null);
    const [result, setResult] = useState<CarLibraryActionResult | null>(null);
    const busyRef = useRef(false);

    const run = useCallback(async (
        kind: CarLibraryActionKind,
        action: () => Promise<CarLibraryActionResult>,
    ) => {
        if (busyRef.current) return;
        busyRef.current = true;
        setBusy(kind);
        setResult(null);
        try {
            setResult(await action());
        } catch (error) {
            console.warn('[Car] Library action failed', error);
            setResult({ kind, status: 'error' });
        } finally {
            busyRef.current = false;
            setBusy(null);
        }
    }, []);

    const scanDeviceMusic = useCallback(async () => {
        await run('scan', async () => {
            if (!isAndroidNativeRuntime()) {
                return { kind: 'scan', status: 'unavailable' };
            }
            await scanAndroidDeviceMusic();
            const count = await refreshLocalSongs();
            return {
                kind: 'scan',
                status: count > 0 ? 'success' : 'empty',
                count,
            };
        });
    }, [refreshLocalSongs, run]);

    const importMusic = useCallback(async () => {
        await run('import', async () => {
            if (!isAndroidNativeRuntime()) {
                return { kind: 'import', status: 'unavailable' };
            }
            await pickAndroidLocalMusic();
            const count = await refreshLocalSongs();
            return {
                kind: 'import',
                status: count > 0 ? 'success' : 'empty',
                count,
            };
        });
    }, [refreshLocalSongs, run]);

    const openDefaultPlayerSettings = useCallback(async () => {
        await run('default-player', async () => {
            const response = await openDefaultMusicPlayerSettings();
            return {
                kind: 'default-player',
                status: response.opened ? 'success' : 'unavailable',
                settingsMode: response.mode,
            };
        });
    }, [run]);

    return {
        busy,
        result,
        scanDeviceMusic,
        importMusic,
        openDefaultPlayerSettings,
    };
};
