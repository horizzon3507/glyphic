import { charsets, type AsciiOptions, type Charset } from '@/lib/ascii';

const fonts = ['Courier New', 'VT323', 'Press Start 2P', 'Share Tech Mono', 'Fira Code'];
const charsetOptions = Object.keys(charsets) as Charset[];

interface SidebarProps {
	options: AsciiOptions;
	onOptionsChange: (options: AsciiOptions) => void;
	onImageUpload: (file: File) => void;
}

function update(options: AsciiOptions, patch: Partial<AsciiOptions>, onOptionsChange: SidebarProps['onOptionsChange']) {
	onOptionsChange({ ...options, ...patch });
}

export function Sidebar({ options, onOptionsChange, onImageUpload }: SidebarProps) {
	function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (file) onImageUpload(file);
		e.target.value = '';
	}

	return (
		<aside className="flex w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r-2 border-primary bg-black p-4">
			<div className="space-y-2">
				<span className="uppercase font-bold text-xs text-foreground">Input Source</span>
				<input
					type="file"
					accept="image/*"
					onChange={handleFileChange}
					className="border-2 border-primary bg-black p-2 text-xs text-primary file:mr-2 file:border-2 file:border-primary file:bg-black file:px-2 file:py-1 file:text-xs file:uppercase file:text-primary file:cursor-pointer"
					aria-label="Upload image"
				/>
			</div>

			<div className="space-y-2">
				<label className="flex justify-between text-xs uppercase text-primary">
					<span>Resolution</span>
					<span>{options.width}</span>
				</label>
				<input
					type="range" min={20} max={400} value={options.width}
					onChange={(e) => update(options, { width: Number(e.target.value) }, onOptionsChange)}
					className="w-full accent-black"
					aria-label="Resolution"
				/>
				<label className="flex justify-between text-xs uppercase text-primary">
					<span>Contrast</span>
					<span>{options.contrast}</span>
				</label>
				<input
					type="range" min={-100} max={100} value={options.contrast}
					onChange={(e) => update(options, { contrast: Number(e.target.value) }, onOptionsChange)}
					className="w-full"
					aria-label="Contrast"
				/>
			</div>

			<div className="space-y-2">
				<span className="uppercase font-bold text-xs text-foreground">Charset</span>
				<select
					value={options.charset}
					onChange={(e) => update(options, { charset: e.target.value as Charset }, onOptionsChange)}
					className="w-full border-2 border-primary bg-black p-2 text-xs uppercase text-primary"
					aria-label="Character set"
				>
					{charsetOptions.map((c) => <option key={c} value={c}>{c}</option>)}
				</select>
			</div>

			<div className="space-y-2">
				<span className="uppercase font-bold text-xs text-foreground">Font</span>
				<select
					value={options.font}
					onChange={(e) => update(options, { font: e.target.value }, onOptionsChange)}
					className="w-full border-2 border-primary bg-black p-2 text-xs uppercase text-primary"
					aria-label="Font family"
				>
					{fonts.map((f) => <option key={f} value={f}>{f}</option>)}
				</select>
			</div>

			<div className="flex gap-2">
				<label className="flex flex-1 items-center gap-2 text-xs uppercase text-primary">
					<input
						type="checkbox" checked={options.inverted}
						onChange={(e) => update(options, { inverted: e.target.checked }, onOptionsChange)}
						className="accent-black"
					/>
					Invert
				</label>
			</div>

			<label className="flex items-center gap-2 text-xs uppercase text-primary">
				<input
					type="checkbox" checked={options.colorMode}
					onChange={(e) => update(options, { colorMode: e.target.checked }, onOptionsChange)}
				/>
				Color mode
			</label>

			<div className="space-y-2">
				<span className="uppercase font-bold text-xs text-foreground">Text Color</span>
				<input
					type="color" value={options.textColor}
					onChange={(e) => update(options, { textColor: e.target.value }, onOptionsChange)}
					className="h-10 w-full cursor-pointer border-2 border-primary bg-black"
					aria-label="Text color"
				/>
				<span className="uppercase font-bold text-xs text-foreground">Background Color</span>
				<input
					type="color" value={options.bgColor}
					onChange={(e) => update(options, { bgColor: e.target.value }, onOptionsChange)}
					className="h-10 w-full cursor-pointer border-2 border-primary bg-black"
					aria-label="Background color"
				/>
			</div>

			<a
				href="https://github.com/horizzon3507/"
				target="_blank"
				rel="noreferrer"
				className="border-2 border-primary bg-black p-2 text-center text-xs uppercase text-primary cursor-pointer hover:bg-primary hover:text-black focus:outline-none focus-visible:outline-2 focus-visible:outline-white"
			>
				GitHub ↗
			</a>
		</aside>
	);
}

export default Sidebar;
