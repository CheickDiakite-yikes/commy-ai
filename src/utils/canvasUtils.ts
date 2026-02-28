import { OverlayConfig } from '../types';

export const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, textAlign: CanvasTextAlign) => {
    const words = text.split(' ');
    let line = '';
    const lines = [];
    for (let n = 0; n < words.length; n++) {
        const testLine = line + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        const testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            lines.push(line);
            line = words[n] + ' ';
        } else {
            line = testLine;
        }
    }
    lines.push(line);
    ctx.textAlign = textAlign;
    lines.forEach((l, i) => {
        ctx.fillText(l.trim(), x, y + (i * lineHeight));
    });
};

export const drawTextOverlayToCanvas = (ctx: CanvasRenderingContext2D, width: number, height: number, text: string, config?: OverlayConfig) => {
    if (!text) return;
    const pos = config?.position || 'center';
    const size = config?.size || 'large';
    const scale = width < height ? width / 720 : height / 720;
    let fontSize = 48;
    switch(size) {
        case 'small': fontSize = 24; break;
        case 'medium': fontSize = 36; break;
        case 'xl': fontSize = 72; break;
        case 'large': default: fontSize = 48; break;
    }
    fontSize = fontSize * scale;
    ctx.font = `900 ${fontSize}px "Outfit", sans-serif`;
    ctx.fillStyle = 'white';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;
    const padding = 64 * scale;
    const lineHeight = fontSize * 1.2;
    const maxWidth = width * 0.8;
    let x = width / 2;
    let y = height / 2;
    let align: CanvasTextAlign = 'center';
    switch(pos) {
        case 'top-left': x = padding; y = padding + fontSize; align = 'left'; break;
        case 'top-right': x = width - padding; y = padding + fontSize; align = 'right'; break;
        case 'bottom-left': x = padding; y = height - padding - (lineHeight * 2); align = 'left'; break;
        case 'bottom-right': x = width - padding; y = height - padding - (lineHeight * 2); align = 'right'; break;
        case 'top': x = width / 2; y = padding + fontSize; align = 'center'; break;
        case 'bottom': x = width / 2; y = height - padding - (lineHeight * 2); align = 'center'; break;
        case 'center': default: x = width / 2; y = height / 2; align = 'center'; break;
    }
    wrapText(ctx, text, x, y, maxWidth, lineHeight, align);
};
