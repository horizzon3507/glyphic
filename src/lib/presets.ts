import type { AsciiOptions, Charset, DitherMode } from '@/lib/ascii';

export interface LookPreset {
	id: string;
	label: string;
	font: string;
	charset: Charset;
	textColor: string;
	bgColor: string;
	contrast: number;
	inverted: boolean;
	dither: DitherMode;
	aspect: number;
	colorMode: false;
}

export const LOOKS: LookPreset[] = [
	{
		id: 'amber',
		label: 'Amber',
		font: 'VT323',
		charset: 'Standard',
		textColor: '#ffb000',
		bgColor: '#1a0e00',
		contrast: 40,
		inverted: true,
		dither: 'floyd-steinberg',
		aspect: 0.45,
		colorMode: false
	},
	{
		id: 'phosphor',
		label: 'Phosphor',
		font: 'Share Tech Mono',
		charset: 'Detailed',
		textColor: '#39ff14',
		bgColor: '#031208',
		contrast: 24,
		inverted: true,
		dither: 'atkinson',
		aspect: 0.5,
		colorMode: false
	},
	{
		id: 'gameboy',
		label: 'Game Boy',
		font: 'Press Start 2P',
		charset: 'Blocks',
		textColor: '#0f380f',
		bgColor: '#9bbc0f',
		contrast: 36,
		inverted: false,
		dither: 'atkinson',
		aspect: 0.85,
		colorMode: false
	},
	{
		id: 'receipt',
		label: 'Receipt',
		font: 'IBM Plex Mono',
		charset: 'Simple',
		textColor: '#1c1c1c',
		bgColor: '#f3efe6',
		contrast: 8,
		inverted: false,
		dither: 'none',
		aspect: 0.5,
		colorMode: false
	},
	{
		id: 'matrix',
		label: 'Matrix',
		font: 'Fira Code',
		charset: 'Matrix',
		textColor: '#00ff41',
		bgColor: '#000000',
		contrast: 48,
		inverted: true,
		dither: 'none',
		aspect: 0.5,
		colorMode: false
	}
];

export function applyLook(current: AsciiOptions, look: LookPreset): AsciiOptions {
	return {
		...current,
		font: look.font,
		charset: look.charset,
		textColor: look.textColor,
		bgColor: look.bgColor,
		contrast: look.contrast,
		inverted: look.inverted,
		dither: look.dither,
		aspect: look.aspect,
		colorMode: false,
		customCharset: ''
	};
}
