import { useCallback, useEffect, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';
import Sidebar from '@/components/Sidebar';
import AsciiOutput from '@/components/AsciiOutput';
import { imageToAscii, type AsciiOptions } from '@/lib/ascii';
import { loadImage, saveImage, removeImage as removeStoredImage } from '@/lib/imageStore';

export const DEFAULT_OPTIONS: AsciiOptions = {
	width: 100,
	contrast: 0,
	font: 'Courier New',
	charset: 'Standard',
	inverted: false,
	colorMode: false,
	textColor: '#ffffff',
	bgColor: '#000000'
};

const OPTIONS_KEY = 'glyphic-options';

function loadStoredOptions(): AsciiOptions {
	try {
		const raw = localStorage.getItem(OPTIONS_KEY);
		if (!raw) return { ...DEFAULT_OPTIONS };
		const parsed = JSON.parse(raw) as Partial<AsciiOptions>;
		return { ...DEFAULT_OPTIONS, ...parsed };
	} catch {
		return { ...DEFAULT_OPTIONS };
	}
}

// Generation-relevant subset of options. Font, textColor and bgColor are
// applied via CSS and don't need regeneration.
interface GenParams {
	width: number;
	contrast: number;
	charset: AsciiOptions['charset'];
	inverted: boolean;
	colorMode: boolean;
}

function toGenParams(opts: AsciiOptions): GenParams {
	return {
		width: opts.width,
		contrast: opts.contrast,
		charset: opts.charset,
		inverted: opts.inverted,
		colorMode: opts.colorMode
	};
}

function isSameGenParams(a: GenParams | null, b: GenParams): boolean {
	return (
		a !== null &&
		a.width === b.width &&
		a.contrast === b.contrast &&
		a.charset === b.charset &&
		a.inverted === b.inverted &&
		a.colorMode === b.colorMode
	);
}

export default function App() {
	const [options, setOptions] = useState<AsciiOptions>(loadStoredOptions);
	const [sidebarOpen, setSidebarOpen] = useState(false);

	const [ascii, setAscii] = useState<{ text: string; html?: string } | null>(null);
	const imageUrlRef = useRef<string | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);

	// Latest options for use inside debounced timers.
	// Reading from a ref avoids stale closures when a timer fires after
	// several rapid slider updates, and keeps stable callbacks fresh.
	const optionsRef = useRef(options);
	optionsRef.current = options;

	// Pending debounce timer for regeneration (~120ms after the last change).
	const debounceTimerRef = useRef<number | null>(null);

	// Pending timer for debounced localStorage persistence (~400ms trailing).
	const persistTimerRef = useRef<number | null>(null);

	// Params of the last generation run; used to skip redundant work when
	// the effect re-fires without an actual generation-relevant change.
	const lastGenParamsRef = useRef<GenParams | null>(null);

	// Stable: reads latest options/image URL via refs, so the empty-deps
	// identity never goes stale and memoized children don't re-render
	// from callback identity alone.
	const generateAscii = useCallback(
		async (
			url: string = imageUrlRef.current!,
			opts: AsciiOptions = optionsRef.current
		) => {
			if (!url) return;
			// Record what we're generating with so the debounced effect can skip
			// redundant runs when deps re-fire without a real param change
			// (e.g. mount after IndexedDB restore, or upload).
			lastGenParamsRef.current = toGenParams(opts);
			setIsGenerating(true);
			try {
				setAscii(await imageToAscii(url, opts));
			} catch (error) {
				console.error('Failed to generate ASCII:', error);
				toast.error('Failed to generate ASCII');
			} finally {
				setIsGenerating(false);
			}
		},
		[]
	);

	const handleImageUpload = useCallback(
		(file: File) => {
			if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
			// A fresh image makes any pending debounced regen obsolete; cancel it
			// so it can't fire a duplicate conversion for the new URL.
			if (debounceTimerRef.current !== null) {
				window.clearTimeout(debounceTimerRef.current);
				debounceTimerRef.current = null;
			}
			const url = URL.createObjectURL(file);
			imageUrlRef.current = url;
			toast.success('Image uploaded');
			void generateAscii(url, optionsRef.current);
			try {
				void saveImage(file).catch(() => {
					// Silent: image persistence is best-effort.
				});
			} catch {
				// Silent: IndexedDB failures must not break the app.
			}
		},
		[generateAscii]
	);

	const handleResetOptions = useCallback(() => {
		setOptions({ ...DEFAULT_OPTIONS });
		toast.success('Settings reset');
	}, []);

	const handleRemoveImage = useCallback(() => {
		if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
		imageUrlRef.current = null;
		// Cancel any pending debounced regen (its imageUrlRef guard would
		// already skip, but don't leave a stale timer around).
		if (debounceTimerRef.current !== null) {
			window.clearTimeout(debounceTimerRef.current);
			debounceTimerRef.current = null;
		}
		setAscii(null);
		setIsGenerating(false);
		toast.success('Image removed');
		try {
			void removeStoredImage().catch(() => {
				// Silent: image persistence is best-effort.
			});
		} catch {
			// Silent: IndexedDB failures must not break the app.
		}
	}, []);

	// Paste an image from the clipboard anywhere in the app (Ctrl+V).
	useEffect(() => {
		function handlePaste(e: ClipboardEvent) {
			const items = e.clipboardData?.items;
			if (!items) return;
			for (const item of items) {
				if (item.type.startsWith('image/')) {
					const file = item.getAsFile();
					if (file) {
						handleImageUpload(file);
						e.preventDefault();
						break;
					}
				}
			}
		}
		window.addEventListener('paste', handlePaste);
		return () => window.removeEventListener('paste', handlePaste);
	}, [handleImageUpload]);

	// Restore the last uploaded image from IndexedDB on mount, if present.
	// Options were already restored synchronously via loadStoredOptions().
	useEffect(() => {
		let cancelled = false;
		let restoredUrl: string | null = null;
		void (async () => {
			try {
				const blob = await loadImage();
				if (!blob || cancelled) return;
				restoredUrl = URL.createObjectURL(blob);
				imageUrlRef.current = restoredUrl;
				await generateAscii(restoredUrl, optionsRef.current);
			} catch {
				// Silent: image persistence is best-effort.
			}
		})();
		return () => {
			cancelled = true;
			if (restoredUrl) URL.revokeObjectURL(restoredUrl);
		};
	}, [generateAscii]);

	// Persist options to localStorage, debounced (~400ms trailing) so slider
	// drags / color drags don't write on every input tick. Latest options
	// are read via optionsRef; cleanup clears the pending timer.
	useEffect(() => {
		if (persistTimerRef.current !== null) {
			window.clearTimeout(persistTimerRef.current);
		}
		persistTimerRef.current = window.setTimeout(() => {
			persistTimerRef.current = null;
			try {
				localStorage.setItem(OPTIONS_KEY, JSON.stringify(optionsRef.current));
			} catch {
				// Silent: storage may be full or unavailable.
			}
		}, 400);
		return () => {
			if (persistTimerRef.current !== null) {
				window.clearTimeout(persistTimerRef.current);
				persistTimerRef.current = null;
			}
		};
	}, [options]);

	// Regenerate when generation-relevant options change, debounced so dragging
	// the resolution/contrast sliders doesn't trigger a full imageToAscii
	// conversion per input event. The latest options are read via optionsRef
	// (no stale closure); the pending timer is cancelled on every change and
	// on unmount. Runs with identical params to the last run are skipped.
	// Font, textColor and bgColor are applied via CSS and don't need regeneration.
	const { width, contrast, charset, inverted, colorMode } = options;
	useEffect(() => {
		if (!imageUrlRef.current) return;
		const params: GenParams = { width, contrast, charset, inverted, colorMode };
		if (isSameGenParams(lastGenParamsRef.current, params)) return;
		if (debounceTimerRef.current !== null) {
			window.clearTimeout(debounceTimerRef.current);
		}
		debounceTimerRef.current = window.setTimeout(() => {
			debounceTimerRef.current = null;
			const latest = optionsRef.current;
			const latestParams = toGenParams(latest);
			// Re-check: another path (upload/restore) may have already
			// generated with these exact params while we waited.
			if (isSameGenParams(lastGenParamsRef.current, latestParams)) return;
			if (imageUrlRef.current) {
				void generateAscii(imageUrlRef.current, { ...latest });
			}
		}, 120);
		return () => {
			if (debounceTimerRef.current !== null) {
				window.clearTimeout(debounceTimerRef.current);
				debounceTimerRef.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [width, contrast, charset, inverted, colorMode]);

	// Safety net on unmount: cancel any pending debounced regeneration and
	// flush the latest options to localStorage (trailing write) so no
	// debounced persistence change is lost.
	useEffect(() => {
		return () => {
			if (debounceTimerRef.current !== null) {
				window.clearTimeout(debounceTimerRef.current);
				debounceTimerRef.current = null;
			}
			if (persistTimerRef.current !== null) {
				window.clearTimeout(persistTimerRef.current);
				persistTimerRef.current = null;
			}
			try {
				localStorage.setItem(OPTIONS_KEY, JSON.stringify(optionsRef.current));
			} catch {
				// Silent: storage may be full or unavailable.
			}
		};
	}, []);

	return (
		<div className="relative flex h-screen w-full bg-background text-foreground overflow-hidden">
			<a
				href="https://github.com/horizzon3507/"
				target="_blank"
				rel="noopener noreferrer"
				aria-label="GitHub"
				className="absolute top-4 right-4 z-50 flex items-center justify-center border border-foreground/20 bg-background/80 px-3 py-1.5 rounded-md hover:bg-accent transition-colors"
			>
				<svg viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4" aria-hidden="true">
					<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
				</svg>
			</a>
			<Sidebar
				options={options}
				onOptionsChange={setOptions}
				onImageUpload={handleImageUpload}
				onRemoveImage={handleRemoveImage}
				open={sidebarOpen}
				onOpenChange={setSidebarOpen}
			/>

			{/* Mobile menu button: terminal-style square, top-left */}
			{!sidebarOpen && (
				<button
					type="button"
					onClick={() => setSidebarOpen(true)}
					aria-label="Open settings menu"
					className="fixed top-4 left-4 z-50 flex md:hidden h-10 w-10 items-center justify-center border-2 border-primary bg-black font-mono text-lg font-bold uppercase text-primary hover:bg-primary hover:text-black transition-colors"
				>
					≡
				</button>
			)}

			{/* Invisible backdrop: tap output area to close drawer on mobile */}
			{sidebarOpen && (
				<button
					type="button"
					aria-label="Close settings menu"
					onClick={() => setSidebarOpen(false)}
					className="fixed inset-0 z-30 bg-black/50 md:hidden cursor-default"
				/>
			)}

			{ascii ? (
				<AsciiOutput
					ascii={ascii}
					options={options}
					onResetOptions={handleResetOptions}
				/>
			) : isGenerating ? (
				<div className="flex-1 flex items-center justify-center text-muted-foreground">
					<div className="text-center px-4">
						<p className="text-xl md:text-2xl font-medium animate-pulse">Generating...</p>
					</div>
				</div>
			) : (
				<div className="flex-1 flex items-center justify-center text-muted-foreground">
					<div className="text-center px-4">
						<p className="text-xl md:text-2xl font-medium">Glyphic</p>
						<p className="text-sm">Paste or upload an image to start</p>
					</div>
				</div>
			)}

			<Toaster
				theme="dark"
				className="font-mono"
				style={{
					fontFamily: "'Courier New', monospace",
					'--border-radius': 0
				} as React.CSSProperties}
				toastOptions={{
					style: {
						borderRadius: 0,
						background: '#000',
						color: '#fff',
						border: '2px solid #fff'
					}
				}}
			/>
			<div className="scanlines" />
			<div className="crt-flicker" />
		</div>
	);
}
