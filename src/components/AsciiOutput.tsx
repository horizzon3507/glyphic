import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { toast } from 'sonner';
import { type AsciiOptions } from '@/lib/ascii';

interface AsciiOutputProps {
	ascii: { text: string; html?: string };
	options: AsciiOptions;
	onResetOptions: () => void;
	imageUrl: string | null;
}

const FONT_SIZE = 12;
const LINE_HEIGHT = FONT_SIZE * 0.6;
const PADDING = 20;
const MIN_SCALE = 0.1;
const MAX_SCALE = 20;

interface ColorCell {
	ch: string;
	r: number;
	g: number;
	b: number;
	colored: boolean;
}

interface GridLayout {
	cols: number;
	rows: number;
	colAdvance: number;
	uniform: boolean;
	charWidths: Map<string, number>;
	contentW: number;
	contentH: number;
	totalW: number;
	totalH: number;
}

function clampScale(s: number): number {
	if (Number.isNaN(s)) return 1;
	return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

function decodeHtmlChar(s: string): string {
	if (s === '&lt;') return '<';
	if (s === '&gt;') return '>';
	if (s === '&amp;') return '&';
	if (s === '&quot;') return '"';
	if (s.startsWith('&#')) {
		const n = Number(s.slice(2, -1));
		if (Number.isFinite(n)) return String.fromCharCode(n);
		return s;
	}
	return s;
}

function parseColorHtml(html: string): ColorCell[][] {
	const lines: ColorCell[][] = [[]];
	const re =
		/<span style="color:\s*rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)">(&lt;|&gt;|&amp;|&quot;|&#\d+;|[\s\S])<\/span>|<br\s*\/?>/g;
	let lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(html)) !== null) {
		if (m.index > lastIndex) {
			const gap = html.slice(lastIndex, m.index);
			for (const ch of gap) {
				if (ch === ' ') {
					lines[lines.length - 1].push({ ch: ' ', r: 0, g: 0, b: 0, colored: false });
				}
			}
		}
		if (m[0].startsWith('<span')) {
			const r = Number(m[1]);
			const g = Number(m[2]);
			const b = Number(m[3]);
			const ch = decodeHtmlChar(m[4] ?? ' ');
			lines[lines.length - 1].push({ ch, r, g, b, colored: true });
		} else {
			lines.push([]);
		}
		lastIndex = m.index + m[0].length;
	}
	if (lastIndex < html.length) {
		const gap = html.slice(lastIndex);
		for (const ch of gap) {
			if (ch === ' ') {
				lines[lines.length - 1].push({ ch: ' ', r: 0, g: 0, b: 0, colored: false });
			}
		}
	}
	if (lines.length > 1 && lines[lines.length - 1].length === 0) {
		lines.pop();
	}
	return lines;
}

export default function AsciiOutput({ ascii, options, onResetOptions, imageUrl }: AsciiOutputProps) {
	const [exportOpen, setExportOpen] = useState(false);
	const [showSource, setShowSource] = useState(false);
	const exportRef = useRef<HTMLDivElement>(null);
	const sourceImageRef = useRef<HTMLImageElement | null>(null);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const viewportRef = useRef<HTMLDivElement>(null);

	// View transform: scale (1x = terminal grid CSS px), tx/ty in device px
	// so the frame render is ctx.setTransform(dpr*scale,0,0,dpr*scale,panX,panY).
	const viewRef = useRef<{ scale: number; tx: number; ty: number }>({ scale: 1, tx: 0, ty: 0 });
	const viewportSizeRef = useRef<{ w: number; h: number; dpr: number }>({ w: 0, h: 0, dpr: 1 });
	const dirtyRef = useRef<boolean>(false);
	const rafRef = useRef<number>(0);
	const dragRef = useRef<{ dragging: boolean; lastX: number; lastY: number }>({
		dragging: false,
		lastX: 0,
		lastY: 0
	});
	const initialFitPendingRef = useRef<boolean>(true);

	const [zoom, setZoom] = useState<number>(1);
	const [isPanning, setIsPanning] = useState<boolean>(false);

	useEffect(() => {
		if (!exportOpen) return;
		function handleClickOutside(e: MouseEvent) {
			if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
				setExportOpen(false);
			}
		}
		function handleKey(e: KeyboardEvent) {
			if (e.key === 'Escape') setExportOpen(false);
		}
		window.addEventListener('mousedown', handleClickOutside);
		window.addEventListener('keydown', handleKey);
		return () => {
			window.removeEventListener('mousedown', handleClickOutside);
			window.removeEventListener('keydown', handleKey);
		};
	}, [exportOpen]);

	// Scope: 'content' exports the whole artwork ignoring zoom/pan (default);
	// 'view' exports exactly what is currently on screen.
	const [exportScope, setExportScope] = useState<'content' | 'view'>('content');

	function copyToClipboard() {
		navigator.clipboard.writeText(ascii.text);
		toast.success('Copied to clipboard');
	}

	function downloadBlob(data: Blob | string, filename: string, type: string) {
		const url = URL.createObjectURL(typeof data === 'string' ? new Blob([data], { type }) : data);
		const link = document.createElement('a');
		link.download = filename;
		link.href = url;
		link.click();
		URL.revokeObjectURL(url);
	}

	function measureLayout() {
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		const lines = ascii.text.split('\n');
		ctx.font = `${FONT_SIZE}px ${options.font}`;
		const maxWidth = lines.reduce((max, line) => Math.max(max, ctx.measureText(line).width), 0);
		return { lines, width: Math.ceil(maxWidth) + PADDING * 2, height: Math.ceil(lines.length * LINE_HEIGHT) + PADDING * 2 };
	}

	// Build the export art as a per-cell grid, respecting color mode when active.
	function exportArt() {
		const measure = document.createElement('canvas').getContext('2d');
		if (!measure) return null;
		measure.font = `${FONT_SIZE}px ${options.font}`;
		const useColor = options.colorMode && !!ascii.html && !!colorGrid;
		const lines = ascii.text.split('\n');
		const maxWidth = lines.reduce((m, l) => Math.max(m, measure.measureText(l).width), 0);
		const charW = measure.measureText('M').width || FONT_SIZE * 0.6;
		const rows: ColorCell[][] = useColor
			? colorGrid!
			: lines.map((line) =>
					Array.from(line).map((ch) => ({
						ch,
						r: 0,
						g: 0,
						b: 0,
						colored: false
					}))
				);
		const width = Math.ceil(Math.max(maxWidth, (rows[0]?.length ?? 0) * charW)) + PADDING * 2;
		const height = Math.ceil(rows.length * LINE_HEIGHT) + PADDING * 2;
		return { rows, width, height, charW };
	}

	function exportBitmapCanvas(format: 'png' | 'jpg'): HTMLCanvasElement | null {
		if (exportScope === 'view') {
			return captureViewCanvas(format);
		}
		// Content export: exactly the FULL artwork bounding box (layout.totalW/H,
		// which includes the viewport PADDING), supersampled for crisp text.
		// No bgColor fill — PNG stays transparent; JPG is filled below.
		// NOTE: this path must NEVER depend on viewportSizeRef / viewRef /
		// visible bounds — no pan, zoom, or culling here. Source of truth is
		// latestRef so the drawn grid always covers ALL rows/cols even if the
		// click handler closed over a stale render.
		const latest = latestRef.current;
		const layout = latest.gridLayout;
		const lines = latest.textLines;
		const colors = latest.colorGrid;
		const opts = latest.options;
		if (layout.rows === 0 || layout.cols === 0) return null;
		if (!(layout.totalW > 0) || !(layout.totalH > 0)) return null;
		// Browser canvas limits (Chrome): 16384px max per dimension and
		// 16384^2 (~268MP) max total area. Pick the crispest integer
		// supersample that fits; the loop can only pick a fitting candidate
		// and falls through to the fractional fit below at worst.
		const MAX_DIM = 16384;
		const MAX_PIXELS = 16384 * 16384;
		let scale = 0;
		for (const candidate of [4, 3, 2, 1]) {
			const w = Math.ceil(layout.totalW * candidate);
			const h = Math.ceil(layout.totalH * candidate);
			if (w <= 0 || h <= 0) continue;
			if (w <= MAX_DIM && h <= MAX_DIM && w * h <= MAX_PIXELS) {
				scale = candidate;
				break;
			}
		}
		if (scale === 0) {
			// Even 1x overflows: scale the WHOLE artwork down uniformly so the
			// full art still fits (never crop). Fractional render scale keeps
			// every row/col, just smaller.
			const w1 = Math.ceil(layout.totalW);
			const h1 = Math.ceil(layout.totalH);
			const fit = Math.min(MAX_DIM / w1, MAX_DIM / h1, Math.sqrt(MAX_PIXELS / (w1 * h1)));
			if (!Number.isFinite(fit) || fit <= 0) return null;
			scale = Math.min(1, fit);
			console.warn(
				`[export] artwork ${w1}x${h1}px exceeds canvas limits; exporting full art scaled by ${scale.toFixed(4)}`
			);
		}
		const ss = scale;
		const width = Math.max(1, Math.ceil(layout.totalW * ss));
		const height = Math.max(1, Math.ceil(layout.totalH * ss));
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');
		if (!ctx) return null;
		canvas.width = width;
		canvas.height = height;
		// The artwork's own background is part of the content — the canvas
		// IS the art bounding box, so filling it is not letterboxing.
		ctx.fillStyle = opts.bgColor;
		ctx.fillRect(0, 0, width, height);
		ctx.font = `${FONT_SIZE * ss}px '${opts.font}', monospace`;
		ctx.textBaseline = 'top';
		ctx.textAlign = 'left';
		const pad = PADDING * ss;
		const lh = LINE_HEIGHT * ss;
		const adv = layout.colAdvance * ss;
		const useColor = opts.colorMode && colors !== null && colors.length > 0;
		if (useColor && colors) {
			for (let r = 0; r < colors.length; r++) {
				const y = pad + r * lh;
				const row = colors[r];
				if (!row) continue;
				if (layout.uniform) {
					for (let c = 0; c < row.length; c++) {
						const cell = row[c];
						if (!cell || cell.ch === ' ') continue;
						ctx.fillStyle = cell.colored
							? `rgb(${cell.r},${cell.g},${cell.b})`
							: opts.textColor;
						ctx.fillText(cell.ch, pad + c * adv, y);
					}
				} else {
					let x = pad;
					for (let c = 0; c < row.length; c++) {
						const cell = row[c];
						if (!cell) continue;
						const wch = (layout.charWidths.get(cell.ch) ?? layout.colAdvance) * ss;
						if (cell.ch !== ' ') {
							ctx.fillStyle = cell.colored
								? `rgb(${cell.r},${cell.g},${cell.b})`
								: opts.textColor;
							ctx.fillText(cell.ch, x, y);
						}
						x += wch;
					}
				}
			}
		} else {
			ctx.fillStyle = opts.textColor;
			if (layout.uniform) {
				for (let r = 0; r < lines.length; r++) {
					const y = pad + r * lh;
					ctx.fillText(lines[r], pad, y);
				}
			} else {
				for (let r = 0; r < lines.length; r++) {
					const y = pad + r * lh;
					let x = pad;
					for (const ch of lines[r]) {
						const wch = (layout.charWidths.get(ch) ?? layout.colAdvance) * ss;
						if (ch !== ' ') ctx.fillText(ch, x, y);
						x += wch;
					}
				}
			}
		}
		return canvas;
	}

	function saveAsImage(format: 'png' | 'jpg') {
		const canvas = exportBitmapCanvas(format);
		if (!canvas) return;
		canvas.toBlob((blob) => {
			if (!blob) {
				toast.error(`Failed to export ${format.toUpperCase()}`);
				return;
			}
			downloadBlob(blob, `glyphic-export.${format}`, `image/${format === 'jpg' ? 'jpeg' : 'png'}`);
			toast.success(`Exported as ${format.toUpperCase()}`);
		}, `image/${format === 'jpg' ? 'jpeg' : 'png'}`, format === 'jpg' ? 0.92 : undefined);
	}

	function saveAsSvg() {
		// SVG export follows the same rules as the raster content export:
		// full artwork bounding box, per-char positioning for non-uniform
		// fonts, per-char colors in color mode, and NO background rect
		// (SVG supports transparency, so the file is content-only).
		const latest = latestRef.current;
		const layout = latest.gridLayout;
		const lines = latest.textLines;
		const colors = latest.colorGrid;
		const opts = latest.options;
		if (layout.rows === 0 || layout.cols === 0) return;
		if (layout.totalW <= 0 || layout.totalH <= 0) return;
		const useColor = opts.colorMode && colors !== null && colors.length > 0;
		const rows: ColorCell[][] = useColor && colors
			? colors
			: lines.map((line) =>
					Array.from(line).map((ch) => ({ ch, r: 0, g: 0, b: 0, colored: false }))
				);
		const width = Math.ceil(layout.totalW);
		const height = Math.ceil(layout.totalH);
		const body = rows
			.map((cells, r) => {
				const y = (PADDING + FONT_SIZE + r * LINE_HEIGHT).toFixed(2);
				if (layout.uniform) {
					const rowFill = useColor ? '' : ` fill="${opts.textColor}"`;
					const spans = cells
						.map((c) => {
							if (c.colored) return `<tspan fill="rgb(${c.r}, ${c.g}, ${c.b})">${escapeXml(c.ch)}</tspan>`;
							return escapeXml(c.ch);
						})
						.join('');
					return `<text x="${PADDING}" y="${y}" xml:space="preserve"${rowFill}>${spans}</text>`;
				}
				// Non-uniform advance: each glyph gets an explicit x so viewers
				// cannot re-flow or clip the line.
				let x = PADDING;
				const glyphs = cells
					.map((c) => {
						const wch = layout.charWidths.get(c.ch) ?? layout.colAdvance;
						const out =
							c.ch === ' '
								? ''
								: `<tspan x="${x.toFixed(2)}"${c.colored ? ` fill="rgb(${c.r}, ${c.g}, ${c.b})"` : ''}>${escapeXml(c.ch)}</tspan>`;
						x += wch;
						return out;
					})
					.join('');
				return `<text x="${PADDING + FONT_SIZE * 0.35}" y="${y}" xml:space="preserve">${glyphs}</text>`;
			})
			.join('\n');
		const svg =
			`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n` +
			`<rect width="100%" height="100%" fill="${opts.bgColor}"/>\n` +
			`<g font-family="'${opts.font}', ui-monospace, Menlo, Consolas, monospace" font-size="${FONT_SIZE}">\n${body}\n</g>\n</svg>`;
		downloadBlob(svg, 'glyphic-export.svg', 'image/svg+xml');
		toast.success('Exported as SVG');
	}

	function saveAsTxt() {
		downloadBlob(ascii.text, 'glyphic-export.txt', 'text/plain;charset=utf-8');
		toast.success('Exported as TXT');
	}

	// Local sanitizer for the raw span markup built by ascii.ts (do not rebuild
	// ascii.ts here): the standalone file must stay valid, so any tag that is
	// not part of the span/<br> markup is escaped as text, and any stray '&'
	// outside a known entity is escaped. <pre> then receives exactly span markup.
	function sanitizeColorHtml(raw: string): string {
		const noForeignTags = raw.replace(/<(?!\/?span(?=[\s>])|br\s*\/?>)[^>]*>/gi, (tag) =>
			tag.replace(/</g, '&lt;').replace(/>/g, '&gt;')
		);
		return noForeignTags.replace(/&(?!(lt|gt|amp|quot|#\d+);)/g, '&amp;');
	}

	function saveAsHtml() {
		const family = options.font;
		const useColor = options.colorMode && !!ascii.html;
		const body = useColor
			? sanitizeColorHtml(ascii.html ?? '')
			: escapeXml(ascii.text).replace(/\n/g, '<br>');
		const html =
			`<!doctype html>\n<html lang="en">\n<head><meta charset="utf-8"><title>Glyphic Export</title>\n<style>` +
			`body{margin:0;background:${options.bgColor};}` +
			`pre{margin:0;padding:16px;font:${FONT_SIZE}px/${LINE_HEIGHT}px '${family}', ui-monospace, Menlo, Consolas, monospace;color:${options.textColor};white-space:pre;}` +
			`</style></head>\n<body><pre>${body}</pre></body>\n</html>`;
		downloadBlob(html, 'glyphic-export.html', 'text/html;charset=utf-8');
		toast.success(useColor ? 'Exported as HTML (color)' : 'Exported as HTML');
	}

	function escapeXml(s: string) {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	const scopeHint = exportScope === 'view' ? 'current slice' : 'full content';
	const exports: Array<{ label: string; hint: string; run: () => void }> = [
		{ label: 'PNG', hint: scopeHint, run: () => saveAsImage('png') },
		{ label: 'JPG', hint: scopeHint, run: () => saveAsImage('jpg') },
		{ label: 'SVG', hint: 'full content', run: saveAsSvg },
		{ label: 'TXT', hint: 'full content', run: saveAsTxt },
		{ label: 'HTML', hint: options.colorMode ? 'full + color' : 'full content', run: saveAsHtml }
	];

	// ---- Cached text layout (recomputed only when ascii / font change) ----

	const textLines = useMemo<string[]>(() => {
		const raw = ascii.text.split('\n');
		if (raw.length > 0 && raw[raw.length - 1] === '') raw.pop();
		return raw;
	}, [ascii.text]);

	const colorGrid = useMemo<ColorCell[][] | null>(() => {
		if (!ascii.html) return null;
		try {
			return parseColorHtml(ascii.html);
		} catch {
			return null;
		}
	}, [ascii.html]);

	const gridLayout = useMemo<GridLayout>(() => {
		let cols = 0;
		for (const line of textLines) {
			cols = Math.max(cols, Array.from(line).length);
		}
		const rows = textLines.length;
		const measurer = document.createElement('canvas').getContext('2d');
		const fontSpec = `${FONT_SIZE}px '${options.font}', monospace`;
		let colAdvance = FONT_SIZE * 0.6;
		if (measurer) {
			measurer.font = fontSpec;
			const w = measurer.measureText('M').width;
			if (Number.isFinite(w) && w > 0) colAdvance = w;
		}
		// Guard: verify the font is truly monospace across the chars in use.
		const distinct = new Set<string>();
		for (const line of textLines) {
			for (const ch of line) {
				distinct.add(ch);
				if (distinct.size > 256) break;
			}
			if (distinct.size > 256) break;
		}
		if (colorGrid) {
			for (const row of colorGrid) {
				for (const cell of row) {
					distinct.add(cell.ch);
					if (distinct.size > 256) break;
				}
				if (distinct.size > 256) break;
			}
		}
		const charWidths = new Map<string, number>();
		let uniform = true;
		if (measurer) {
			measurer.font = fontSpec;
			for (const ch of distinct) {
				const w = ch === ' ' ? colAdvance : measurer.measureText(ch).width;
				const width = Number.isFinite(w) && w > 0 ? w : colAdvance;
				charWidths.set(ch, width);
				if (Math.abs(width - colAdvance) > 0.01) {
					uniform = false;
				}
			}
		} else {
			for (const ch of distinct) charWidths.set(ch, colAdvance);
		}
		charWidths.set(' ', colAdvance);

		let contentW: number;
		if (uniform) {
			contentW = cols * colAdvance;
		} else {
			let maxRow = 0;
			for (const line of textLines) {
				let acc = 0;
				for (const ch of line) acc += charWidths.get(ch) ?? colAdvance;
				maxRow = Math.max(maxRow, acc);
			}
			if (colorGrid) {
				for (const row of colorGrid) {
					let acc = 0;
					for (const cell of row) acc += charWidths.get(cell.ch) ?? colAdvance;
					maxRow = Math.max(maxRow, acc);
				}
			}
			contentW = maxRow;
		}
		const contentH = rows * LINE_HEIGHT;
		return {
			cols,
			rows,
			colAdvance,
			uniform,
			charWidths,
			contentW,
			contentH,
			totalW: contentW + PADDING * 2,
			totalH: contentH + PADDING * 2
		};
	}, [textLines, colorGrid, options.font]);

	const latestRef = useRef({
		textLines,
		colorGrid,
		gridLayout,
		options,
		showSource
	});
	latestRef.current = { textLines, colorGrid, gridLayout, options, showSource };

	// Core art renderer shared by the live viewport and view exports.
	// Culling bounds are derived from the given canvas size + current view.
	function drawArt(ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number) {
		const latest = latestRef.current;
		const layout = latest.gridLayout;
		const lines = latest.textLines;
		const colors = latest.colorGrid;
		const opts = latest.options;
		const size = viewportSizeRef.current;
		const dpr = size.dpr || window.devicePixelRatio || 1;
		const { scale, tx: panX, ty: panY } = viewRef.current;

		ctx.setTransform(1, 0, 0, 1, 0, 0);
		ctx.fillStyle = opts.bgColor;
		ctx.fillRect(0, 0, canvasW, canvasH);
		if (layout.rows === 0 || layout.cols === 0) return;

		ctx.setTransform(dpr * scale, 0, 0, dpr * scale, panX, panY);
		const sourceImage = sourceImageRef.current;
		if (
			latest.showSource &&
			sourceImage &&
			sourceImage.complete &&
			sourceImage.naturalWidth > 0
		) {
			ctx.save();
			ctx.globalAlpha = 0.32;
			ctx.drawImage(sourceImage, PADDING, PADDING, layout.contentW, layout.contentH);
			ctx.restore();
		}
		ctx.font = `${FONT_SIZE}px '${opts.font}', monospace`;
		ctx.textBaseline = 'top';
		ctx.textAlign = 'left';

		// Visible world bounds (content px) for culling while zoomed/panned.
		const worldX0 = -panX / (dpr * scale);
		const worldX1 = (canvasW - panX) / (dpr * scale);
		const worldY0 = -panY / (dpr * scale);
		const worldY1 = (canvasH - panY) / (dpr * scale);

		const useColor = opts.colorMode && colors !== null && colors.length > 0;
		if (useColor && colors) {
			for (let r = 0; r < colors.length; r++) {
				const y = PADDING + r * LINE_HEIGHT;
				if (y + LINE_HEIGHT < worldY0 || y > worldY1) continue;
				const row = colors[r];
				if (layout.uniform) {
					const adv = layout.colAdvance;
					const c0 = Math.max(0, Math.floor((worldX0 - PADDING) / adv));
					const c1 = Math.min(row.length - 1, Math.ceil((worldX1 - PADDING) / adv));
					for (let c = c0; c <= c1; c++) {
						const cell = row[c];
						if (!cell) continue;
						if (cell.ch === ' ') continue;
						ctx.fillStyle = cell.colored
							? `rgb(${cell.r},${cell.g},${cell.b})`
							: opts.textColor;
						ctx.fillText(cell.ch, PADDING + c * adv, y);
					}
				} else {
					let x = PADDING;
					for (let c = 0; c < row.length; c++) {
						const cell = row[c];
						const wch = layout.charWidths.get(cell.ch) ?? layout.colAdvance;
						if (cell.ch !== ' ' && x + wch >= worldX0 && x <= worldX1) {
							ctx.fillStyle = cell.colored
								? `rgb(${cell.r},${cell.g},${cell.b})`
								: opts.textColor;
							ctx.fillText(cell.ch, x, y);
						}
						x += wch;
					}
				}
			}
		} else {
			ctx.fillStyle = opts.textColor;
			if (layout.uniform) {
				for (let r = 0; r < lines.length; r++) {
					const y = PADDING + r * LINE_HEIGHT;
					if (y + LINE_HEIGHT < worldY0 || y > worldY1) continue;
					ctx.fillText(lines[r], PADDING, y);
				}
			} else {
				for (let r = 0; r < lines.length; r++) {
					const y = PADDING + r * LINE_HEIGHT;
					if (y + LINE_HEIGHT < worldY0 || y > worldY1) continue;
					let x = PADDING;
					for (const ch of lines[r]) {
						const wch = layout.charWidths.get(ch) ?? layout.colAdvance;
						if (ch !== ' ' && x + wch >= worldX0 && x <= worldX1) {
							ctx.fillText(ch, x, y);
						}
						x += wch;
					}
				}
			}
		}
	}

	const doDraw = useCallback(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		drawArt(ctx, canvas.width, canvas.height);
	}, []);

	// Capture the current visible slice of the artwork only (no viewport
	// background). Renders glyphs with the live view transform into a
	// viewport-sized offscreen canvas without any fill, then crops to the
	// device-space intersection of the viewport rect and the art rect.
	function captureViewCanvas(format: 'png' | 'jpg'): HTMLCanvasElement | null {
		const latest = latestRef.current;
		const layout = latest.gridLayout;
		const lines = latest.textLines;
		const colors = latest.colorGrid;
		const opts = latest.options;
		const size = viewportSizeRef.current;
		if (size.w === 0 || size.h === 0) return null;
		if (layout.rows === 0 || layout.cols === 0) return null;
		if (layout.totalW <= 0 || layout.totalH <= 0) return null;
		const dpr = size.dpr || window.devicePixelRatio || 1;
		const { scale, tx: panX, ty: panY } = viewRef.current;
		const viewW = Math.round(size.w * dpr);
		const viewH = Math.round(size.h * dpr);
		if (viewW <= 0 || viewH <= 0) return null;

		const full = document.createElement('canvas');
		full.width = viewW;
		full.height = viewH;
		const fctx = full.getContext('2d');
		if (!fctx) return null;
		// The artwork's own background is part of the content: paint it
		// everywhere (the crop later intersects the art rect, so no
		// letterbox leaks into the export).
		fctx.fillStyle = opts.bgColor;
		fctx.fillRect(0, 0, viewW, viewH);
		fctx.setTransform(dpr * scale, 0, 0, dpr * scale, panX, panY);
		fctx.font = `${FONT_SIZE}px '${opts.font}', monospace`;
		fctx.textBaseline = 'top';
		fctx.textAlign = 'left';

		// Visible world bounds (content px) for culling, same as drawArt.
		const worldX0 = -panX / (dpr * scale);
		const worldX1 = (viewW - panX) / (dpr * scale);
		const worldY0 = -panY / (dpr * scale);
		const worldY1 = (viewH - panY) / (dpr * scale);

		const useColor = opts.colorMode && colors !== null && colors.length > 0;
		if (useColor && colors) {
			for (let r = 0; r < colors.length; r++) {
				const y = PADDING + r * LINE_HEIGHT;
				if (y + LINE_HEIGHT < worldY0 || y > worldY1) continue;
				const row = colors[r];
				if (!row) continue;
				if (layout.uniform) {
					const adv = layout.colAdvance;
					const c0 = Math.max(0, Math.floor((worldX0 - PADDING) / adv));
					const c1 = Math.min(row.length - 1, Math.ceil((worldX1 - PADDING) / adv));
					for (let c = c0; c <= c1; c++) {
						const cell = row[c];
						if (!cell) continue;
						if (cell.ch === ' ') continue;
						fctx.fillStyle = cell.colored
							? `rgb(${cell.r},${cell.g},${cell.b})`
							: opts.textColor;
						fctx.fillText(cell.ch, PADDING + c * adv, y);
					}
				} else {
					let x = PADDING;
					for (let c = 0; c < row.length; c++) {
						const cell = row[c];
						if (!cell) continue;
						const wch = layout.charWidths.get(cell.ch) ?? layout.colAdvance;
						if (cell.ch !== ' ' && x + wch >= worldX0 && x <= worldX1) {
							fctx.fillStyle = cell.colored
								? `rgb(${cell.r},${cell.g},${cell.b})`
								: opts.textColor;
							fctx.fillText(cell.ch, x, y);
						}
						x += wch;
					}
				}
			}
		} else {
			fctx.fillStyle = opts.textColor;
			if (layout.uniform) {
				for (let r = 0; r < lines.length; r++) {
					const y = PADDING + r * LINE_HEIGHT;
					if (y + LINE_HEIGHT < worldY0 || y > worldY1) continue;
					fctx.fillText(lines[r], PADDING, y);
				}
			} else {
				for (let r = 0; r < lines.length; r++) {
					const y = PADDING + r * LINE_HEIGHT;
					if (y + LINE_HEIGHT < worldY0 || y > worldY1) continue;
					let x = PADDING;
					for (const ch of lines[r]) {
						const wch = layout.charWidths.get(ch) ?? layout.colAdvance;
						if (ch !== ' ' && x + wch >= worldX0 && x <= worldX1) {
							fctx.fillText(ch, x, y);
						}
						x += wch;
					}
				}
			}
		}

		// Art bounding box in device px through the live transform.
		const ax0 = panX;
		const ay0 = panY;
		const ax1 = panX + layout.totalW * dpr * scale;
		const ay1 = panY + layout.totalH * dpr * scale;
		const ix0 = Math.max(0, Math.floor(Math.min(ax0, ax1)));
		const iy0 = Math.max(0, Math.floor(Math.min(ay0, ay1)));
		const ix1 = Math.min(viewW, Math.ceil(Math.max(ax0, ax1)));
		const iy1 = Math.min(viewH, Math.ceil(Math.max(ay0, ay1)));
		const cw = ix1 - ix0;
		const ch = iy1 - iy0;
		if (cw <= 0 || ch <= 0) return null;

		const out = document.createElement('canvas');
		out.width = cw;
		out.height = ch;
		const octx = out.getContext('2d');
		if (!octx) return null;
		octx.drawImage(full, ix0, iy0, cw, ch, 0, 0, cw, ch);
		return out;
	}

	const scheduleRedraw = useCallback(() => {
		dirtyRef.current = true;
		if (rafRef.current !== 0) return;
		rafRef.current = requestAnimationFrame(() => {
			rafRef.current = 0;
			if (!dirtyRef.current) return;
			dirtyRef.current = false;
			doDraw();
		});
	}, [doDraw]);

	useEffect(() => {
		sourceImageRef.current = null;
		if (!imageUrl) {
			scheduleRedraw();
			return;
		}
		const img = new Image();
		let cancelled = false;
		img.onload = () => {
			if (cancelled) return;
			sourceImageRef.current = img;
			scheduleRedraw();
		};
		img.src = imageUrl;
		return () => {
			cancelled = true;
		};
	}, [imageUrl, scheduleRedraw]);

	const centerAt = useCallback(
		(scale: number) => {
			const vp = viewportRef.current;
			if (!vp) return;
			const w = vp.clientWidth;
			const h = vp.clientHeight;
			if (w === 0 || h === 0) return;
			const dpr = window.devicePixelRatio || 1;
			const { totalW, totalH } = latestRef.current.gridLayout;
			if (totalW === 0 || totalH === 0) return;
			const s = clampScale(scale);
			viewportSizeRef.current = { w, h, dpr };
			viewRef.current = {
				scale: s,
				tx: ((w - totalW * s) / 2) * dpr,
				ty: ((h - totalH * s) / 2) * dpr
			};
			setZoom(s);
			scheduleRedraw();
		},
		[scheduleRedraw]
	);

	const fitToView = useCallback(() => {
		const vp = viewportRef.current;
		if (!vp) {
			initialFitPendingRef.current = true;
			return;
		}
		const w = vp.clientWidth;
		const h = vp.clientHeight;
		if (w === 0 || h === 0) {
			initialFitPendingRef.current = true;
			return;
		}
		const { totalW, totalH } = latestRef.current.gridLayout;
		if (totalW === 0 || totalH === 0) return;
		const s = clampScale(Math.min(w / totalW, h / totalH) * 0.96);
		const dpr = window.devicePixelRatio || 1;
		viewportSizeRef.current = { w, h, dpr };
		viewRef.current = {
			scale: s,
			tx: ((w - totalW * s) / 2) * dpr,
			ty: ((h - totalH * s) / 2) * dpr
		};
		initialFitPendingRef.current = false;
		setZoom(s);
		scheduleRedraw();
	}, [scheduleRedraw]);

	const zoomAt = useCallback(
		(newScale: number, centerCss: { x: number; y: number }) => {
			const size = viewportSizeRef.current;
			const dprNow = window.devicePixelRatio || 1;
			const old = viewRef.current;
			// Keep stored device-px pan consistent if DPR changed since last frame.
			let txOld = old.tx;
			let tyOld = old.ty;
			if (size.dpr !== dprNow && size.dpr > 0) {
				const ratio = dprNow / size.dpr;
				txOld *= ratio;
				tyOld *= ratio;
				size.dpr = dprNow;
			}
			const clamped = clampScale(newScale);
			if (clamped === old.scale) return;
			const k = clamped / old.scale;
			const cxD = centerCss.x * dprNow;
			const cyD = centerCss.y * dprNow;
			viewRef.current = {
				scale: clamped,
				tx: cxD - (cxD - txOld) * k,
				ty: cyD - (cyD - tyOld) * k
			};
			setZoom(clamped);
			scheduleRedraw();
		},
		[scheduleRedraw]
	);

	const zoomByCenter = useCallback(
		(factor: number) => {
			const size = viewportSizeRef.current;
			const vp = viewportRef.current;
			const cx = vp ? vp.clientWidth / 2 : size.w / 2;
			const cy = vp ? vp.clientHeight / 2 : size.h / 2;
			zoomAt(viewRef.current.scale * factor, { x: cx, y: cy });
		},
		[zoomAt]
	);

	// Resize observer: size the backing store at devicePixelRatio for crispness.
	useEffect(() => {
		const vp = viewportRef.current;
		const canvas = canvasRef.current;
		if (!vp || !canvas) return;
		function syncSize() {
			const v = viewportRef.current;
			const c = canvasRef.current;
			if (!v || !c) return;
			const w = v.clientWidth;
			const h = v.clientHeight;
			if (w === 0 || h === 0) return;
			const dpr = window.devicePixelRatio || 1;
			viewportSizeRef.current = { w, h, dpr };
			const bw = Math.round(w * dpr);
			const bh = Math.round(h * dpr);
			if (c.width !== bw || c.height !== bh) {
				c.width = bw;
				c.height = bh;
			}
			if (initialFitPendingRef.current) {
				fitToView();
			} else {
				scheduleRedraw();
			}
		}
		syncSize();
		const ro = new ResizeObserver(syncSize);
		ro.observe(vp);
		window.addEventListener('resize', syncSize);
		return () => {
			ro.disconnect();
			window.removeEventListener('resize', syncSize);
			if (rafRef.current !== 0) {
				cancelAnimationFrame(rafRef.current);
				rafRef.current = 0;
			}
			dirtyRef.current = false;
		};
	}, [fitToView, scheduleRedraw]);

	// Wheel = zoom centered on cursor.
	useEffect(() => {
		const vp = viewportRef.current;
		if (!vp) return;
		function onWheel(e: WheelEvent) {
			const target = viewportRef.current;
			if (!target) return;
			e.preventDefault();
			const rect = target.getBoundingClientRect();
			const cx = e.clientX - rect.left;
			const cy = e.clientY - rect.top;
			const factor = Math.exp(-e.deltaY * 0.0015);
			zoomAt(viewRef.current.scale * factor, { x: cx, y: cy });
		}
		vp.addEventListener('wheel', onWheel, { passive: false });
		return () => {
			vp.removeEventListener('wheel', onWheel);
		};
	}, [zoomAt]);

	// Auto-fit when a new art layout arrives (rows/cols change).
	useEffect(() => {
		if (viewportSizeRef.current.w === 0) {
			initialFitPendingRef.current = true;
			return;
		}
		fitToView();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [gridLayout.totalW, gridLayout.totalH]);

	// Redraw when content or paint options change.
	useEffect(() => {
		scheduleRedraw();
	}, [
		textLines,
		colorGrid,
		gridLayout,
		options.textColor,
		options.bgColor,
		options.font,
		options.colorMode,
		showSource,
		scheduleRedraw
	]);

	function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
		// Let clicks on the floating controls behave as buttons, not pans.
		if ((e.target as HTMLElement).closest('[data-zoom-controls]')) return;
		dragRef.current = { dragging: true, lastX: e.clientX, lastY: e.clientY };
		setIsPanning(true);
		try {
			e.currentTarget.setPointerCapture(e.pointerId);
		} catch {
			// Pointer capture is best-effort; pan still works via move/up events.
		}
	}

	function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
		const drag = dragRef.current;
		if (!drag.dragging) return;
		const dpr = window.devicePixelRatio || 1;
		const dx = (e.clientX - drag.lastX) * dpr;
		const dy = (e.clientY - drag.lastY) * dpr;
		drag.lastX = e.clientX;
		drag.lastY = e.clientY;
		viewRef.current = {
			scale: viewRef.current.scale,
			tx: viewRef.current.tx + dx,
			ty: viewRef.current.ty + dy
		};
		scheduleRedraw();
	}

	function endPan(e: ReactPointerEvent<HTMLDivElement>) {
		if (!dragRef.current.dragging) return;
		dragRef.current.dragging = false;
		setIsPanning(false);
		try {
			if (e.currentTarget.hasPointerCapture(e.pointerId)) {
				e.currentTarget.releasePointerCapture(e.pointerId);
			}
		} catch {
			// Ignore release errors.
		}
	}

	return (
		<div
			className="flex-1 flex flex-col h-full overflow-hidden bg-background relative"
			style={{ backgroundColor: options.bgColor }}
		>
			<div className="absolute top-14 right-4 md:top-4 md:right-16 flex flex-wrap justify-end gap-2 z-10 max-w-[calc(100vw-8rem)] md:max-w-[calc(100vw-2rem)]">
				<button
					type="button"
					aria-pressed={showSource}
					title="Show the original image under the ASCII"
					disabled={imageUrl === null}
					onClick={() => setShowSource((v) => !v)}
					className="border border-foreground/20 bg-background/80 px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm rounded-md hover:bg-accent transition-colors disabled:opacity-40"
				>
					Source
				</button>
				<button
					onClick={onResetOptions}
					title="Reset all settings to defaults"
					className="border border-foreground/20 bg-background/80 px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm rounded-md hover:bg-accent transition-colors"
				>
					Reset
				</button>
				<button
					onClick={copyToClipboard}
					className="border border-foreground/20 bg-background/80 px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm rounded-md hover:bg-accent transition-colors"
				>
					Copy ASCII
				</button>
				<div ref={exportRef} className="relative">
					<button
						onClick={() => setExportOpen((o) => !o)}
						aria-expanded={exportOpen}
						className="flex items-center gap-1.5 border border-foreground/20 bg-background/80 px-2 py-1 text-xs sm:px-3 sm:py-1.5 sm:text-sm rounded-md hover:bg-accent transition-colors"
					>
						Export
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
							<path d="M6 9l6 6 6-6" strokeLinecap="square" />
						</svg>
					</button>
					{exportOpen && (
						<ul
							role="listbox"
							className="absolute right-0 mt-1 w-48 bg-background border border-foreground/20 rounded-md overflow-hidden"
						>
							{exports.map((item) => (
								<li key={item.label}>
									<button
										type="button"
										onClick={() => {
											setExportOpen(false);
											item.run();
										}}
										className="flex w-full items-center justify-between px-3 py-2 text-sm text-left hover:bg-accent transition-colors"
									>
										<span className="font-bold">{item.label}</span>
										<span className="text-xs opacity-60">{item.hint}</span>
									</button>
								</li>
							))}
							<li className="border-t border-foreground/20">
								<button
									type="button"
									onClick={() => setExportScope((sc) => (sc === 'view' ? 'content' : 'view'))}
									className="flex w-full items-center justify-between px-3 py-2 text-xs text-left hover:bg-accent transition-colors"
									aria-pressed={exportScope === 'view'}
								>
									<span className="uppercase font-bold">PNG/JPG: current view</span>
									<span
										className={`inline-block h-3 w-8 relative border border-foreground/40 ${exportScope === 'view' ? 'bg-primary/70' : ''}`}
										aria-hidden="true"
									>
										<span
											className={`absolute top-0 h-full w-1/2 bg-background ${exportScope === 'view' ? 'right-0' : 'left-0'}`}
										/>
									</span>
								</button>
							</li>
						</ul>
					)}
				</div>
			</div>

			<div
				ref={viewportRef}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={endPan}
				onPointerCancel={endPan}
				className={`flex-1 relative overflow-hidden select-none touch-none ${
					isPanning ? 'cursor-grabbing' : 'cursor-grab'
				}`}
				style={{ backgroundColor: options.bgColor }}
			>
				<canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" />
				<div
					data-zoom-controls
					onPointerDown={(e) => e.stopPropagation()}
					className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5"
				>
					<button
						type="button"
						onClick={() => zoomByCenter(1 / 1.25)}
						title="Zoom out"
						className="border border-foreground/20 bg-background/80 px-2.5 py-1.5 text-sm rounded-md hover:bg-accent transition-colors"
					>
						−
					</button>
					<button
						type="button"
						onClick={() => centerAt(1)}
						title="Reset zoom to 100%"
						className="border border-foreground/20 bg-background/80 px-2.5 py-1.5 text-sm rounded-md hover:bg-accent transition-colors min-w-[4rem] tabular-nums"
					>
						{Math.round(zoom * 100)}%
					</button>
					<button
						type="button"
						onClick={() => zoomByCenter(1.25)}
						title="Zoom in"
						className="border border-foreground/20 bg-background/80 px-2.5 py-1.5 text-sm rounded-md hover:bg-accent transition-colors"
					>
						+
					</button>
					<button
						type="button"
						onClick={fitToView}
						title="Fit art in view"
						className="border border-foreground/20 bg-background/80 px-2.5 py-1.5 text-sm rounded-md hover:bg-accent transition-colors"
					>
						Fit
					</button>
				</div>
			</div>
		</div>
	);
}
