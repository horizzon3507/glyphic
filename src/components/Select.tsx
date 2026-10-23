import { useEffect, useRef, useState } from 'react';

interface SelectProps {
	value: string;
	/** Label shown above the dropdown. */
	label?: string;
	options: readonly string[];
	labels?: Record<string, string>;
	onChange: (value: string) => void;
}

export default function Select({ value, label, options, labels, onChange }: SelectProps) {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		function handleKey(e: KeyboardEvent) {
			if (e.key === 'Escape') setOpen(false);
		}
		window.addEventListener('mousedown', handleClick);
		window.addEventListener('keydown', handleKey);
		return () => {
			window.removeEventListener('mousedown', handleClick);
			window.removeEventListener('keydown', handleKey);
		};
	}, [open]);

	return (
		<div className="space-y-2">
			{label && <span className="uppercase font-bold text-xs text-foreground">{label}</span>}
			<div ref={ref} className="relative">
				<button
					type="button"
					onClick={() => setOpen((o) => !o)}
					className="flex w-full items-center justify-between bg-black border-2 border-primary text-primary p-2 uppercase focus:outline-none cursor-pointer text-left"
				>
					{labels?.[value] ?? value}
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						className="h-4 w-4 shrink-0"
						aria-hidden="true"
					>
						<path d="M6 9l6 6 6-6" strokeLinecap="square" />
					</svg>
				</button>
				{open && (
					<ul
						role="listbox"
						className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto bg-black border-2 border-primary"
					>
						{options.map((option) => (
							<li key={option}>
								<button
									type="button"
									role="option"
									aria-selected={option === value}
									onClick={() => {
										onChange(option);
										setOpen(false);
									}}
									className={`w-full text-left p-2 uppercase cursor-pointer truncate transition-colors ${
										option === value
											? 'bg-primary text-black font-bold'
											: 'text-primary hover:bg-primary/20'
									}`}
								>
									{labels?.[option] ?? option}
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
