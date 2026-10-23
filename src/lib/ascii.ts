export type Charset =
	| 'Standard'
	| 'Simple'
	| 'Blocks'
	| 'Binary'
	| 'Matrix'
	| 'Detailed'
	| 'Heavy'
	| 'Decorative'
	| 'Musical'
	| 'Greek'
	| 'Hearts'
	| 'Arcade';

export const charsets: Record<Charset, string> = {
	Standard: '@%#*+=-:. ',
	Simple: '@#=-. ',
	Blocks: '█▓▒░ ',
	Binary: '01 ',
	Matrix: '0123456789abcdef ',
	Detailed: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. ',
	Heavy: '██▓▓▒░  ',
	Decorative: '✦✧✚✢✣✤✥✱✲✳✴✵✶✷✸✹✺✻✼❈❉❊❋ ',
	Musical: '♪♫♬♩♭♮♯ ',
	Greek: 'ΩΨΞΛΦΘΣΔΨΩαβγδλμνξπσφψω ',
	Hearts: '❤♥ ',
	Arcade: '▚▞▛▜▙▟▖▗▘▝ '
};

export type DitherMode = 'none' | 'floyd-steinberg' | 'atkinson';

export interface AsciiOptions {
	width: number;
	contrast: number;
	font: string;
	charset: Charset;
	inverted: boolean;
	colorMode: boolean;
	textColor: string;
	bgColor: string;
	customCharset: string;
	dither: DitherMode;
	aspect: number;
}

function clamp(v: number, min: number, max: number) {
	return Math.min(max, Math.max(min, v));
}

/** HTML-escape a single character so span markup stays parseable. */
function escapeHtmlChar(ch: string): string {
	switch (ch) {
		case '&':
			return '&amp;';
		case '<':
			return '&lt;';
		case '>':
			return '&gt;';
		case '"':
			return '&quot;';
		default:
			return ch;
	}
}

const GLYPH_PX = 32;

// Successful ink order only. Key is font + NUL + raw ramp source.
const rampOrderCache = new Map<string, string[]>();

function dedupeCodePoints(source: string): string[] {
	const seen = new Set<string>();
	const out: string[] = [];
	for (const ch of Array.from(source)) {
		if (ch !== ' ' && ch.trim() === '') continue;
		if (seen.has(ch)) continue;
		seen.add(ch);
		out.push(ch);
	}
	return out;
}

function measureInks(glyphs: string[], font: string): number[] | null {
	try {
		const canvas = document.createElement('canvas');
		const pad = GLYPH_PX;
		canvas.width = GLYPH_PX * 3;
		canvas.height = GLYPH_PX * 3;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		if (!ctx) return null;
		const fontCss = `${GLYPH_PX}px "${font}", monospace`;
		const inks: number[] = [];
		for (const ch of glyphs) {
			ctx.font = fontCss;
			let needed = Math.ceil(ctx.measureText(ch).width) + pad * 2;
			if (!Number.isFinite(needed) || needed < GLYPH_PX * 3) needed = GLYPH_PX * 3;
			if (canvas.width < needed || canvas.height < GLYPH_PX * 3) {
				canvas.width = Math.max(canvas.width, needed);
				canvas.height = Math.max(canvas.height, GLYPH_PX * 3);
			}
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.font = fontCss;
			ctx.fillStyle = 'white';
			ctx.textBaseline = 'top';
			// Pad so side bearings and descenders are inside the bitmap.
			ctx.fillText(ch, pad, pad);
			const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
			let ink = 0;
			for (let p = 3; p < data.length; p += 4) ink += data[p];
			inks.push(ink);
		}
		return inks;
	} catch {
		return null;
	}
}

function orderRamp(glyphs: string[], font: string, raw: string): string[] {
	const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
	if (fonts && typeof fonts.check === 'function' && fonts.check(`${GLYPH_PX}px "${font}"`) === false) {
		return glyphs;
	}
	const key = `${font}\0${raw}`;
	const cached = rampOrderCache.get(key);
	if (cached) return cached;

	const inks = measureInks(glyphs, font);
	if (!inks || inks.every((ink) => ink === 0)) return glyphs;

	const ordered = glyphs
		.map((ch, index) => ({ ch, index, ink: inks[index] }))
		.sort((a, b) => (b.ink - a.ink) || (a.index - b.index))
		.map((entry) => entry.ch);
	rampOrderCache.set(key, ordered);
	return ordered;
}

function resolveRamp(options: AsciiOptions): string[] {
	const custom = options.customCharset;
	let raw = typeof custom === 'string' && custom.trim() !== ''
		? custom
		: charsets[options.charset] || charsets.Standard;
	let glyphs = dedupeCodePoints(raw);
	if (glyphs.length === 0) {
		raw = charsets.Standard;
		glyphs = dedupeCodePoints(raw);
	}
	if (!glyphs.includes(' ')) glyphs.push(' ');
	return orderRamp(glyphs, typeof options.font === 'string' ? options.font : '', raw);
}

function resolveAspect(aspect: number): number {
	if (typeof aspect !== 'number' || !Number.isFinite(aspect)) return 0.5;
	return clamp(aspect, 0.25, 1.5);
}

function resolveDither(dither: DitherMode): DitherMode {
	if (dither === 'floyd-steinberg' || dither === 'atkinson') return dither;
	return 'none';
}

function addError(
	lum: Float32Array,
	opaque: Uint8Array,
	width: number,
	height: number,
	x: number,
	y: number,
	delta: number
) {
	if (x < 0 || y < 0 || x >= width || y >= height) return;
	const i = y * width + x;
	if (opaque[i] === 0) return;
	lum[i] += delta;
}

// Quantize opaque cells in place. Index q is kept so diffused values are not re-floored.
function ditherLuminance(
	lum: Float32Array,
	opaque: Uint8Array,
	width: number,
	height: number,
	steps: number,
	mode: 'floyd-steinberg' | 'atkinson'
): Int32Array {
	const quant = new Int32Array(lum.length);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = y * width + x;
			if (opaque[i] === 0) continue;
			const old = lum[i];
			if (!Number.isFinite(old) || steps === 0) {
				quant[i] = 0;
				if (!Number.isFinite(old)) lum[i] = 0;
				continue;
			}
			let q = Math.round(clamp(old, 0, 255) / 255 * steps);
			if (q < 0) q = 0;
			else if (q > steps) q = steps;
			const quantized = q / steps * 255;
			const error = old - quantized;
			lum[i] = quantized;
			quant[i] = q;
			if (mode === 'floyd-steinberg') {
				addError(lum, opaque, width, height, x + 1, y, error * (7 / 16));
				addError(lum, opaque, width, height, x - 1, y + 1, error * (3 / 16));
				addError(lum, opaque, width, height, x, y + 1, error * (5 / 16));
				addError(lum, opaque, width, height, x + 1, y + 1, error * (1 / 16));
			} else {
				const share = error / 8;
				addError(lum, opaque, width, height, x + 1, y, share);
				addError(lum, opaque, width, height, x + 2, y, share);
				addError(lum, opaque, width, height, x - 1, y + 1, share);
				addError(lum, opaque, width, height, x, y + 1, share);
				addError(lum, opaque, width, height, x + 1, y + 1, share);
				addError(lum, opaque, width, height, x, y + 2, share);
			}
		}
	}
	return quant;
}

export async function imageToAscii(
	imageUrl: string,
	options: AsciiOptions
): Promise<{ text: string; html?: string }> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'Anonymous';
		img.onload = () => {
			void (async () => {
				try {
					if (document.fonts?.ready) await document.fonts.ready;
					const width = options.width;
					// Cell width / cell height. 0.5 is the historical multiplier.
					const aspect = resolveAspect(options.aspect);
					const height = Math.max(1, Math.floor((img.height / img.width) * width * aspect));

					// Area-averaged downsampling: render at an integer multiple of the
					// target and manually average blocks, alpha-weighted, instead of
					// trusting drawImage's filtering at tiny sizes.
					const srcCanvas = document.createElement('canvas');
					const k = Math.max(1, Math.min(
						Math.floor(img.width / width) || 1,
						Math.floor(img.height / Math.max(1, height)) || 1,
						Math.floor(2000 / Math.max(width, height)) || 1
					));
					srcCanvas.width = width * k;
					srcCanvas.height = height * k;
					const sctx = srcCanvas.getContext('2d');
					if (!sctx) {
						reject(new Error('Could not get canvas context'));
						return;
					}
					sctx.drawImage(img, 0, 0, srcCanvas.width, srcCanvas.height);
					const src = sctx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
					const sdata = src.data;

					const chars = resolveRamp(options);
					const charLen = chars.length;
					const steps = charLen - 1;
					const contrastFactor = (259 * (options.contrast + 255)) / (255 * (259 - options.contrast));
					const brightnessScale = steps / 255;
					const dither = resolveDither(options.dither);
					const count = width * height;
					const lum = new Float32Array(count);
					const opaque = new Uint8Array(count);
					const rgb = options.colorMode ? new Uint8ClampedArray(count * 3) : null;
					const n = k * k * 255;

					for (let by = 0; by < height; by++) {
						for (let bx = 0; bx < width; bx++) {
							let sumR = 0, sumG = 0, sumB = 0, sumA = 0;
							for (let y = by * k; y < (by + 1) * k; y++) {
								for (let x = bx * k; x < (bx + 1) * k; x++) {
									const o = (y * srcCanvas.width + x) * 4;
									const a = sdata[o + 3];
									sumA += a;
									sumR += sdata[o] * a;
									sumG += sdata[o + 1] * a;
									sumB += sdata[o + 2] * a;
								}
							}
							const i = by * width + bx;
							if (sumA < n * 0.05) continue;
							opaque[i] = 1;
							const r = sumR / sumA;
							const g = sumG / sumA;
							const b = sumB / sumA;

							// Perceptual luminance (Rec. 709).
							let brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
							brightness = contrastFactor * (brightness - 128) + 128;
							brightness = clamp(brightness, 0, 255);
							if (options.inverted) brightness = 255 - brightness;
							lum[i] = brightness;

							if (rgb) {
								let rOut = Math.round(r), gOut = Math.round(g), bOut = Math.round(b);
								if (options.inverted) {
									rOut = 255 - rOut;
									gOut = 255 - gOut;
									bOut = 255 - bOut;
								}
								const o = i * 3;
								rgb[o] = rOut;
								rgb[o + 1] = gOut;
								rgb[o + 2] = bOut;
							}
						}
					}

					const quant = dither === 'none'
						? null
						: ditherLuminance(lum, opaque, width, height, steps, dither);

					const textRows: string[] = [];
					const htmlRows: string[] = [];

					for (let by = 0; by < height; by++) {
						let textRow = '';
						let htmlRow = '';
						for (let bx = 0; bx < width; bx++) {
							const i = by * width + bx;
							if (opaque[i] === 0) {
								textRow += ' ';
								htmlRow += ' ';
								continue;
							}
							const idx = quant ? quant[i] : Math.floor(lum[i] * brightnessScale);
							const ch = chars[idx] ?? chars[0];
							textRow += ch;

							if (rgb) {
								const o = i * 3;
								htmlRow += `<span style="color: rgb(${rgb[o]},${rgb[o + 1]},${rgb[o + 2]})">${escapeHtmlChar(ch)}</span>`;
							}
						}
						textRows.push(textRow);
						htmlRows.push(htmlRow);
					}

					// Invariant: text rows and html rows always match 1:1.
					resolve({
						text: textRows.join('\n'),
						html: options.colorMode ? htmlRows.join('<br>') : undefined
					});
				} catch (error) {
					reject(error);
				}
			})();
		};
		img.onerror = (err) => reject(err);
		img.src = imageUrl;
	});
}
