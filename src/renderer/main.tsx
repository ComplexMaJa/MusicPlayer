import React from 'react';
import ReactDOM from 'react-dom/client';
import { App, ErrorBoundary } from './App';
import './index.css';

if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection in renderer:', event.reason);
  });
  window.addEventListener('error', (event) => {
    console.error('Unhandled error in renderer:', event.error || event.message);
  });
}

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary variant="root" title="MaJa Player encountered a fatal error">
        <App />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
