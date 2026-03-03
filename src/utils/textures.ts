import * as THREE from 'three';

/**
 * PROCEDURAL TEXTURE GENERATOR
 * Creates stylized, high-quality textures using HTML Canvas.
 * Optimized for performance and "Pro" aesthetic.
 */

export class TextureGenerator {
  static createCobblestone(size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base stone color
    ctx.fillStyle = '#444444';
    ctx.fillRect(0, 0, size, size);

    // Draw stones
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 20 + Math.random() * 40;

      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, '#555555');
      grad.addColorStop(1, '#333333');

      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.roundRect(x - r, y - r, r * 2, r * 2, 8);
      ctx.fill();

      // Highlight/Rim
      ctx.strokeStyle = '#666666';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // Add noise/grit
    for (let i = 0; i < 5000; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const alpha = Math.random() * 0.1;
      ctx.fillStyle = `rgba(0,0,0,${alpha})`;
      ctx.fillRect(x, y, 2, 2);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  static createStylizedGrass(size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Base dark green
    ctx.fillStyle = '#1b3a1b';
    ctx.fillRect(0, 0, size, size);

    // Draw grass tufts
    for (let i = 0; i < 200; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;

      ctx.fillStyle = Math.random() > 0.5 ? '#2d5a27' : '#224a1f';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 5, y - 15);
      ctx.lineTo(x + 10, y);
      ctx.fill();
    }

    // Add "moss" patches
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 40 + Math.random() * 60;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, 'rgba(46, 125, 50, 0.4)');
      grad.addColorStop(1, 'rgba(46, 125, 50, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  static createWoodGrain(color1 = '#5d4037', color2 = '#3e2723', size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = color1;
    ctx.fillRect(0, 0, size, size);

    // Draw wood lines
    ctx.strokeStyle = color2;
    ctx.lineWidth = 4;
    for (let i = 0; i < size; i += 8) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      for (let x = 0; x < size; x += 20) {
        ctx.lineTo(x, i + Math.sin(x * 0.05 + i) * 5);
      }
      ctx.stroke();
    }

    // Knots
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.beginPath();
      ctx.ellipse(x, y, 10, 20, Math.random(), 0, Math.PI * 2);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  static createFabric(color = '#c0392b', size = 256) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);

    // Weave pattern
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < size; i += 4) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, size);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(size, i);
      ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }
}
