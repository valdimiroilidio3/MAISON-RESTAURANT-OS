/**
 * Who is standing there.
 *
 * The old figure picked a palette from three arrays (`SKIN[i]`, `HAIR[i]`,
 * `SHIRT[i]`) and gave everyone the same body, the same hair cap and the same
 * shirt. That is a doll with swatches: the mandate explicitly rules it out.
 *
 * An `Appearance` here is an identity — stature and build, an age band, a face
 * with its own proportions, a hairstyle with its own *geometry* (short, cropped,
 * shoulder-length, bob, bun, bald, receding), optional facial hair, and clothing
 * that is a different garment and not a different colour: tee, polo, blouse,
 * shirt, knit, blazer over tee. Staff get their own uniform grammar, derived from
 * the role, with a small per-person variation inside it.
 *
 * Pure data, deterministic from a seed, no three.js. The mesh builder reads it.
 */

import type { Build, Proportions } from "./anatomy";
import { proportionsFor } from "./anatomy";

export type HairStyle =
  | "bald"
  | "cropped"
  | "short"
  | "receding"
  | "side-part"
  | "shoulder"
  | "bob"
  | "bun"
  | "curls"
  | "ponytail";

export type FacialHair = "none" | "stubble" | "moustache" | "beard" | "goatee";

export type Garment = "tee" | "polo" | "shirt" | "blouse" | "knit" | "blazer";

export type StaffRole = "host" | "waiter" | "runner" | "chef" | "manager";

/** Skin: base albedo, subsurface tint, roughness. Never a flat plastic tone. */
export interface SkinTone {
  name: string;
  base: string;
  /** Slightly redder tone used on ears, nose, knuckles and to fake SSS. */
  warm: string;
  roughness: number;
  /** Depth of the shader-side subsurface fudge, 0..1. */
  subsurface: number;
}

export const SKIN_TONES: SkinTone[] = [
  { name: "porcelain", base: "#e8c4ae", warm: "#d98d7d", roughness: 0.62, subsurface: 0.55 },
  { name: "ivory", base: "#e0b596", warm: "#cf8b74", roughness: 0.6, subsurface: 0.5 },
  { name: "honey", base: "#cf9d72", warm: "#bb7a58", roughness: 0.58, subsurface: 0.45 },
  { name: "amber", base: "#b07c4f", warm: "#9a6238", roughness: 0.55, subsurface: 0.4 },
  { name: "chestnut", base: "#8d5a37", warm: "#76432a", roughness: 0.52, subsurface: 0.35 },
  { name: "umber", base: "#6b4026", warm: "#55301c", roughness: 0.5, subsurface: 0.3 },
  { name: "ebony", base: "#4a2a19", warm: "#3a2013", roughness: 0.47, subsurface: 0.26 },
  { name: "olive", base: "#c39272", warm: "#a87550", roughness: 0.6, subsurface: 0.46 },
];

export const HAIR_COLOURS = [
  "#1b1512", // near-black
  "#2c211a", // dark brown
  "#43301f", // brown
  "#6b4a2b", // chestnut
  "#8f6a3c", // light brown
  "#b98c53", // dark blonde
  "#d9b878", // blonde
  "#8a8378", // greying
  "#c3bdb2", // grey
  "#e3ded4", // white
  "#7a3b22", // auburn
] as const;

export interface Outfit {
  garment: Garment;
  /** Main body colour. */
  colour: string;
  /** Trousers / skirt colour. */
  lower: string;
  /** Shoes. */
  shoes: string;
  /** Collar/placket/buttons trim, or null for a plain tee. */
  trim: string | null;
  /** Long sleeves (staff, knitwear) vs short (tee, polo). */
  longSleeves: boolean;
  /** Tailored jacket worn open over the garment. */
  jacket: { colour: string; lining: string } | null;
  /** Staff only: apron or waistcoat. */
  workwear: "none" | "apron" | "waistcoat";
}

export interface Appearance {
  seed: number;
  build: Build;
  height: number;
  proportions: Proportions;
  /** Age band drives hair colour sanity, skin roughness and posture. */
  age: "young" | "adult" | "senior";
  skin: SkinTone;
  hair: { style: HairStyle; colour: string; roughness: number };
  facialHair: FacialHair;
  /** Brow darkness relative to hair; eyebrows read even at 4 m. */
  brow: string;
  /** Head shape variation: jaw width and face length multipliers. */
  face: { jaw: number; length: number; cheek: number };
  outfit: Outfit;
  accessories: { glasses: "none" | "metal" | "dark"; watch: boolean; earrings: boolean; bag: boolean };
  /** Staff identity; null for guests. */
  staff: { role: StaffRole; name: string } | null;
}

/* ------------------------------------------------------------------ *
 * Deterministic randomness
 * ------------------------------------------------------------------ */

/**
 * Small, fast, reproducible PRNG. Same seed → same person, forever.
 *
 * splitmix32, not xorshift: with adjacent seeds (500, 513, 526 …) a plain
 * xorshift's first output is strongly correlated, which gave every waiter the
 * same height. Each seed is avalanched before the first draw, so neighbouring
 * seeds produce unrelated people.
 */
export function rng(seed: number) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return ((z ^ (z >>> 15)) >>> 0) / 4294967296;
  };
  // One draw to avalanche the state before it is used.
  next();
  return next;
}

const pick = <T,>(r: () => number, list: readonly T[]): T => list[Math.floor(r() * list.length) % list.length];
const between = (r: () => number, a: number, b: number) => a + r() * (b - a);

/* ------------------------------------------------------------------ *
 * Guests
 * ------------------------------------------------------------------ */

const TEE_COLOURS = ["#f1ece2", "#20242a", "#5c6b57", "#8d8577", "#b8a998", "#3d4d63", "#6d3f3a", "#cfc6b6"] as const;
const SHIRT_COLOURS = ["#e9e3d7", "#a9b6c4", "#5d6b7a", "#3a4048", "#c9b79c", "#7d8a72"] as const;
const POLO_COLOURS = ["#26364f", "#5b2f33", "#2f4438", "#c8c0ae", "#3a3a3c"] as const;
const BLAZER_COLOURS = ["#2b2a27", "#3d3a34", "#5a4f43", "#e4dbc9", "#41484f", "#6c5f4c"] as const;
const KNIT_COLOURS = ["#b9a184", "#7a6a58", "#4f5a55", "#d5cbb8", "#7c4a3d", "#38424a"] as const;
const TROUSER_COLOURS = ["#2b2a27", "#3c3a35", "#4a4338", "#26303a", "#6b6355", "#1f2429", "#8a8274"] as const;
const SHOE_COLOURS = ["#1c1a17", "#3a2a1e", "#4a3a2c", "#2a2e33", "#6b5642", "#d8d2c6"] as const;

const GUEST_GARMENTS: Garment[] = ["tee", "polo", "shirt", "blouse", "knit", "blazer", "shirt", "tee", "knit"];

function guestOutfit(r: () => number): Outfit {
  const garment = pick(r, GUEST_GARMENTS);
  const colour =
    garment === "tee"
      ? pick(r, TEE_COLOURS)
      : garment === "shirt"
        ? pick(r, SHIRT_COLOURS)
        : garment === "polo"
          ? pick(r, POLO_COLOURS)
          : garment === "blazer"
            ? pick(r, TEE_COLOURS)
            : garment === "knit"
              ? pick(r, KNIT_COLOURS)
              : pick(r, SHIRT_COLOURS);

  return {
    garment,
    colour,
    lower: pick(r, TROUSER_COLOURS),
    shoes: pick(r, SHOE_COLOURS),
    trim: garment === "tee" || garment === "knit" ? null : pick(r, ["#e9e3d7", "#20242a", "#b08d5c"]),
    longSleeves: garment === "shirt" || garment === "blouse" || garment === "knit" || garment === "blazer",
    jacket:
      garment === "blazer"
        ? { colour: pick(r, BLAZER_COLOURS), lining: "#e6dfd2" }
        : r() < 0.12
          ? { colour: pick(r, BLAZER_COLOURS), lining: "#e6dfd2" }
          : null,
    workwear: "none",
  };
}

const HAIR_BY_AGE: Record<Appearance["age"], readonly HairStyle[]> = {
  young: ["short", "side-part", "shoulder", "bob", "bun", "curls", "ponytail", "cropped", "short", "shoulder"],
  adult: ["short", "side-part", "shoulder", "bob", "bun", "curls", "cropped", "receding", "short", "bob"],
  senior: ["cropped", "receding", "short", "bob", "bald", "shoulder", "bald"],
};

function hairColourFor(r: () => number, age: Appearance["age"]): string {
  if (age === "senior") return pick(r, ["#8a8378", "#c3bdb2", "#e3ded4", "#8a8378", "#6b4a2b"]);
  if (age === "young") return pick(r, HAIR_COLOURS.slice(0, 8));
  return pick(r, HAIR_COLOURS);
}

/**
 * A guest. `index` only salts the seed so the cast is reproducible; the person
 * is decided by the seed, not by their position in the list.
 */
export function guestAppearance(seed: number): Appearance {
  const r = rng(seed);
  const height = between(r, 1.56, 1.89);
  const builds: Build[] = ["average", "slim", "average", "broad", "average", "slim"];
  const build = pick(r, builds);
  const proportions = proportionsFor(height, build);
  const age: Appearance["age"] = r() < 0.18 ? "young" : r() < 0.82 ? "adult" : "senior";
  const skin = pick(r, SKIN_TONES);
  const style = age === "senior" && r() < 0.3 ? "bald" : pick(r, HAIR_BY_AGE[age]);
  const hairColour = hairColourFor(r, age);
  const outfit = guestOutfit(r);

  return {
    seed,
    build,
    height,
    proportions,
    age,
    skin,
    hair: {
      style,
      colour: hairColour,
      roughness: 0.55 + r() * 0.3,
    },
    facialHair:
      style === "bob" || style === "ponytail" || (style === "shoulder" && r() < 0.7)
        ? "none"
        : pick(r, ["none", "none", "none", "stubble", "beard", "moustache", "goatee"]),
    brow: hairColour,
    face: {
      jaw: between(r, 0.9, 1.12),
      length: between(r, 0.96, 1.06),
      cheek: between(r, 0.94, 1.08),
    },
    outfit,
    accessories: {
      glasses: r() < 0.22 ? (r() < 0.55 ? "dark" : "metal") : "none",
      watch: r() < 0.35,
      earrings: r() < 0.2,
      bag: r() < 0.18,
    },
    staff: null,
  };
}

/* ------------------------------------------------------------------ *
 * Staff
 * ------------------------------------------------------------------ *
 * The groom reference is an *elegance* brief, not a costume to copy: fitted
 * charcoal jacket, light shirt, narrow lapel, polished brown derby. Staff wear
 * their own uniform grammar so a diner never has to guess who works here.
 */

/** Uniform specification per role. Not a palette swap — different garments. */
export interface UniformSpec {
  jacket: string;
  shirt: string;
  trouser: string;
  shoe: string;
  accent: string;
  apron: string;
  /** Trim colour on collar band / placket. */
  piping: string;
}

export const UNIFORMS: Record<StaffRole, UniformSpec> = {
  manager: {
    jacket: "#242220",
    shirt: "#efe8db",
    trouser: "#1d1c1a",
    shoe: "#3b2b1f",
    accent: "#c6a66b",
    apron: "#242220",
    piping: "#c6a66b",
  },
  host: {
    jacket: "#2e2b27",
    shirt: "#e9e2d4",
    trouser: "#242220",
    shoe: "#2a2420",
    accent: "#c6a66b",
    apron: "#2e2b27",
    piping: "#c6a66b",
  },
  waiter: {
    jacket: "#232120",
    shirt: "#e6dfd1",
    trouser: "#1b1a18",
    shoe: "#4a3524",
    accent: "#b9a37a",
    apron: "#c9beac",
    piping: "#8d8474",
  },
  runner: {
    jacket: "#2b2f31",
    shirt: "#dfd8ca",
    trouser: "#22262a",
    shoe: "#2f2a25",
    accent: "#a8b0a4",
    apron: "#2b2f31",
    piping: "#8b928c",
  },
  chef: {
    jacket: "#efebe2",
    shirt: "#efebe2",
    trouser: "#2a2c2d",
    shoe: "#1d1c1a",
    accent: "#d8d2c4",
    apron: "#efebe2",
    piping: "#c9c2b4",
  },
};

export function staffAppearance(role: StaffRole, seed: number): Appearance {
  const r = rng(seed);
  const u = UNIFORMS[role];
  const height = between(r, 1.60, 1.86);
  const build = pick<Build>(r, ["average", "slim", "average", "broad"]);
  const proportions = proportionsFor(height, build);
  const skin = pick(r, SKIN_TONES);
  const style = pick(r, role === "chef" ? (["cropped", "short", "bun", "bald"] as HairStyle[]) : (["short", "side-part", "cropped", "bun", "receding", "bob"] as HairStyle[]));

  return {
    seed,
    build,
    height,
    proportions,
    age: r() < 0.22 ? "young" : "adult",
    skin,
    hair: { style, colour: pick(r, HAIR_COLOURS.slice(0, 9)), roughness: 0.6 },
    facialHair: pick(r, ["none", "none", "stubble", "none", "beard"]),
    brow: pick(r, HAIR_COLOURS.slice(0, 5)),
    face: { jaw: between(r, 0.94, 1.1), length: between(r, 0.97, 1.05), cheek: between(r, 0.96, 1.06) },
    outfit: {
      garment: role === "chef" ? "shirt" : "shirt",
      colour: u.shirt,
      lower: u.trouser,
      shoes: u.shoe,
      trim: u.piping,
      longSleeves: true,
      jacket: role === "chef" ? null : { colour: u.jacket, lining: u.piping },
      workwear: role === "waiter" || role === "runner" ? "apron" : role === "chef" ? "apron" : "none",
    },
    accessories: { glasses: "none", watch: r() < 0.4, earrings: false, bag: false },
    staff: { role, name: "" },
  };
}

/**
 * The one entry point the scene calls: guests get a guest identity, staff get
 * their role's uniform. Kept in one place so the two can never drift apart.
 */
export function appearanceFor(kind: string, seed: number): Appearance {
  if (kind === "guest") return guestAppearance(seed);
  if (kind === "host" || kind === "waiter" || kind === "runner" || kind === "chef" || kind === "manager") {
    return staffAppearance(kind, seed);
  }
  return guestAppearance(seed);
}
