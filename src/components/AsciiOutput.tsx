import { useRef } from 'react';
import { toast } from 'sonner';
import { type AsciiOptions } from '@/lib/ascii';

interface AsciiOutputProps {
	ascii: { text: string; html?: string } | null;
	options: AsciiOptions;
	onResetOptions?: () => void;
}

export default function AsciiOutput({ ascii, options, onResetOptions }: AsciiOutputProps) {
	const preRef = useRef<HTMLPreElement>(null);

	function handleCopy() {
		if (!ascii) return;
		navigator.clipboard.writeText(ascii.text).then(() => toast.success('ASCII copied to clipboard'));
	}

	function saveAsImage(type: 'image/png' | 'image/jpeg') {
		if (!ascii) return;
		const lines = ascii.text.split('\n');
		const cols = Math.max(...lines.map((l) => l.length));
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const fontSize = 16;
		const charW = ctx.measureText('M').width || fontSize * 0.6;
		ctx.font = `${fontSize}px ${options.font}, monospace`;
		const charW2 = ctx.measureText('M').width || fontSize * 0.6;
		canvas.width = Math.ceil(cols * charW2) + 32;
		canvas.height = Math.ceil(lines.length * fontSize * 1.15) + 32;
		ctx.font = `${fontSize}px ${options.font}, monospace`;
		ctx.fillStyle = options.bgColor;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.fillStyle = options.textColor;
		ctx.textBaseline = 'top';
		lines.forEach((line, i) => ctx.fillText(line, 16, 16 + i * fontSize * 1.15));
		canvas.toBlob((blob) => {
			if (!blob) return;
			const a = document.createElement('a');
			a.href = URL.createObjectURL(blob);
			a.download = `glyphic.${type === 'image/png' ? 'png' : 'jpg'}`;
			a.click();
			URL.revokeObjectURL(a.href);
		}, type, 0.92);
	}

	return (
		<div className="flex h-full flex-col border-2 border-primary bg-black">
			<div className="flex flex-wrap items-center gap-2 border-b-2 border-primary p-2">
				<span className="font-bold uppercase tracking-widest text-xs text-foreground">ASCII Output</span>
				<div className="ml-auto flex flex-wrap gap-2">
					<button
						type="button"
						onClick={handleCopy}
						disabled={!ascii}
						className="border-2 border-primary bg-black px-3 py-1 text-xs uppercase text-primary cursor-pointer enabled:hover:bg-primary enabled:hover:text-black disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:outline-2 focus-visible:outline-white"
					>
						Copy ASCII
					</button>
					<button
						type="button"
						onClick={() => saveAsImage('image/png')}
						disabled={!ascii}
						className="border-2 border-primary bg-black px-3 py-1 text-xs uppercase text-primary cursor-pointer enabled:hover:bg-primary enabled:hover:text-black disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:outline-2 focus-visible:outline-white"
					>
						Save PNG
					</button>
					<button
						type="button"
						onClick={() => saveAsImage('image/jpeg')}
						disabled={!ascii}
						className="border-2 border-primary bg-black px-3 py-1 text-xs uppercase text-primary cursor-pointer enabled:hover:bg-primary enabled:hover:text-black disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:outline-2 focus-visible:outline-white"
					>
						Save JPG
					</button>
					{onResetOptions && (
						<button
							type="button"
							onClick={onResetOptions}
							className="border-2 border-primary bg-black px-3 py-1 text-xs uppercase text-primary cursor-pointer hover:bg-primary hover:text-black focus:outline-none focus-visible:outline-2 focus-visible:outline-white"
						>
							Reset
						</button>
					)}
				</div>
			</div>
			<div className="min-h-0 flex-1 overflow-auto p-4">
				{ascii ? (
					<pre
						ref={preRef}
						className="whitespace-pre font-mono text-sm leading-tight"
						style={{ backgroundColor: options.bgColor, color: options.textColor }}
					>
						{ascii.text}
					</pre>
				) : (
					<p className="font-mono text-sm text-muted-foreground">No image yet. Upload one to begin.</p>
				)}
			</div>
		</div>
	);
}
