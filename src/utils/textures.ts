import * as THREE from 'three';

/**
 * PRO PROCEDURAL TEXTURE GENERATOR
 * Generates stylized Albedo, Normal, and Roughness maps for high-fidelity rendering.
 */
export class TextureGenerator {

  /**
   * Helper to convert a grayscale heightmap canvas to a Normal Map
   */
  private static heightToNormal(heightCanvas: HTMLCanvasElement, strength = 1.0): HTMLCanvasElement {
    const width = heightCanvas.width;
    const height = heightCanvas.height;
    const ctx = heightCanvas.getContext('2d')!;
    const src = ctx.getImageData(0, 0, width, height);

    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = width;
    normalCanvas.height = height;
    const normalCtx = normalCanvas.getContext('2d')!;
    const dst = normalCtx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const xLeft = (x - 1 + width) % width;
        const xRight = (x + 1) % width;
        const yUp = (y - 1 + height) % height;
        const yDown = (y + 1) % height;

        const hL = src.data[(y * width + xLeft) * 4] / 255;
        const hR = src.data[(y * width + xRight) * 4] / 255;
        const hU = src.data[(yUp * width + x) * 4] / 255;
        const hD = src.data[(yDown * width + x) * 4] / 255;

        const dx = (hL - hR) * strength;
        const dy = (hU - hD) * strength;
        const dz = 1.0;

        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        dst.data[(y * width + x) * 4 + 0] = ((dx / len) * 0.5 + 0.5) * 255;
        dst.data[(y * width + x) * 4 + 1] = ((dy / len) * 0.5 + 0.5) * 255;
        dst.data[(y * width + x) * 4 + 2] = (dz / len) * 255;
        dst.data[(y * width + x) * 4 + 3] = 255;
      }
    }
    normalCtx.putImageData(dst, 0, 0);
    return normalCanvas;
  }

  static createCobblestone(size = 512) {
    const albedo = document.createElement('canvas');
    const height = document.createElement('canvas');
    const roughness = document.createElement('canvas');
    [albedo, height, roughness].forEach(c => { c.width = size; c.height = size; });

    const aCtx = albedo.getContext('2d')!;
    const hCtx = height.getContext('2d')!;
    const rCtx = roughness.getContext('2d')!;

    // Base colors
    aCtx.fillStyle = '#2c2c2e';
    aCtx.fillRect(0, 0, size, size);
    hCtx.fillStyle = '#000000';
    hCtx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#666666'; // Medium rough
    rCtx.fillRect(0, 0, size, size);

    // Seed for consistent randomness across maps
    const stones = [];
    for(let i=0; i<120; i++) {
        stones.push({
            x: Math.random() * size,
            y: Math.random() * size,
            r: 15 + Math.random() * 35,
            shade: 40 + Math.random() * 60,
            rough: 100 + Math.random() * 100
        });
    }

    stones.forEach(s => {
        // Albedo
        const aGrad = aCtx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        aGrad.addColorStop(0, `rgb(${s.shade}, ${s.shade}, ${s.shade+5})`);
        aGrad.addColorStop(1, `rgb(${s.shade-20}, ${s.shade-20}, ${s.shade-15})`);
        aCtx.fillStyle = aGrad;
        aCtx.beginPath();
        aCtx.roundRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2, 12);
        aCtx.fill();

        // Height (for normal)
        const hGrad = hCtx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
        hGrad.addColorStop(0, '#ffffff');
        hGrad.addColorStop(1, '#000000');
        hCtx.fillStyle = hGrad;
        hCtx.beginPath();
        hCtx.roundRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2, 12);
        hCtx.fill();

        // Roughness
        rCtx.fillStyle = `rgb(${s.rough}, ${s.rough}, ${s.rough})`;
        rCtx.beginPath();
        rCtx.roundRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2, 12);
        rCtx.fill();
    });

    // Grain/Noise
    for(let i=0; i<8000; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const val = Math.random() * 20;
        aCtx.fillStyle = `rgba(0,0,0,${Math.random() * 0.2})`;
        aCtx.fillRect(x, y, 1, 1);
    }

    const albedoTex = new THREE.CanvasTexture(albedo);
    const normalTex = new THREE.CanvasTexture(this.heightToNormal(height, 2.0));
    const roughnessTex = new THREE.CanvasTexture(roughness);

    [albedoTex, normalTex, roughnessTex].forEach(t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    });

    return { map: albedoTex, normalMap: normalTex, roughnessMap: roughnessTex };
  }

  static createWoodGrain(color1 = '#5d4037', color2 = '#3e2723', size = 512) {
    const albedo = document.createElement('canvas');
    const height = document.createElement('canvas');
    const roughness = document.createElement('canvas');
    [albedo, height, roughness].forEach(c => { c.width = size; c.height = size; });

    const aCtx = albedo.getContext('2d')!;
    const hCtx = height.getContext('2d')!;
    const rCtx = roughness.getContext('2d')!;

    aCtx.fillStyle = color1;
    aCtx.fillRect(0, 0, size, size);
    hCtx.fillStyle = '#888888';
    hCtx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#444444'; // Smoothish wood
    rCtx.fillRect(0, 0, size, size);

    // Draw wood lines
    for (let i = 0; i < size; i += 6) {
      const offset = Math.sin(i * 0.1) * 10;

      aCtx.strokeStyle = color2;
      aCtx.lineWidth = 2 + Math.random() * 2;
      aCtx.beginPath();
      aCtx.moveTo(0, i + offset);
      for (let x = 0; x < size; x += 20) {
        aCtx.lineTo(x, i + offset + Math.sin(x * 0.05 + i) * 5);
      }
      aCtx.stroke();

      hCtx.strokeStyle = `rgba(0,0,0,${0.2})`;
      hCtx.lineWidth = 1;
      hCtx.beginPath();
      hCtx.moveTo(0, i + offset);
      hCtx.lineTo(size, i + offset);
      hCtx.stroke();
    }

    const albedoTex = new THREE.CanvasTexture(albedo);
    const normalTex = new THREE.CanvasTexture(this.heightToNormal(height, 0.5));
    const roughnessTex = new THREE.CanvasTexture(roughness);

    [albedoTex, normalTex, roughnessTex].forEach(t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    });

    return { map: albedoTex, normalMap: normalTex, roughnessMap: roughnessTex };
  }

  static createFabric(color = '#c0392b', size = 256) {
    const albedo = document.createElement('canvas');
    const roughness = document.createElement('canvas');
    [albedo, roughness].forEach(c => { c.width = size; c.height = size; });

    const aCtx = albedo.getContext('2d')!;
    const rCtx = roughness.getContext('2d')!;

    aCtx.fillStyle = color;
    aCtx.fillRect(0, 0, size, size);
    rCtx.fillStyle = '#999999'; // Rough fabric

    // Weave pattern
    for (let i = 0; i < size; i += 3) {
      aCtx.strokeStyle = 'rgba(0,0,0,0.15)';
      aCtx.beginPath(); aCtx.moveTo(i, 0); aCtx.lineTo(i, size); aCtx.stroke();
      aCtx.beginPath(); aCtx.moveTo(0, i); aCtx.lineTo(size, i); aCtx.stroke();

      aCtx.strokeStyle = 'rgba(255,255,255,0.05)';
      aCtx.beginPath(); aCtx.moveTo(i+1, 0); aCtx.lineTo(i+1, size); aCtx.stroke();
    }

    const albedoTex = new THREE.CanvasTexture(albedo);
    const roughnessTex = new THREE.CanvasTexture(roughness);

    [albedoTex, roughnessTex].forEach(t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
    });

    return { map: albedoTex, roughnessMap: roughnessTex };
  }
}
