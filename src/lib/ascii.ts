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

export async function imageToAscii(
    imageUrl: string,
    options: AsciiOptions
): Promise<{ text: string; html?: string }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error('Could not get canvas context'));
                return;
            }

            const scale = options.width / img.width;
            const height = Math.floor(img.height * scale * 0.5); // 0.5 to account for char aspect ratio
            const width = options.width;

            canvas.width = width;
            canvas.height = height;

            ctx.drawImage(img, 0, 0, width, height);
            const imageData = ctx.getImageData(0, 0, width, height);
            const data = imageData.data;

            let asciiStr = '';
            const chars = charsets[options.charset];
            const charLen = chars.length;

            for (let i = 0; i < height; i++) {
                for (let j = 0; j < width; j++) {
                    const offset = (i * width + j) * 4;
                    const r = data[offset];
                    const g = data[offset + 1];
                    const b = data[offset + 2];
                    const a = data[offset + 3];

                    if (a === 0) {
                        asciiStr += ' ';
                        continue;
                    }

                    let brightness = 0.299 * r + 0.587 * g + 0.114 * b;

                    const factor = (259 * (options.contrast + 255)) / (255 * (259 - options.contrast));
                    brightness = factor * (brightness - 128) + 128;
                    brightness = Math.max(0, Math.min(255, brightness));

                    if (options.inverted) {
                        brightness = 255 - brightness;
                    }

                    const charIndex = Math.floor((brightness / 255) * (charLen - 1));
                    asciiStr += chars[charIndex];
                }
                asciiStr += '\n';
            }

            resolve({ text: asciiStr });
        };
        img.onerror = (err) => reject(err);
        img.src = imageUrl;
    });
}
