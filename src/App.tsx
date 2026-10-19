import { useEffect, useRef, useState } from 'react';
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

// Generation-relevant subset of options. Font and colors don't need a
// regeneration (they only change presentation).
interface GenParams {
	width: number;
	contrast: number;
	charset: AsciiOptions['charset'];
	inverted: boolean;
	colorMode: boolean;
}

function toGenParams(o: AsciiOptions): GenParams {
	return { width: o.width, contrast: o.contrast, charset: o.charset, inverted: o.inverted, colorMode: o.colorMode };
}

function sameGenParams(a: GenParams, b: GenParams) {
	return (
		a.width === b.width &&
		a.contrast === b.contrast &&
		a.charset === b.charset &&
		a.inverted === b.inverted &&
		a.colorMode === b.colorMode
	);
}

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

export default function App() {
	const [options, setOptions] = useState<AsciiOptions>(loadStoredOptions);
	const persistTimerRef = useRef<number | null>(null);
	const optionsRef = useRef(options);
	optionsRef.current = options;
	const debounceTimerRef = useRef<number | null>(null);
	const lastGenParamsRef = useRef<GenParams | null>(null);
	const [ascii, setAscii] = useState<{ text: string; html?: string } | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const urlRef = useRef<string | null>(null);

	const { width, contrast, charset, inverted, colorMode } = options;

	useEffect(() => {
		if (debounceTimerRef.current !== null) window.clearTimeout(debounceTimerRef.current);
		// ~120ms trailing debounce collapses slider bursts into one conversion.
		debounceTimerRef.current = window.setTimeout(() => {
			debounceTimerRef.current = null;
			const url = urlRef.current;
			if (!url) return;
			// Skip when a run with identical generation params already covers
			// this state (only presentation options changed).
			const params = toGenParams(optionsRef.current);
			if (lastGenParamsRef.current && sameGenParams(lastGenParamsRef.current, params)) return;
			setIsGenerating(true);
			void imageToAscii(url, optionsRef.current)
				.then((result) => {
					lastGenParamsRef.current = params;
					setAscii(result);
				})
				.catch(() => toast.error('Failed to generate ASCII'))
				.finally(() => setIsGenerating(false));
		}, 120);
		return () => {
			if (debounceTimerRef.current !== null) {
				window.clearTimeout(debounceTimerRef.current);
				debounceTimerRef.current = null;
			}
		};
	}, [width, contrast, charset, inverted, colorMode]);

	// Paste support: any image on the clipboard uploads through the same path.
	useEffect(() => {
		function onPaste(e: ClipboardEvent) {
			const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'));
			const file = item?.getAsFile();
			if (file) void handleImageUpload(file);
		}
		window.addEventListener('paste', onPaste);
		return () => window.removeEventListener('paste', onPaste);
	}, []);

	useEffect(() => {
		if (persistTimerRef.current !== null) window.clearTimeout(persistTimerRef.current);
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
	}, [options, optionsRef]);

	// Session restore: last image from IndexedDB, guarded before any
	// debounced regen timer registers the restored params as its own.
	useEffect(() => {
		void loadImage()
			.then(async (blob) => {
				if (!blob) return;
				const url = URL.createObjectURL(blob);
				urlRef.current = url;
				setAscii(await imageToAscii(url, optionsRef.current));
				lastGenParamsRef.current = toGenParams(optionsRef.current);
			})
			.catch(() => {
				// Silent: persistence is best-effort.
			});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const handleImageUpload = (file: File) => {
		if (urlRef.current) URL.revokeObjectURL(urlRef.current);
		// A fresh image invalidates any pending debounced regen.
		if (debounceTimerRef.current !== null) {
			window.clearTimeout(debounceTimerRef.current);
			debounceTimerRef.current = null;
		}
		const url = URL.createObjectURL(file);
		urlRef.current = url;
		toast.success('Image uploaded');
		setAscii(null);
		setIsGenerating(true);
		void imageToAscii(url, optionsRef.current)
			.then((result) => {
				lastGenParamsRef.current = toGenParams(optionsRef.current);
				setAscii(result);
			})
			.catch(() => toast.error('Failed to generate ASCII'))
			.finally(() => setIsGenerating(false));
		try {
			void saveImage(file).catch(() => {
				// Silent: image persistence is best-effort.
			});
		} catch {
			// Silent: IndexedDB failures must not break the app.
		}
	};

	const handleRemoveImage = () => {
		if (urlRef.current) URL.revokeObjectURL(urlRef.current);
		urlRef.current = null;
		if (debounceTimerRef.current !== null) {
			window.clearTimeout(debounceTimerRef.current);
			debounceTimerRef.current = null;
		}
		setAscii(null);
		setIsGenerating(false);
		try {
			void removeStoredImage();
		} catch {
			// Silent: storage failures must not break the flow.
		}
	};

	const handleResetOptions = () => {
		setOptions({ ...DEFAULT_OPTIONS });
		toast.success('Settings reset');
	};

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

			{sidebarOpen && (
				<button
					type="button"
					aria-label="Close settings menu"
					onClick={() => setSidebarOpen(false)}
					className="fixed inset-0 z-30 bg-black/50 md:hidden cursor-default"
				/>
			)}

			{ascii ? (
				<AsciiOutput ascii={ascii} options={options} onResetOptions={handleResetOptions} />
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
			<Toaster theme="dark" position="bottom-center" className="font-mono" />
		</div>
	);
}
