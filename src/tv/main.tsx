// src/tv/main.tsx

import { Buffer } from 'buffer';
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../i18n/config';
import { installNativeAndroidBridge } from '../services/nativeAndroidBridge';
import { useOnlineProviderAccountStore } from '../stores/useOnlineProviderAccountStore';
import { TvApp } from './TvApp';
import { hydrateTvProviderAccount } from './services/tvProviderData';
import './tv.css';

// @ts-ignore The online provider adapters expect Node's Buffer during request signing.
globalThis.Buffer = Buffer;

// TV owns its own queue, so use the TV media-session bridge instead of the phone playback store.
void installNativeAndroidBridge({ installPlaybackBridge: false });
// Start restoring the active account before React mounts so the home rows can begin loading
// without waiting for the account hydration effect.
void hydrateTvProviderAccount(useOnlineProviderAccountStore.getState().activeProviderId)
    .catch(() => undefined);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find TV root element');

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        <TvApp />
    </React.StrictMode>,
);
