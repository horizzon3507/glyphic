import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { type AsciiOptions } from '@/lib/ascii';

interface AsciiOutputProps {
	ascii: { text: string; html?: string } | null;
	options: AsciiOptions;
	onResetOptions?: () => void;
}

type Format = 'PNG' | 'JPG' | 'SVG' | 'TXT' | 'HTML';

function escapeHtmlChar(ch: string): string {
	switch (ch) {
		case '&': return '&amp;';
		case '<': return '&lt;';
		case '>': return '&gt;';
		case '"': return '&quot;';
		default: return ch;
	}
}

function download(blob: Blob, filename: string) {
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = filename;
	a.click();
	URL.revokeObjectURL(a.href);
}

export default function AsciiOutput({ ascii, options, onResetOptions }: AsciiOutputProps) {
	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!menuOpen) return;
		function onClick(e: MouseEvent) {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
		}
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape') setMenuOpen(false);
		}
		window.addEventListener('mousedown', onClick);
		window.addEventListener('keydown', onKey);
		return () => {
			window.removeEventListener('mousedown', onClick);
			window.removeEventListener('keydown', onKey);
		};
	}, [menuOpen]);

	function handleCopy() {
		if (!ascii) return;
		navigator.clipboard.writeText(ascii.text).then(() => toast.success('ASCII copied to clipboard'));
	}

	function measure() {
		const c = document.createElement('canvas').getContext('2d')!;
		return c;
	}

	function saveAsImage(type: 'image/png' | 'image/jpeg') {
		if (!ascii) return;
		const lines = ascii.text.split('\n');
		const cols = Math.max(...lines.map((l) => l.length));
		const ctx = measure();
		const fontSize = 16;
		ctx.font = `${fontSize}px ${options.font}, monospace`;
		const charW = ctx.measureText('M').width || fontSize * 0.6;
		const canvas = document.createElement('canvas');
		canvas.width = Math.ceil(cols * charW) + 32;
		canvas.height = Math.ceil(lines.length * fontSize * 1.15) + 32;
		const c2 = canvas.getContext('2d')!;
		c2.font = ctx.font;
		c2.fillStyle = options.bgColor;
		c2.fillRect(0, 0, canvas.width, canvas.height);
		c2.fillStyle = options.textColor;
		c2.textBaseline = 'top';
		lines.forEach((line, i) => c2.fillText(line, 16, 16 + i * fontSize * 1.15));
		canvas.toBlob((blob) => {
			if (!blob) return;
			download(blob, `glyphic.${type === 'image/png' ? 'png' : 'jpg'}`);
		}, type, 0.92);
	}

	function saveAsSvg() {
		if (!ascii) return;
		const lines = ascii.text.split('\n');
		const cols = Math.max(...lines.map((l) => l.length));
		const ctx = measure();
		const fontSize = 16;
		ctx.font = `${fontSize}px ${options.font}, monospace`;
		const charW = ctx.measureText('M').width || fontSize * 0.6;
		const lineH = fontSize * 1.15;
		const useColor = options.colorMode && !!ascii.html;
		const rows = useColor
			? ascii.html!.split('<br>').map((row) => row.split(/<\/span><span[^>]*>/))
			: [];
		const tspans = rows
			.map((row, i) => `<text x="8" y="${i * lineH + fontSize}">${row.map((seg) => seg).join('')}</text>`)
			.join('\n');
		const body = useColor
			? tspans
			: lines
					.map((line, i) => `<text x="8" y="${i * lineH + fontSize}">${escapeHtmlChar(line) || ' '}</text>`)
					.join('\n');
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(cols * charW) + 16}" height="${Math.ceil(lines.length * lineH) + 16}" font-family="${options.font}, monospace" font-size="${fontSize}"><rect width="100%" height="100%" fill="${options.bgColor}"/><g fill="${options.textColor}" xml:space="preserve">${body}</g></svg>`;
		download(new Blob([svg], { type: 'image/svg+xml' }), 'glyphic.svg');
	}

	function saveAsTxt() {
		if (!ascii) return;
		download(new Blob([ascii.text], { type: 'text/plain' }), 'glyphic.txt');
	}

	function saveAsHtml() {
		if (!ascii) return;
		const body = options.colorMode && ascii.html
			? ascii.html
			: ascii.text.split('\n').map((l) => escapeHtmlChar(l) || ' ').join('<br>');
		const html = `<!doctype html><html><head><meta charset="utf-8"><title>Glyphic</title></head><body style="margin:0;background:${options.bgColor}"><pre style="margin:0;padding:16px;font-family:'${options.font}',monospace;font-size:16px;line-height:1.15;color:${options.textColor}">${body}</pre></body></html>`;
		download(new Blob([html], { type: 'text/html' }), 'glyphic.html');
	}

	const formats: Array<{ label: Format; action: () => void }> = [
		{ label: 'PNG', action: () => saveAsImage('image/png') },
		{ label: 'JPG', action: () => saveAsImage('image/jpeg') },
		{ label: 'SVG', action: saveAsSvg },
		{ label: 'TXT', action: saveAsTxt },
		{ label: 'HTML', action: saveAsHtml }
	];

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
					<div className="relative" ref={menuRef}>
						<button
							type="button"
							onClick={() => setMenuOpen((o) => !o)}
							disabled={!ascii}
							aria-expanded={menuOpen}
							className="border-2 border-primary bg-black px-3 py-1 text-xs uppercase text-primary cursor-pointer enabled:hover:bg-primary enabled:hover:text-black disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:outline-2 focus-visible:outline-white"
						>
							Export ▾
						</button>
						{menuOpen && ascii && (
							<div className="absolute right-0 z-30 mt-1 w-32 border-2 border-primary bg-black">
								{formats.map((f) => (
									<button
										key={f.label}
										type="button"
										onClick={() => {
											setMenuOpen(false);
											f.action();
										}}
										className="block w-full px-3 py-2 text-left text-xs uppercase text-primary cursor-pointer hover:bg-primary hover:text-black focus:outline-none focus-visible:outline-2 focus-visible:outline-white"
									>
										{f.label}
									</button>
								))}
							</div>
						)}
					</div>
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
					<pre className="whitespace-pre font-mono text-sm leading-tight" style={{ backgroundColor: options.bgColor, color: options.textColor }}>
						{ascii.text}
					</pre>
				) : (
					<p className="font-mono text-sm text-muted-foreground">No image yet. Upload one to begin.</p>
				)}
			</div>
		</div>
	);
}
