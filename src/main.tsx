import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import {
  buildHashRouteFromPathname,
  buildHashRouteFromSpaRedirect,
  shouldPrioritizePathnameShortLink,
} from './lib/spaRedirect';

// Validate required environment variables at startup
function validateEnvironment() {
  const requiredVars = {
    'VITE_SUPABASE_URL': import.meta.env.VITE_SUPABASE_URL,
    'VITE_SUPABASE_ANON_KEY': import.meta.env.VITE_SUPABASE_ANON_KEY,
  };

  const missing = Object.entries(requiredVars)
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    const errorHtml = `
      <div style="
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 20px;
        font-family: system-ui, -apple-system, sans-serif;
        background-color: #f5f5f5;
      ">
        <div style="
          background-color: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          padding: 40px;
          max-width: 500px;
          text-align: center;
        ">
          <h1 style="fontSize: 24px; margin: 0 0 16px 0; color: #d32f2f;">Configuration Error</h1>
          <p style="fontSize: 14px; color: #666; margin: 0 0 16px 0;">
            Missing required environment variables:
          </p>
          <ul style="
            text-align: left;
            display: inline-block;
            padding: 12px 24px;
            background-color: #f9f9f9;
            border-radius: 4px;
            border: 1px solid #ddd;
            font-family: monospace;
            font-size: 12px;
            color: #d32f2f;
          ">
            ${missing.map((name) => `<li>${name}</li>`).join('')}
          </ul>
          <p style="fontSize: 12px; color: #999; margin: 16px 0 0 0;">
            Please ensure all required environment variables are set in your build configuration.
          </p>
        </div>
      </div>
    `;
    document.getElementById('root')!.innerHTML = errorHtml;
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}

// Validate environment before rendering
validateEnvironment();

const baseUrl = import.meta.env.BASE_URL ?? '/';
const pathnameHashTarget = buildHashRouteFromPathname(window.location.pathname, window.location.search, baseUrl);
const currentHashPath = window.location.hash.startsWith('#')
  ? (window.location.hash.slice(1).split('?')[0] || '/')
  : '/';

// If a public short-link path is present in pathname, always honor it over stale hash routes.
if (shouldPrioritizePathnameShortLink(pathnameHashTarget, currentHashPath)) {
  window.history.replaceState(null, '', pathnameHashTarget);
}

const pendingRedirect = window.sessionStorage.getItem('spa_redirect');
if (pendingRedirect) {
  const next = buildHashRouteFromSpaRedirect(pendingRedirect, baseUrl);
  window.sessionStorage.removeItem('spa_redirect');
  if (next) {
    window.history.replaceState(null, '', next);
  }
} else if (!window.location.hash.startsWith('#/')) {
  const next = buildHashRouteFromPathname(window.location.pathname, window.location.search, baseUrl);
  if (next && next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
    window.history.replaceState(null, '', next);
  }
}

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);