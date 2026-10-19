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
	const [zoom, setZoom] = useState(1);
	const [offset, setOffset] = useState({ x: 0, y: 0 });
	const [dragging, setDragging] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const dragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

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

	function measureCtx() {
		return document.createElement('canvas').getContext('2d')!;
	}

	function saveAsImage(type: 'image/png' | 'image/jpeg') {
		if (!ascii) return;
		const lines = ascii.text.split('\n');
		const cols = Math.max(...lines.map((l) => l.length));
		const ctx = measureCtx();
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
		const ctx = measureCtx();
		const fontSize = 16;
		ctx.font = `${fontSize}px ${options.font}, monospace`;
		const charW = ctx.measureText('M').width || fontSize * 0.6;
		const lineH = fontSize * 1.15;
		const bodySvg = options.colorMode && ascii.html
			? ascii.html.split('<br>').map((row, i) => `<text x="8" y="${i * lineH + fontSize}">${row}</text>`).join('\n')
			: lines.map((line, i) => `<text x="8" y="${i * lineH + fontSize}">${escapeHtmlChar(line) || ' '}</text>`).join('\n');
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(cols * charW) + 16}" height="${Math.ceil(lines.length * lineH) + 16}" font-family="${options.font}, monospace" font-size="${fontSize}"><rect width="100%" height="100%" fill="${options.bgColor}"/><g fill="${options.textColor}" xml:space="preserve">${bodySvg}</g></svg>`;
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

	// Layout metrics for the current art + font.
	function metrics() {
		const fontSize = 16;
		const lines = ascii ? ascii.text.split('\n') : [''];
		const ctx = measureCtx();
		ctx.font = `${fontSize}px ${options.font}, monospace`;
		const charW = ctx.measureText('M').width || fontSize * 0.6;
		return {
			fontSize,
			charW,
			lineH: fontSize * 1.15,
			rows: lines.length,
			cols: Math.max(...lines.map((l) => l.length)),
			font: `${fontSize}px ${options.font}, monospace`
		};
	}

	// Rasterize the art at the current zoom into the viewport canvas.
	function draw() {
		const canvas = canvasRef.current;
		const container = containerRef.current;
		if (!canvas || !container) return;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = Math.max(1, Math.floor(container.clientWidth * dpr));
		canvas.height = Math.max(1, Math.floor(container.clientHeight * dpr));
		canvas.style.width = `${container.clientWidth}px`;
		canvas.style.height = `${container.clientHeight}px`;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		const m = metrics();
		ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, offset.x * dpr, offset.y * dpr);
		if (!ascii) {
			ctx.fillStyle = options.bgColor;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			return;
		}
		const contentW = m.cols * m.charW * zoom;
		const contentH = m.rows * m.lineH * zoom;
		if (contentW < canvas.width / dpr) ctx.fillStyle = options.bgColor;
		else ctx.fillStyle = options.bgColor;
		ctx.save();
		ctx.fillStyle = options.bgColor;
		ctx.fillRect(0, 0, m.cols * m.charW, m.rows * m.lineH);
		ctx.restore();
		ctx.font = m.font;
		ctx.fillStyle = options.textColor;
		ctx.textBaseline = 'top';
		ascii.text.split('\n').forEach((line, i) => ctx.fillText(line, 0, i * m.lineH));
	}

	useEffect(() => {
		draw();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ascii, options, zoom, offset]);

	useEffect(() => {
		function onResize() {
			draw();
		}
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	function fit() {
		const container = containerRef.current;
		if (!container || !ascii) return;
		const m = metrics();
		const z = Math.min(
			container.clientWidth / (m.cols * m.charW),
			container.clientHeight / (m.rows * m.lineH)
		);
		const clamped = Math.max(0.1, Math.min(20, z));
		setZoom(clamped);
		setOffset({
			x: Math.max(0, (container.clientWidth - m.cols * m.charW * clamped) / 2),
			y: Math.max(0, (container.clientHeight - m.rows * m.lineH * clamped) / 2)
		});
	}

	function zoomAt(factor: number, cx: number, cy: number) {
		const rect = containerRef.current?.getBoundingClientRect();
		if (!rect) return;
		const nx = cx - rect.left - (cx - rect.left - offset.x) * factor;
		const ny = cy - rect.top - (cy - rect.top - offset.y) * factor;
		setZoom(Math.max(0.1, Math.min(20, zoom * factor)));
		setOffset({ x: nx, y: ny });
	}

	function onWheel(e: React.WheelEvent) {
		e.preventDefault();
		const factor = Math.exp(-e.deltaY * 0.0015);
		zoomAt(factor, e.clientX, e.clientY);
	}

	function onPointerDown(e: React.PointerEvent) {
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		setDragging(true);
		dragStart.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
	}

	function onPointerMove(e: React.PointerEvent) {
		if (!dragging || !dragStart.current) return;
		setOffset({
			x: dragStart.current.ox + (e.clientX - dragStart.current.x),
			y: dragStart.current.oy + (e.clientY - dragStart.current.y)
		});
	}

	function onPointerUp(e: React.PointerEvent) {
		try {
			(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {
			// ignore
		}
		setDragging(false);
		dragStart.current = null;
	}

	return (
		<div className="flex h-full flex-col border-2 border-primary bg-black">
			<div className="flex flex-wrap items-center gap-2 border-b-2 border-primary p-2">
				<span className="font-bold uppercase tracking-widest text-xs text-foreground">ASCII Output</span>
				<div className="ml-auto flex flex-wrap gap-2">
					<button type="button" onClick={() => zoomAt(1 / 1.25, 0, 0)} className="border-2 border-primary bg-black px-3 py-1 text-xs uppercase text-primary cursor-pointer hover:bg-primary hover:text-black focus:outline-none focus-visible:outline-2 focus-visible:outline-white">−</button>
					<span className="px-1 py-1 text-xs uppercase text-primary">{Math.round(zoom * 100)}%</span>
					<button type="button" onClick={() => zoomAt(1.25, 0, 0)} className="border-2 border-primary bg-black px-3 py-1 text-xs uppercase text-primary cursor-pointer hover:bg-primary hover:text-black focus:outline-none focus-visible:outline-2 focus-visible:outline-white">+</button>
					<button type="button" onClick={fit} className="border-2 border-primary bg-black px-3 py-1 text-xs uppercase text-primary cursor-pointer hover:bg-primary hover:text-black focus:outline-none focus-visible:outline-2 focus-visible:outline-white">Fit</button>
					<button type="button" onClick={handleCopy} disabled={!ascii} className="border-2 border-primary bg-black px-3 py-1 text-xs uppercase text-primary cursor-pointer enabled:hover:bg-primary enabled:hover:text-black disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:outline-2 focus-visible:outline-white">Copy ASCII</button>
					<div className="relative" ref={menuRef}>
						<button type="button" onClick={() => setMenuOpen((o) => !o)} disabled={!ascii} aria-expanded={menuOpen} className="border-2 border-primary bg-black px-3 py-1 text-xs uppercase text-primary cursor-pointer enabled:hover:bg-primary enabled:hover:text-black disabled:opacity-40 disabled:cursor-not-allowed focus:outline-none focus-visible:outline-2 focus-visible:outline-white">Export ▾</button>
						{menuOpen && ascii && (
							<div className="absolute right-0 z-30 mt-1 w-32 border-2 border-primary bg-black">
								{formats.map((f) => (
									<button key={f.label} type="button" onClick={() => { setMenuOpen(false); f.action(); }} className="block w-full px-3 py-2 text-left text-xs uppercase text-primary cursor-pointer hover:bg-primary hover:text-black focus:outline-none focus-visible:outline-2 focus-visible:outline-white">
										{f.label}
									</button>
								))}
							</div>
						)}
					</div>
					{onResetOptions && (
						<button type="button" onClick={onResetOptions} className="border-2 border-primary bg-black px-3 py-1 text-xs uppercase text-primary cursor-pointer hover:bg-primary hover:text-black focus:outline-none focus-visible:outline-2 focus-visible:outline-white">Reset</button>
					)}
				</div>
			</div>
			<div
				ref={containerRef}
				className={`relative min-h-0 flex-1 overflow-hidden ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
				style={{ backgroundColor: options.bgColor }}
				onWheel={onWheel}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={onPointerUp}
				onPointerCancel={onPointerUp}
			>
				{ascii ? (
					<canvas ref={canvasRef} className="block" />
				) : (
					<p className="absolute inset-0 flex items-center justify-center font-mono text-sm text-muted-foreground">No image yet. Upload one to begin.</p>
				)}
			</div>
		</div>
	);
}
