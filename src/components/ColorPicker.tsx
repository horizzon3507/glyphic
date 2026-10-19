import { useEffect, useRef, useState } from 'react';

type Format = 'HEX' | 'HSL' | 'RGB';
const FORMATS: readonly Format[] = ['HEX', 'HSL', 'RGB'];

const PRESETS: readonly string[] = ['#000000', '#404040', '#808080', '#C0C0C0', '#FFFFFF'];

function clamp(v: number, min: number, max: number) {
	return Math.min(max, Math.max(min, v));
}

function rgbToHsv(r: number, g: number, b: number) {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const v = max * 100;
	if (max === min) return { h: 0, s: 0, v };
	const d = max - min;
	const s = (d / max) * 100;
	let h = 0;
	if (max === r) h = 60 * (((g - b) / d) % 6);
	else if (max === g) h = 60 * ((b - r) / d + 2);
	else h = 60 * ((r - g) / d + 4);
	return { h: ((h % 360) + 360) % 360, s: clamp(s, 0, 100), v };
}

function hsvToRgb(h: number, s: number, v: number) {
	s /= 100;
	v /= 100;
	const c = v * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = v - c;
	let r = 0,
		g = 0,
		b = 0;
	if (h < 60) [r, g, b] = [c, x, 0];
	else if (h < 120) [r, g, b] = [x, c, 0];
	else if (h < 180) [r, g, b] = [0, c, x];
	else if (h < 240) [r, g, b] = [0, x, c];
	else if (h < 300) [r, g, b] = [x, 0, c];
	else [r, g, b] = [c, 0, x];
	return {
		r: Math.round((r + m) * 255),
		g: Math.round((g + m) * 255),
		b: Math.round((b + m) * 255)
	};
}

function hsvToHex(h: number, s: number, v: number) {
	const { r, g, b } = hsvToRgb(h, s, v);
	const hex = (n: number) => n.toString(16).padStart(2, '0').toUpperCase();
	return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function rgbToHsl(r: number, g: number, b: number) {
	r /= 255;
	g /= 255;
	b /= 255;
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = ((max + min) / 2) * 100;
	if (max === min) return { h: 0, s: 0, l };
	const d = max - min;
	const s = (d / (1 - Math.abs(2 * (l / 100) - 1))) * 100 || 0;
	let h = 0;
	if (max === r) h = 60 * (((g - b) / d) % 6);
	else if (max === g) h = 60 * ((b - r) / d + 2);
	else h = 60 * ((r - g) / d + 4);
	return { h: ((h % 360) + 360) % 360, s: clamp(s, 0, 100), l };
}

function hslToRgb(h: number, s: number, l: number) {
	s /= 100;
	l /= 100;
	const c = (1 - Math.abs(2 * l - 1)) * s;
	const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
	const m = l - c / 2;
	let r = 0,
		g = 0,
		b = 0;
	if (h < 60) [r, g, b] = [c, x, 0];
	else if (h < 120) [r, g, b] = [x, c, 0];
	else if (h < 180) [r, g, b] = [0, c, x];
	else if (h < 240) [r, g, b] = [0, x, c];
	else if (h < 300) [r, g, b] = [x, 0, c];
	else [r, g, b] = [c, 0, x];
	return {
		r: Math.round((r + m) * 255),
		g: Math.round((g + m) * 255),
		b: Math.round((b + m) * 255)
	};
}

function parseHexHex(hex: string): { h: number; s: number; v: number } | null {
	const m = hex.replace('#', '').trim();
	const full = m.length === 3 ? m.split('').map((c) => c + c).join('') : m;
	if (full.length !== 6 || !/^[0-9a-fA-F]+$/.test(full)) return null;
	return rgbToHsv(
		parseInt(full.slice(0, 2), 16),
		parseInt(full.slice(2, 4), 16),
		parseInt(full.slice(4, 6), 16)
	);
}

/** Parse "h, s%, l%" or "r, g, b" numbers from a CSS color string, as HSV. */
function parseChannels(value: string): { h: number; s: number; v: number } | null {
	const w = value.match(/-?\d+(\.\d+)?%?/g) ?? [];
	if (w.length < 3) return null;
	const [a, b, c] = w.map((n) => parseFloat(n.replace('%', '')));
	if ([a, b, c].some((n) => Number.isNaN(n))) return null;
	if (/[hsl]/i.test(value)) {
		if (b < 0 || b > 100 || c < 0 || c > 100) return null;
		const { r, g, b: bb } = hslToRgb(((a % 360) + 360) % 360, clamp(b, 0, 100), clamp(c, 0, 100));
		return rgbToHsv(r, g, bb);
	}
	if (a < 0 || a > 255 || b < 0 || b > 255 || c < 0 || c > 255) return null;
	return rgbToHsv(a, b, c);
}

function parseAnyFormat(text: string): { h: number; s: number; v: number } | null {
	const t = text.trim();
	if (!t) return null;
	if (/^#?[0-9a-fA-F]+$/.test(t)) return parseHexHex(t);
	return parseChannels(t);
}

function formatValue(format: Format, hsv: { h: number; s: number; v: number }) {
	switch (format) {
		case 'HEX':
			return hsvToHex(hsv.h, hsv.s, hsv.v);
		case 'HSL': {
			const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
			const hsl = rgbToHsl(r, g, b);
			return `hsl(${Math.round(hsl.h)}, ${Math.round(hsl.s)}%, ${Math.round(hsl.l)}%)`;
		}
		case 'RGB': {
			const { r, g, b } = hsvToRgb(hsv.h, hsv.s, hsv.v);
			return `rgb(${r}, ${g}, ${b})`;
		}
	}
}

interface ColorPickerProps {
	label: string;
	value: string; // hex, shared with the rest of the app
	onChange: (hex: string) => void;
}

export default function ColorPicker({ label, value, onChange }: ColorPickerProps) {
	const [open, setOpen] = useState(false);
	const [format, setFormat] = useState<Format>('HEX');
	const [text, setText] = useState(() =>
		formatValue('HEX', parseHexHex(value) ?? { h: 0, s: 0, v: 0 })
	);
	const [textInvalid, setTextInvalid] = useState(false);
	const [editing, setEditing] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const areaRef = useRef<HTMLDivElement>(null);
	const hueRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// HSV state is the source of truth while dragging (HSV keeps pure
	// saturation at every corner, unlike HSL where the top edge is always
	// white). Re-derive from the prop only on external changes (Reset,
	// presets, typing) so dragging never snaps the cursor away.
	const [hsv, setHsv] = useState(() => parseHexHex(value) ?? { h: 0, s: 0, v: 0 });
	const { h, s, v } = hsv;

	useEffect(() => {
		if (hsvToHex(hsv.h, hsv.s, hsv.v).toLowerCase() === value.toLowerCase()) return;
		setHsv(parseHexHex(value) ?? { h: 0, s: 0, v: 0 });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [value]);

	// Keep the text field in sync with the color + format, but never fight
	// the user while they are typing (editing === true).
	useEffect(() => {
		if (editing) return;
		setText(formatValue(format, hsv));
		setTextInvalid(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [format, value, editing]);

	// Close on outside click / Escape.
	useEffect(() => {
		if (!open) return;
		function handleClickOutside(e: MouseEvent) {
			if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		function handleKey(e: KeyboardEvent) {
			if (e.key === 'Escape') setOpen(false);
		}
		window.addEventListener('mousedown', handleClickOutside);
		window.addEventListener('keydown', handleKey);
		return () => {
			window.removeEventListener('mousedown', handleClickOutside);
			window.removeEventListener('keydown', handleKey);
		};
	}, [open]);

	// When the panel closes, exit editing mode so the next open shows a
	// freshly synced value.
	useEffect(() => {
		if (!open) {
			setEditing(false);
			setTextInvalid(false);
		}
	}, [open]);

	function applyHsv(nextH: number, nextS: number, nextV: number) {
		const next = { h: nextH, s: nextS, v: nextV };
		setHsv(next);
		onChange(hsvToHex(nextH, nextS, nextV));
	}

	function updateSvFromClient(clientX: number, clientY: number) {
		const el = areaRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const nextS = clamp((clientX - rect.left) / rect.width, 0, 1) * 100;
		const nextV = (1 - clamp((clientY - rect.top) / rect.height, 0, 1)) * 100;
		applyHsv(h, nextS, nextV);
	}

	function updateHueFromClient(clientX: number) {
		const el = hueRef.current;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const nextH = clamp((clientX - rect.left) / rect.width, 0, 1) * 360;
		applyHsv(nextH >= 360 ? 359 : nextH, s, v);
	}

	function commitText(current: string): boolean {
		const parsed = parseAnyFormat(current);
		if (parsed) {
			setTextInvalid(false);
			setEditing(false);
			setHsv(parsed);
			onChange(hsvToHex(parsed.h, parsed.s, parsed.v));
			return true;
		}
		setTextInvalid(true);
		return false;
	}

	function handleBlur() {
		// Commit ONLY when the text actually changed; otherwise just resync
		// and exit editing mode (avoids flashing an error on untouched blur).
		const expected = formatValue(format, hsv);
		if (text === expected) {
			setEditing(false);
			setTextInvalid(false);
			return;
		}
		commitText(text);
	}

	function cycleFormat() {
		setFormat((prev) => FORMATS[(FORMATS.indexOf(prev) + 1) % FORMATS.length]);
		// Exiting edit mode lets the sync effect render the same color in
		// the newly selected format (stable cross-format mapping).
		setEditing(false);
		setTextInvalid(false);
	}

	return (
		<div className="space-y-2" ref={rootRef}>
			<span className="uppercase font-bold text-xs text-foreground">{label}</span>
			<div className="relative">
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					aria-expanded={open}
					aria-label={`${label}: ${value}. Activate to ${open ? 'close' : 'open'} color picker`}
					className="flex w-full items-center gap-2 border-2 border-primary bg-black p-1 cursor-pointer hover:bg-primary/10 focus:outline-none focus-visible:outline-2 focus-visible:outline-white"
				>
					<span
						className="h-10 w-10 shrink-0 border border-primary"
						style={{ backgroundColor: value }}
						aria-hidden="true"
					/>
					<span className="text-xs text-primary uppercase pr-1 truncate">{value}</span>
				</button>

				{open && (
					<div className="absolute z-30 left-0 mt-1 w-64 max-w-full bg-black border-2 border-primary p-3 select-none">
						{/* Saturation / value area (HSV: top-left white, top-right pure hue, bottom black) */}
						<div
							ref={areaRef}
							role="slider"
							tabIndex={0}
							aria-label={`${label} saturation and value`}
							aria-valuetext={`saturation ${Math.round(s)} percent, value ${Math.round(v)} percent`}
							className="relative h-32 w-full cursor-crosshair touch-none border-2 border-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-white"
							style={{
								background: `linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, hsl(${Math.round(h)}, 100%, 50%))`,
								backgroundBlendMode: 'multiply'
							}}
							onPointerDown={(e) => {
								e.preventDefault();
								e.currentTarget.setPointerCapture(e.pointerId);
								updateSvFromClient(e.clientX, e.clientY);
							}}
							onPointerMove={(e) => {
								if (e.buttons & 1) updateSvFromClient(e.clientX, e.clientY);
							}}
							onPointerUp={(e) => {
								try {
									e.currentTarget.releasePointerCapture(e.pointerId);
								} catch {
									// No-op: capture may already be released.
								}
							}}
							onPointerCancel={(e) => {
								try {
									e.currentTarget.releasePointerCapture(e.pointerId);
								} catch {
									// No-op: capture may already be released.
								}
							}}
							onKeyDown={(e) => {
								const step = e.shiftKey ? 10 : 2;
								if (e.key === 'ArrowLeft') {
									e.preventDefault();
									applyHsv(h, clamp(s - step, 0, 100), v);
								} else if (e.key === 'ArrowRight') {
									e.preventDefault();
									applyHsv(h, clamp(s + step, 0, 100), v);
								} else if (e.key === 'ArrowUp') {
									e.preventDefault();
									applyHsv(h, s, clamp(v + step, 0, 100));
								} else if (e.key === 'ArrowDown') {
									e.preventDefault();
									applyHsv(h, s, clamp(v - step, 0, 100));
								}
							}}
						>
							<span
								className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-black pointer-events-none"
								style={{ left: `${s}%`, top: `${100 - v}%` }}
							/>
						</div>

						{/* Hue strip (custom pointer-capture drag, square thumb line) */}
						<div
							ref={hueRef}
							role="slider"
							tabIndex={0}
							aria-label={`${label} hue`}
							aria-valuemin={0}
							aria-valuemax={359}
							aria-valuenow={Math.round(h)}
							aria-valuetext={`hue ${Math.round(h)} degrees`}
							className="relative mt-3 h-5 w-full cursor-pointer touch-none border-2 border-primary focus:outline-none focus-visible:outline-2 focus-visible:outline-white"
							style={{
								background:
									'linear-gradient(to right, #f00, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00)'
							}}
							onPointerDown={(e) => {
								e.preventDefault();
								e.currentTarget.setPointerCapture(e.pointerId);
								updateHueFromClient(e.clientX);
							}}
							onPointerMove={(e) => {
								if (e.buttons & 1) updateHueFromClient(e.clientX);
							}}
							onPointerUp={(e) => {
								try {
									e.currentTarget.releasePointerCapture(e.pointerId);
								} catch {
									// No-op: capture may already be released.
								}
							}}
							onPointerCancel={(e) => {
								try {
									e.currentTarget.releasePointerCapture(e.pointerId);
								} catch {
									// No-op: capture may already be released.
								}
							}}
							onKeyDown={(e) => {
								const step = e.shiftKey ? 15 : 2;
								if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
									e.preventDefault();
									applyHsv((h - step + 360) % 360, s, v);
								} else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
									e.preventDefault();
									applyHsv((h + step) % 360, s, v);
								}
							}}
						>
							<span
								className="absolute top-0 h-full w-1 -translate-x-1/2 bg-white border border-black pointer-events-none"
								style={{ left: `${(h / 360) * 100}%` }}
							/>
						</div>

						{/* Format cycler + value input row */}
						<div className="mt-3 flex gap-2">
							<button
								type="button"
								onClick={cycleFormat}
								className="shrink-0 border-2 border-primary bg-black px-2 py-2 text-xs font-bold uppercase text-primary cursor-pointer hover:bg-primary hover:text-black focus:outline-none focus-visible:outline-2 focus-visible:outline-white"
								aria-label={`Color format, current: ${format}. Activate to cycle format`}
								title="Cycle format (HEX → HSL → RGB)"
							>
								{format}
							</button>
							<input
								ref={inputRef}
								type="text"
								value={text}
								spellCheck={false}
								autoComplete="off"
								onChange={(e) => {
									setText(e.target.value);
									if (textInvalid) setTextInvalid(false);
								}}
								onFocus={() => setEditing(true)}
								onBlur={handleBlur}
								onKeyDown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										if (commitText((e.target as HTMLInputElement).value)) {
											(e.target as HTMLInputElement).blur();
										}
									}
								}}
								className={`min-w-0 flex-1 bg-black border-2 ${textInvalid ? 'border-red-500' : 'border-primary'} text-primary p-2 text-xs uppercase focus:outline-none focus-visible:outline-2 focus-visible:outline-white`}
								aria-label="Color value"
								aria-invalid={textInvalid}
							/>
						</div>
						{textInvalid && (
							<p className="mt-1 text-[10px] uppercase tracking-wider text-red-500">
								Invalid color value
							</p>
						)}

						{/* B&W preset swatches */}
						<div className="mt-3 flex gap-2" role="group" aria-label="Preset colors">
							{PRESETS.map((preset) => (
								<button
									key={preset}
									type="button"
									onClick={() => {
										setEditing(false);
										setTextInvalid(false);
										onChange(preset);
									}}
									className="h-6 w-6 shrink-0 border-2 border-primary cursor-pointer hover:outline hover:outline-2 hover:outline-white focus:outline-none focus-visible:outline-2 focus-visible:outline-white"
									style={{ backgroundColor: preset }}
									aria-label={`Use preset color ${preset}`}
									title={preset}
								/>
							))}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
