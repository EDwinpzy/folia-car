// src/car/main.tsx

import { Buffer } from 'buffer';
import React from 'react';
import ReactDOM from 'react-dom/client';
import '../i18n/config';
import { installNativeAndroidBridge } from '../services/nativeAndroidBridge';
import { useOnlineProviderAccountStore } from '../stores/useOnlineProviderAccountStore';
import { TvApp } from '../tv/TvApp';
import { hydrateTvProviderAccount } from '../tv/services/tvProviderData';
import '../tv/tv.css';

// @ts-ignore The online provider adapters expect Node's Buffer during request signing.
globalThis.Buffer = Buffer;

void installNativeAndroidBridge({ installPlaybackBridge: false });
void hydrateTvProviderAccount(useOnlineProviderAccountStore.getState().activeProviderId)
    .catch(() => undefined);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find car root element');

ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
        <TvApp variant="car" />
    </React.StrictMode>,
);
