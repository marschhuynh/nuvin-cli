import './style.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as WailsBinding from '@wails/binding';

import App from './App';
// import { enableGlobalFetchProxy } from './lib';

// enableGlobalFetchProxy();

const container = document.getElementById('root');

if (!container) {
  throw new Error('Root container not found');
}

const root = createRoot(container);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

try {
  WailsBinding.Debug.LogRandomTest();
} catch (e) {
  console.warn('Error invoking Debug.LogRandomTest:', e);
}
