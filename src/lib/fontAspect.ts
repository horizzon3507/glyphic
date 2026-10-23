export function measureFontAspect(font: string): number {
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) return 0.5;
	ctx.font = `64px "${font}", monospace`;
	const advance = ctx.measureText('M').width;
	if (!Number.isFinite(advance)) return 0.5;
	const aspect = advance / (64 * 0.6);
	const clamped = Math.min(1.2, Math.max(0.3, aspect));
	return Math.round(clamped * 100) / 100;
}
