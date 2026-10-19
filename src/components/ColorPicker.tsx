import { useState } from 'react';

interface ColorPickerProps {
	label: string;
	value: string;
	onChange: (hex: string) => void;
}

export default function ColorPicker({ label, value, onChange }: ColorPickerProps) {
	const [text, setText] = useState(value);

	return (
		<div className="space-y-2">
			<span className="uppercase font-bold text-xs text-foreground">{label}</span>
			<div className="flex gap-2">
				<label className="relative h-10 w-14 shrink-0 cursor-pointer border-2 border-primary bg-black hover:bg-primary/10">
					<input
						type="color"
						value={value}
						onChange={(e) => {
							setText(e.target.value);
							onChange(e.target.value);
						}}
						className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
						aria-label={`${label} color swatch`}
					/>
					<span
						className="pointer-events-none m-2 block h-6 border border-primary"
						style={{ backgroundColor: value }}
					/>
				</label>
				<input
					type="text"
					value={text}
					spellCheck={false}
					onChange={(e) => {
						const next = e.target.value;
						setText(next);
						if (/^#[0-9a-fA-F]{6}$/.test(next) || /^#[0-9a-fA-F]{3}$/.test(next)) {
							onChange(next);
						}
					}}
					className="min-w-0 flex-1 bg-black border-2 border-primary text-primary p-2 text-xs uppercase focus:outline-none focus-visible:outline-2 focus-visible:outline-white"
					aria-label={`${label} hex value`}
				/>
			</div>
		</div>
	);
}
