// Minimal IndexedDB persistence for the last uploaded image.
// Single record under key 'last-image', stored as a plain Blob. No dependencies.
// All exported functions reject on failure — callers must catch and treat
// persistence as best-effort so storage failures never break the app.

const DB_NAME = 'glyphic-db';
const STORE_NAME = 'images';
const KEY = 'last-image';

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		try {
			const request = indexedDB.open(DB_NAME, 1);
			request.onupgradeneeded = () => {
				const db = request.result;
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME);
				}
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () =>
				reject(request.error ?? new Error('Failed to open IndexedDB'));
		} catch (err) {
			reject(err);
		}
	});
}

export async function saveImage(blob: Blob): Promise<void> {
	const db = await openDb();
	try {
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readwrite');
			const store = tx.objectStore(STORE_NAME);
			const request = store.put(blob, KEY);
			request.onsuccess = () => resolve();
			request.onerror = () =>
				reject(request.error ?? new Error('Failed to store image'));
		});
	} finally {
		db.close();
	}
}

export async function loadImage(): Promise<Blob | null> {
	const db = await openDb();
	try {
		const result = await new Promise<unknown>((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readonly');
			const store = tx.objectStore(STORE_NAME);
			const request = store.get(KEY);
			request.onsuccess = () => resolve(request.result);
			request.onerror = () =>
				reject(request.error ?? new Error('Failed to load image'));
		});
		return result instanceof Blob ? result : null;
	} finally {
		db.close();
	}
}

export async function removeImage(): Promise<void> {
	const db = await openDb();
	try {
		await new Promise<void>((resolve, reject) => {
			const tx = db.transaction(STORE_NAME, 'readwrite');
			const store = tx.objectStore(STORE_NAME);
			const request = store.delete(KEY);
			request.onsuccess = () => resolve();
			request.onerror = () =>
				reject(request.error ?? new Error('Failed to remove image'));
		});
	} finally {
		db.close();
	}
}
