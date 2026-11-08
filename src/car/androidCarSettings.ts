// src/car/androidCarSettings.ts

export type DefaultMusicSettingsMode =
    | 'default-apps'
    | 'app-details'
    | 'settings'
    | 'unavailable'
    | 'none';

export type DefaultMusicSettingsResult = {
    opened: boolean;
    mode: DefaultMusicSettingsMode;
};

type AndroidCarSettingsPlugin = {
    openDefaultMusicSettings?: () => Promise<{
        opened?: boolean;
        mode?: string;
    }>;
};

const readPlugin = (): AndroidCarSettingsPlugin | null => {
    if (typeof window === 'undefined') return null;
    const capacitor = (window as unknown as {
        Capacitor?: {
            getPlatform?: () => string;
            Plugins?: { FoliaNative?: AndroidCarSettingsPlugin };
        };
    }).Capacitor;
    if (capacitor?.getPlatform?.() !== 'android') return null;
    return capacitor.Plugins?.FoliaNative ?? null;
};

/**
 * Opens the nearest system page for choosing a default music app. Android intentionally has no
 * API that can force this choice; the car UI must hand the final step to the user.
 */
export const openDefaultMusicPlayerSettings = async (): Promise<DefaultMusicSettingsResult> => {
    const plugin = readPlugin();
    if (!plugin?.openDefaultMusicSettings) {
        return { opened: false, mode: 'unavailable' };
    }
    try {
        const response = await plugin.openDefaultMusicSettings();
        const mode = response?.mode;
        return {
            opened: response?.opened === true,
            mode: mode === 'default-apps'
                || mode === 'app-details'
                || mode === 'settings'
                || mode === 'none'
                ? mode
                : 'none',
        };
    } catch {
        return { opened: false, mode: 'unavailable' };
    }
};
