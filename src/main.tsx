import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import '@fontsource/fira-code';
import '@fontsource/ibm-plex-mono';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource/press-start-2p';
import '@fontsource/share-tech-mono';
import '@fontsource/space-mono';
import '@fontsource/vt323';
import './app.css';

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<App />
	</StrictMode>
);
