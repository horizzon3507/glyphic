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

export default function App() {
	const [options, setOptions] = useState<AsciiOptions>({ ...DEFAULT_OPTIONS });
	const [ascii, setAscii] = useState<{ text: string; html?: string } | null>(null);
	const [isGenerating, setIsGenerating] = useState(false);
	const urlRef = useRef<string | null>(null);

	useEffect(() => {
		async function run() {
			const url = urlRef.current;
			if (!url) return;
			setIsGenerating(true);
			try {
				setAscii(await imageToAscii(url, options));
			} catch (error) {
				console.error('Failed to generate ASCII:', error);
				toast.error('Failed to generate ASCII');
			} finally {
				setIsGenerating(false);
			}
		}
		void run();
	}, [options, ascii ? false : urlRef.current]);

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
