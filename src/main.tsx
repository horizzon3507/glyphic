import { createRoot } from 'react-dom/client';
import '@fontsource/fira-code';
import '@fontsource/press-start-2p';
import '@fontsource/share-tech-mono';
import '@fontsource/vt323';
import './app.css';

// Boot stub: mounts with the bundled fonts offline until the app shell
// wiring lands. Replaced by the app-shell commit with <App />.
createRoot(document.getElementById('root')!).render('Glyphic');
