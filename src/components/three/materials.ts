"use client";

import * as THREE from "three";

/**
 * Procedural textures — no remote assets, no licensing dependencies.
 *
 * They are generated from a seeded RNG: the same page load always produces the
 * same grain, so a screenshot can be compared with the next one and a visual
 * regression is a real difference rather than a new random seed.
 */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function texture(canvas: HTMLCanvasElement, repeat: number) {
  const result = new THREE.CanvasTexture(canvas);
  result.wrapS = THREE.RepeatWrapping;
  result.wrapT = THREE.RepeatWrapping;
  result.colorSpace = THREE.SRGBColorSpace;
  result.anisotropy = 8;
  result.repeat.set(repeat, repeat);
  return result;
}

/**
 * Floors are light limestone and warm oak: a restaurant reads by its floor,
 * and a dark floor swallows every shadow the sun casts on it.
 */
export function createFloorTexture(kind: "stone" | "wood" | "bar"): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return new THREE.CanvasTexture(canvas);
  const random = seeded(kind === "wood" ? 7717 : kind === "bar" ? 3313 : 5107);

  if (kind === "wood") {
    ctx.fillStyle = "#8d6c47";
    ctx.fillRect(0, 0, size, size);
    const plank = 42;
    for (let y = 0; y < size; y += plank) {
      const tone = 138 + Math.floor(random() * 22);
      ctx.fillStyle = `rgb(${tone + 18},${tone - 4},${tone - 42})`;
      ctx.fillRect(0, y + 1, size, plank - 2);
      ctx.strokeStyle = "rgba(52,36,22,0.45)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
      for (let i = 0; i < 18; i++) {
        ctx.strokeStyle = `rgba(70,48,28,${0.05 + random() * 0.07})`;
        ctx.lineWidth = 0.6 + random();
        const gy = y + 4 + random() * (plank - 8);
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(size * 0.3, gy + 2, size * 0.6, gy - 2, size, gy + 1);
        ctx.stroke();
      }
    }
  } else if (kind === "bar") {
    ctx.fillStyle = "#8b8175";
    ctx.fillRect(0, 0, size, size);
    const tile = 128;
    for (let x = 0; x < size; x += tile) {
      for (let y = 0; y < size; y += tile) {
        const shade = 128 + Math.floor(random() * 16);
        ctx.fillStyle = `rgb(${shade + 6},${shade + 2},${shade - 8})`;
        ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
        ctx.strokeStyle = "rgba(60,54,46,0.35)";
        ctx.strokeRect(x + 2, y + 2, tile - 4, tile - 4);
      }
    }
  } else {
    ctx.fillStyle = "#b3a894";
    ctx.fillRect(0, 0, size, size);
    // 1.4 m limestone flags, laid in a running bond
    const tile = 256;
    const rowHeight = 170;
    for (let row = 0; row * rowHeight < size; row++) {
      const offset = row % 2 === 0 ? 0 : -tile / 2;
      for (let x = offset; x < size; x += tile) {
        const shade = 176 + Math.floor(random() * 14);
        ctx.fillStyle = `rgb(${shade + 6},${shade},${shade - 14})`;
        ctx.fillRect(x + 2, row * rowHeight + 2, tile - 4, rowHeight - 4);
      }
    }
    ctx.strokeStyle = "rgba(96,88,76,0.35)";
    ctx.lineWidth = 2;
    for (let y = 0; y <= size; y += rowHeight) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y);
      ctx.stroke();
    }
  }

  // shared grain: fine, low-contrast speckle
  for (let i = 0; i < 2600; i++) {
    const light = random() > 0.5;
    ctx.fillStyle = light ? `rgba(255,248,236,${random() * 0.05})` : `rgba(40,32,24,${random() * 0.045})`;
    ctx.fillRect(random() * size, random() * size, 1.6, 1.6);
  }

  return texture(canvas, 1);
}

export const SKIN_TONES = ["#d3a17c", "#b9815c", "#8d5a3b", "#e5b491", "#6f432c", "#c08d68"] as const;
export const HAIR_TONES = ["#171310", "#2c2118", "#4a3423", "#6b4b2c", "#8a8078", "#1c1a18"] as const;
export const SHIRT_TONES = ["#2b2721", "#3a3128", "#454f4c", "#5a3a34", "#2e3a45", "#6c6154", "#403a4a"] as const;
export const STAFF_TONES = ["#16130f", "#221d18"] as const;

/**
 * Sky gradient as vertex colours on a sphere. No canvas, no texture upload, no
 * environment-dependent 2D context: a gradient that is guaranteed to appear in
 * every browser, headless renderer and screenshot.
 */
export const SKY_PALETTES = {
  // The below-horizon band is the fog colour, not the tarmac: the ground has
  // already dissolved into haze by the time the eye reaches the sphere, so the
  // horizon is a line of colour, not a seam between two materials.
  day: { zenith: "#7f9dba", horizon: "#efe4cd", ground: "#efe4cd" },
  night: { zenith: "#050810", horizon: "#1a2130", ground: "#08090c" },
} as const;

export function createSkyGeometry(radius: number, palette: { zenith: string; horizon: string; ground: string }) {
  const geometry = new THREE.SphereGeometry(radius, 32, 24);
  const position = geometry.attributes.position;
  const zenith = new THREE.Color(palette.zenith);
  const horizon = new THREE.Color(palette.horizon);
  const ground = new THREE.Color(palette.ground);
  const colours = new Float32Array(position.count * 3);
  const colour = new THREE.Color();
  for (let index = 0; index < position.count; index++) {
    const height = position.getY(index) / radius;
    if (height >= 0) {
      // smooth ramp from horizon to zenith, so the band around eye level stays warm
      colour.copy(horizon).lerp(zenith, Math.pow(Math.min(1, height * 1.35), 0.7));
    } else {
      colour.copy(horizon).lerp(ground, Math.min(1, Math.abs(height) * 3.2));
    }
    colours[index * 3] = colour.r;
    colours[index * 3 + 1] = colour.g;
    colours[index * 3 + 2] = colour.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
  return geometry;
}

let sharedBlob: THREE.Texture | null = null;

/**
 * One contact-shadow texture for the whole scene. Twenty identical 128×128
 * canvases are twenty GPU uploads for a single image.
 */
export function blobTexture(): THREE.Texture {
  if (!sharedBlob) sharedBlob = createBlobTexture();
  return sharedBlob;
}

/** Soft radial blob used for contact shadows under furniture and people. */
export function createBlobTexture(): THREE.Texture {
  if (typeof document === "undefined") return new THREE.Texture();
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, "rgba(0,0,0,0.55)");
    gradient.addColorStop(0.5, "rgba(0,0,0,0.22)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const labelCache = new Map<string, THREE.Texture>();

/**
 * A table-number plaque baked into a texture. Twenty tiny canvases cost far
 * less than twenty DOM overlays, and the numbers stay glued to the tabletop
 * from every angle.
 */
export function tableLabelTexture(code: string, options: { tone?: "light" | "dark" } = {}): THREE.Texture {
  const key = `${code}:${options.tone ?? "light"}`;
  const cached = labelCache.get(key);
  if (cached) return cached;
  if (typeof document === "undefined") return new THREE.Texture();
  const width = 96;
  const height = 48;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = options.tone === "dark" ? "rgba(20,16,12,0.72)" : "rgba(246,242,234,0.9)";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = options.tone === "dark" ? "rgba(198,166,107,0.7)" : "rgba(58,44,30,0.45)";
    ctx.lineWidth = 2;
    ctx.strokeRect(3, 3, width - 6, height - 6);
    ctx.fillStyle = options.tone === "dark" ? "#f6f2ea" : "#2a2018";
    ctx.font = "600 26px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "2px";
    ctx.fillText(code, width / 2, height / 2 + 1);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  labelCache.set(key, texture);
  return texture;
}
