import * as THREE from 'three';

/**
 * Procedural texture generator for Metrópolis Pro.
 * Uses HTML Canvas to generate high-detail noise and patterns.
 */

const textureCache: Record<string, THREE.CanvasTexture> = {};

const generateNoiseTexture = (width: number, height: number, color1: string, color2: string, density: number = 0.5) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = color1;
    ctx.fillRect(0, 0, width, height);

    for (let i = 0; i < width * height * density; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height;
        const size = Math.random() * 2;
        ctx.fillStyle = color2;
        ctx.globalAlpha = Math.random() * 0.3;
        ctx.fillRect(x, y, size, size);
    }

    return new THREE.CanvasTexture(canvas);
};

export const getAsphaltTexture = () => {
    if (textureCache['asphalt']) return textureCache['asphalt'];
    const tex = generateNoiseTexture(256, 256, '#1e293b', '#64748b', 0.8);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 10);
    textureCache['asphalt'] = tex;
    return tex;
};

export const getGrassTexture = () => {
    if (textureCache['grass']) return textureCache['grass'];
    const tex = generateNoiseTexture(256, 256, '#15803d', '#166534', 0.9);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(5, 5);
    textureCache['grass'] = tex;
    return tex;
};

export const getConcreteTexture = () => {
    if (textureCache['concrete']) return textureCache['concrete'];
    const tex = generateNoiseTexture(128, 128, '#94a3b8', '#cbd5e1', 0.4);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    textureCache['concrete'] = tex;
    return tex;
};

export const getFabricTexture = (color: string) => {
    const key = `fabric_${color}`;
    if (textureCache[key]) return textureCache[key];

    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 64, 64);

    ctx.strokeStyle = '#000000';
    ctx.globalAlpha = 0.1;
    ctx.lineWidth = 1;

    for (let i = 0; i < 64; i += 4) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 64);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(64, i);
        ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    textureCache[key] = tex;
    return tex;
};

export const getWindowTexture = (isNight: boolean) => {
    const key = `window_${isNight ? 'night' : 'day'}`;
    if (textureCache[key]) return textureCache[key];

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 128, 128);

    const rows = 4;
    const cols = 4;
    const padding = 10;
    const winWidth = (128 - padding * (cols + 1)) / cols;
    const winHeight = (128 - padding * (rows + 1)) / rows;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = padding + c * (winWidth + padding);
            const y = padding + r * (winHeight + padding);

            if (isNight && Math.random() > 0.4) {
                ctx.fillStyle = '#fef08a';
                ctx.shadowBlur = 15;
                ctx.shadowColor = '#fef08a';
            } else {
                ctx.fillStyle = '#1e293b';
                ctx.shadowBlur = 0;
            }

            ctx.fillRect(x, y, winWidth, winHeight);
        }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    textureCache[key] = tex;
    return tex;
};
