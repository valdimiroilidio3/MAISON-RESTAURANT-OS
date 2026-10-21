"use client";

import * as THREE from "three";

/** Procedural canvas textures — no remote assets, no licensing dependencies. */
export function createFloorTexture(kind: "stone" | "wood" | "bar"): THREE.Texture {
  // The scene only ever runs in the browser; this keeps server rendering and node
  // based tests from crashing when the module is imported without a DOM.
  if (typeof document === "undefined") {
    return new THREE.Texture();
  }
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);

  if (kind === "wood") {
    ctx.fillStyle = "#3a2c1e";
    ctx.fillRect(0, 0, size, size);
    const plank = 42;
    for (let y = 0; y < size; y += plank) {
      const tone = 30 + Math.floor(Math.random() * 16);
      ctx.fillStyle = `rgb(${tone + 24},${tone + 10},${tone - 4})`;
      ctx.fillRect(0, y + 1, size, plank - 2);
      ctx.strokeStyle = "rgba(12,9,6,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      for (let i = 0; i < 26; i++) {
        ctx.strokeStyle = `rgba(20,14,9,${0.05 + Math.random() * 0.08})`;
        ctx.lineWidth = 0.6 + Math.random();
        const gy = y + 4 + Math.random() * (plank - 8);
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(size * 0.3, gy + 2, size * 0.6, gy - 2, size, gy + 1);
        ctx.stroke();
      }
    }
  } else if (kind === "bar") {
    ctx.fillStyle = "#1d1915";
    ctx.fillRect(0, 0, size, size);
    const tile = 128;
    for (let x = 0; x < size; x += tile) {
      for (let y = 0; y < size; y += tile) {
        const shade = 24 + Math.floor(Math.random() * 10);
        ctx.fillStyle = `rgb(${shade + 4},${shade + 2},${shade})`;
        ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.strokeRect(x + 2, y + 2, tile - 4, tile - 4);
      }
    }
  } else {
    ctx.fillStyle = "#2a251d";
    ctx.fillRect(0, 0, size, size);
    const tile = 170;
    for (let x = 0; x < size; x += tile) {
      for (let y = 0; y < size; y += tile) {
        const shade = 38 + Math.floor(Math.random() * 8);
        ctx.fillStyle = `rgb(${shade},${shade - 4},${shade - 10})`;
        ctx.fillRect(x + 1.5, y + 1.5, tile - 3, tile - 3);
      }
    }
    ctx.strokeStyle = "rgba(10,9,8,0.55)";
    ctx.lineWidth = 3;
    for (let x = 0; x <= size; x += tile) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, size);
      ctx.stroke();
    }
    for (let y = 0; y <= size; y += tile) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
  }

  // shared grain
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = `rgba(255,240,220,${Math.random() * 0.025})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1.4, 1.4);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export const SKIN_TONES = ["#d3a17c", "#b9815c", "#8d5a3b", "#e5b491", "#6f432c", "#c08d68"] as const;
export const HAIR_TONES = ["#171310", "#2c2118", "#4a3423", "#6b4b2c", "#8a8078", "#1c1a18"] as const;
export const SHIRT_TONES = ["#2b2721", "#3a3128", "#454f4c", "#5a3a34", "#2e3a45", "#6c6154", "#403a4a"] as const;
export const STAFF_TONES = ["#16130f", "#221d18"] as const;
