import { memo } from 'react';
import Select from '@/components/Select';
import ColorPicker from '@/components/ColorPicker';
import { charsets, type AsciiOptions, type Charset, type DitherMode } from '@/lib/ascii';
import { measureFontAspect } from '@/lib/fontAspect';
import { LOOKS, applyLook } from '@/lib/presets';

const fonts = ['Courier New', 'VT323', 'Press Start 2P', 'Share Tech Mono', 'Fira Code', 'IBM Plex Mono', 'Space Mono', 'JetBrains Mono'];

const charsetOptions = Object.keys(charsets) as Charset[];

const ditherOptions = ['none', 'floyd-steinberg', 'atkinson'];

const ditherLabels: Record<string, string> = {
	none: 'None',
	'floyd-steinberg': 'Floyd-Steinberg',
	atkinson: 'Atkinson'
};

const crtButtonClass =
	'flex w-full items-center justify-center gap-1.5 border-2 border-primary bg-black px-2 py-1.5 text-xs font-bold uppercase text-primary cursor-pointer hover:bg-primary hover:text-black focus:outline-none focus-visible:outline-2 focus-visible:outline-white transition-colors';

const rangeClass =
	'w-full h-4 bg-secondary appearance-none cursor-pointer border-2 border-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-black';

interface SidebarProps {
	options: AsciiOptions;
	onOptionsChange: (options: AsciiOptions) => void;
	onImageUpload: (file: File) => void;
	onRemoveImage?: () => void;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}

// Memoized so parent re-renders that don't change options/props identity
// (e.g. ascii output updates, GitHub/menu state toggles) don't re-render the
// whole sidebar tree. Options changes still re-render, by design.
function Sidebar({ options, onOptionsChange, onImageUpload, onRemoveImage, open = true, onOpenChange }: SidebarProps) {
	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		if (e.target.files && e.target.files[0]) {
			onImageUpload(e.target.files[0]);
		}
	}

	return (
		<div
			className={`h-full w-80 max-w-[85vw] shrink-0 border-r-2 border-primary bg-black p-4 md:p-6 flex flex-col gap-6 overflow-y-auto font-mono transition-transform duration-200 ease-out fixed inset-y-0 left-0 z-40 md:relative md:z-auto md:translate-x-0 md:block ${
				open ? 'translate-x-0' : '-translate-x-full'
			}`}
		>
			<div className="flex items-center justify-between md:hidden">
				<span className="text-xs font-bold uppercase tracking-widest text-primary">Settings</span>
				<button
					type="button"
					onClick={() => onOpenChange?.(false)}
					aria-label="Close settings menu"
					className="flex h-8 w-8 items-center justify-center border-2 border-primary font-mono text-base font-bold uppercase text-primary hover:bg-primary hover:text-black transition-colors"
				>
					✕
				</button>
			</div>
			<div className="space-y-2 border-2 border-primary p-4 text-center">
				<h2 className="text-xl font-bold tracking-widest uppercase glow-text">Glyphic</h2>
				<p className="text-xs text-primary/80 uppercase">
					Apply your images to a more vintage look (or simply convert them to plain text).
				</p>
			</div>

			<div className="border-t-2 border-primary border-dashed my-4 md:my-6" />

			<div className="space-y-2">
				<span className="uppercase font-bold tracking-wider text-xs text-foreground">Looks</span>
				<div className="space-y-2">
					{LOOKS.map((look) => (
						<button
							key={look.id}
							type="button"
							onClick={() => onOptionsChange(applyLook(options, look))}
							className={crtButtonClass}
						>
							{look.label}
						</button>
					))}
				</div>
			</div>

			<div className="border-t-2 border-primary border-dashed my-4 md:my-6" />

			<div className="space-y-2">
				<label htmlFor="image" className="uppercase font-bold tracking-wider text-xs text-foreground">
					Input Source
				</label>
				<div className="border-2 border-primary p-1 bg-black">
					<input
						id="image"
						type="file"
						accept="image/*"
						onChange={handleFileChange}
						className="w-full bg-transparent text-sm file:mr-4 file:py-2 file:px-4 file:border-2 file:border-primary file:text-primary file:bg-black file:uppercase hover:file:bg-primary hover:file:text-black cursor-pointer focus:outline-none"
					/>
				</div>
				{onRemoveImage && (
					<button
						type="button"
						onClick={onRemoveImage}
						title="Remove the current image"
						className={crtButtonClass}
					>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5" aria-hidden="true">
							<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" strokeLinecap="square" />
						</svg>
						Remove Image
					</button>
				)}
			</div>

			<div className="border-t-2 border-primary border-dashed my-4 md:my-6" />

			<div className="space-y-4">
				<div className="space-y-2">
					<div className="flex justify-between">
						<label className="uppercase font-bold text-xs text-foreground">
							Resolution [{options.width}px]
						</label>
					</div>
					<input
						type="range"
						min={20}
						max={300}
						step={1}
						value={options.width}
						onChange={(e) =>
							onOptionsChange({ ...options, width: Number(e.target.value) })
						}
						className={rangeClass}
					/>
				</div>

				<div className="space-y-2">
					<div className="flex justify-between">
						<label className="uppercase font-bold text-xs text-foreground">
							Contrast [{options.contrast}]
						</label>
					</div>
					<input
						type="range"
						min={-128}
						max={128}
						step={1}
						value={options.contrast}
						onChange={(e) =>
							onOptionsChange({ ...options, contrast: Number(e.target.value) })
						}
						className={rangeClass}
					/>
				</div>

				<Select
					label="Font Family"
					value={options.font}
					options={fonts}
					onChange={(font) => onOptionsChange({ ...options, font })}
				/>

				<Select
					label="Character Set"
					value={options.charset}
					options={charsetOptions}
					onChange={(charset) =>
						onOptionsChange({ ...options, charset: charset as Charset, customCharset: '' })
					}
				/>

				<div className="space-y-2">
					<label htmlFor="custom-ramp" className="uppercase font-bold text-xs text-foreground">
						Custom ramp
					</label>
					<input
						id="custom-ramp"
						type="text"
						value={options.customCharset}
						onChange={(e) => onOptionsChange({ ...options, customCharset: e.target.value })}
						placeholder="Darkest to lightest. Empty uses the set above."
						className="w-full bg-black border-2 border-primary text-primary font-mono p-2 text-sm"
					/>
					<p className="text-xs text-primary/80">Ink order is measured from the current font.</p>
				</div>

				<Select
					label="Dither"
					value={options.dither}
					options={ditherOptions}
					labels={ditherLabels}
					onChange={(dither) => onOptionsChange({ ...options, dither: dither as DitherMode })}
				/>

				<div className="space-y-2">
					<div className="flex justify-between">
						<label className="uppercase font-bold text-xs text-foreground">
							Aspect [{options.aspect.toFixed(2)}]
						</label>
					</div>
					<input
						type="range"
						min={0.3}
						max={1.2}
						step={0.01}
						value={options.aspect}
						onChange={(e) =>
							onOptionsChange({ ...options, aspect: Number(e.target.value) })
						}
						className={rangeClass}
					/>
					<button
						type="button"
						onClick={() =>
							onOptionsChange({ ...options, aspect: measureFontAspect(options.font) })
						}
						className={crtButtonClass}
					>
						Match font
					</button>
				</div>
			</div>

			<div className="border-t-2 border-primary border-dashed my-4 md:my-6" />

			<div className="space-y-4">
				<div className="flex items-center justify-between border-2 border-primary p-2 hover:bg-primary/10 cursor-pointer">
					<label htmlFor="invert" className="uppercase font-bold text-xs cursor-pointer text-foreground">
						Invert Colors
					</label>
					<input
						type="checkbox"
						id="invert"
						checked={options.inverted}
						onChange={(e) => onOptionsChange({ ...options, inverted: e.target.checked })}
						className="accent-primary h-4 w-4 cursor-pointer"
					/>
				</div>

				<div className="flex items-center justify-between border-2 border-primary p-2 hover:bg-primary/10 cursor-pointer">
					<label
						htmlFor="color-mode"
						className="uppercase font-bold text-xs cursor-pointer text-foreground"
					>
						Color Mode [EXP]
					</label>
					<input
						type="checkbox"
						id="color-mode"
						checked={options.colorMode}
						onChange={(e) => onOptionsChange({ ...options, colorMode: e.target.checked })}
						className="accent-primary h-4 w-4 cursor-pointer"
					/>
				</div>
			</div>

			<div className="border-t-2 border-primary border-dashed my-4 md:my-6" />

			<div className="space-y-4">
				<ColorPicker
					label="Text Color"
					value={options.textColor}
					onChange={(textColor) => onOptionsChange({ ...options, textColor })}
				/>
				<ColorPicker
					label="Background Color"
					value={options.bgColor}
					onChange={(bgColor) => onOptionsChange({ ...options, bgColor })}
				/>
			</div>

			<div className="mt-auto pt-6" />
		</div>
	);
}

export default memo(Sidebar);
