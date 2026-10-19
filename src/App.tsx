import { useEffect, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';
import Sidebar from '@/components/Sidebar';
import AsciiOutput from '@/components/AsciiOutput';
import { imageToAscii, type AsciiOptions } from '@/lib/ascii';

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

export default function App() {
	const [options, setOptions] = useState<AsciiOptions>({ ...DEFAULT_OPTIONS });
	const optionsRef = useRef(options);
	optionsRef.current = options;
	const debounceTimerRef = useRef<number | null>(null);
	const lastGenParamsRef = useRef<GenParams | null>(null);
	const [ascii, setAscii] = useState<{ text: string; html?: string } | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
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

	const handleImageUpload = (file: File) => {
		if (urlRef.current) URL.revokeObjectURL(urlRef.current);
		const url = URL.createObjectURL(file);
		urlRef.current = url;
		toast.success('Image uploaded');
		setAscii(null);
		setIsGenerating(true);
		void imageToAscii(url, options)
			.then((result) => setAscii(result))
			.catch(() => toast.error('Failed to generate ASCII'))
			.finally(() => setIsGenerating(false));
	};

	const handleResetOptions = () => {
		setOptions({ ...DEFAULT_OPTIONS });
		toast.success('Settings reset');
	};

	return (
		<div className="relative flex h-screen w-full bg-background text-foreground overflow-hidden">
			<Sidebar
				options={options}
				onOptionsChange={setOptions}
				onImageUpload={handleImageUpload}
			/>

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
						<p className="text-sm">Upload an image to start</p>
					</div>
				</div>
			)}
			<Toaster theme="dark" position="bottom-center" className="font-mono" />
		</div>
	);
}
