import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initCSP } from './lib/csp';
import { initTheme } from './lib/theme';
import './index.css';

initCSP();
initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
