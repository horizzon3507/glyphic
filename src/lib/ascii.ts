export type Charset = 'Standard' | 'Simple' | 'Blocks' | 'Binary' | 'Matrix' | 'Detailed';

export const charsets: Record<Charset, string> = {
    Standard: '@%#*+=-:. ',
    Simple: '@#=-. ',
    Blocks: '█▓▒░ ',
    Binary: '01 ',
    Matrix: '0123456789abcdef ',
    Detailed: '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'. '
};

export interface AsciiOptions {
    width: number;
    contrast: number;
    font: string;
    charset: Charset;
    inverted: boolean;
    colorMode: boolean;
    textColor: string;
    bgColor: string;
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

export async function imageToAscii(
    imageUrl: string,
    options: AsciiOptions
): Promise<{ text: string; html?: string }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const width = options.width;
            const height = Math.floor((img.height / img.width) * width * 0.5); // char aspect ratio

            const targetCanvas = document.createElement('canvas');
            targetCanvas.width = width;
            targetCanvas.height = height;
            const tctx = targetCanvas.getContext('2d');
            if (!tctx) {
                reject(new Error('Could not get canvas context'));
                return;
            }

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

            const chars = charsets[options.charset];
            const charLen = chars.length;
            const contrastFactor = (259 * (options.contrast + 255)) / (255 * (259 - options.contrast));
            const brightnessScale = (charLen - 1) / 255;

            const textRows: string[] = [];
            const htmlRows: string[] = [];

            for (let by = 0; by < height; by++) {
                let textRow = '';
                let htmlRow = '';
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
                    const n = k * k * 255;
                    if (sumA < n * 0.05) {
                        textRow += ' ';
                        htmlRow += ' ';
                        continue;
                    }
                    const r = sumR / sumA;
                    const g = sumG / sumA;
                    const b = sumB / sumA;

                    // Perceptual luminance (Rec. 709).
                    let brightness = 0.2126 * r + 0.7152 * g + 0.0722 * b;
                    brightness = contrastFactor * (brightness - 128) + 128;
                    brightness = clamp(brightness, 0, 255);
                    if (options.inverted) brightness = 255 - brightness;

                    const ch = chars[Math.floor(brightness * brightnessScale)];
                    textRow += ch;

                    if (options.colorMode) {
                        let rOut = Math.round(r), gOut = Math.round(g), bOut = Math.round(b);
                        if (options.inverted) {
                            rOut = 255 - rOut;
                            gOut = 255 - gOut;
                            bOut = 255 - bOut;
                        }
                        htmlRow += `<span style="color: rgb(${rOut},${gOut},${bOut})">${escapeHtmlChar(ch)}</span>`;
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
        };
        img.onerror = (err) => reject(err);
        img.src = imageUrl;
    });
}
