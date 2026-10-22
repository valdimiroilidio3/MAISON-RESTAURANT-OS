# MAISON® — 3D spatial audit

**Scope.** The two Three.js experiences in this product: the public/operations floor explorer
(`/salon`, `/admin/sala`) and the live service simulation (`/ao-vivo`, `/admin/simulacao`).
Audited on branch `arena/84833940-maison-restaurant-os`, 2026-10-22.

**Method.** Source audit of every scene module + real rendered inspection in headless Chromium
(141.0.7390.0, ANGLE/SwiftShader WebGL2). Screenshots were taken of: closed service, lunch service at
360×, two orbit positions, both at 1440×900. Draw calls/geometry were measured through a runtime
probe (`window.__maison3d`, added by this work), not estimated. Frame rate on SwiftShader is
CPU-rasterised and is **not** representative of GPU performance; draw calls and triangle counts are.

---

## 1. What the project is

A restaurant operating system ("Restaurant OS") with a cinematic public site and an operations
back-office. The 3D is **not** an architectural visualisation and not a game: it is an operational
map of a real 20-table floor plan (esplanada / sala / balcão), used to (a) communicate the room on
the public site, (b) select tables and open orders in operations, and (c) show a living service
simulation. Accuracy of table placement matters because the same coordinates drive the 2D plan, the
order flow and the navigation grid used by simulated waiters and guests.

Engine: React Three Fiber 9 + three 0.186 + drei 10, Next 16, TypeScript. No imported models or
textures: everything is procedural geometry and canvas-generated textures. Lighting is a fixed
budget (ambient/hemisphere/sun + a handful of practicals); shadows are on for the high tier.

## 2. How the scene is built today (before this work)

```
tables (SQLite: pos_x, pos_z, rotation, seats, shape)
  └─ src/components/three/Room.tsx ......... RoomShell (floors, 2 glass walls, back wall,
                                             beams, city billboard, terrace, pergola)
                                             + Chairs (instanced) + DiningTable (per table,
                                               ring + furniture + place settings + <Html>)
                                             + Diners (People.tsx humans)
  └─ src/components/three/sim/SimulationScene.tsx ... a SECOND shell (different wall segments,
                                             different openings, different sky planes)
                                             + its own table geometry + Actor.tsx humans
  └─ src/lib/simulation/path.ts ............ a THIRD definition: ROOM bounds + FIXED_OBSTACLES
                                             (stale planter coordinates) + LANDMARKS
  └─ src/components/dining/FloorPlan2D.tsx . a FOURTH: hardcoded room outline (-4.8,-7.8,14.4,16.6)
```

Four independent descriptions of one room. That is the root cause of most defects below.

## 3. Defects

Severity: **CRITICAL** = the environment is spatially wrong or unusable; **HIGH** = wrong scale,
blocked circulation, broken composition; **MEDIUM** = alignment, ambiguity, performance;
**LOW** = polish.

| # | Sev | Defect (evidence) | Root cause |
|---|-----|-------------------|------------|
| D1 | CRITICAL | **Two different rooms.** Explorer: west glass wall opening z 0.8–2.4. Simulation: opening z 0.6–2.8. Simulation nav grid originally only covered x ≥ −4.8, so all 10 terrace seats were "outside the room" and guests walked through the glass wall to reach them (fixed earlier in this session by extending `ROOM`). | Duplicated constants, no single spatial source. |
| D2 | CRITICAL | **Sky/environment built from flat billboards.** A 26×12 m pale plane floats at x = −16.5 and is clearly visible from normal orbit angles (screenshot `a-orbit-a/b`); the explorer has a 44×22 m "city backdrop" at x = 18 plus 90 window quads. Orbiting reveals their edges and they read as walls. | Environment faked with cards instead of a closed background + fog; no camera constraints. |
| D3 | CRITICAL | **The dining room has no south wall and no entrance.** The interior is enclosed on three sides only; the public screenshot shows the room open toward the camera with a floating door frame in the simulation scene. | Shell grew feature-by-feature; no audit of enclosure. |
| D4 | HIGH | **All 20 table labels are always on.** At the default framing they overlap each other and cover plates and guests (screenshots `a-service`, `salon`). They are DOM portals updated every 220 ms. | Label policy defaulted to "always". |
| D5 | HIGH | **Parasols intersect tables and chairs.** Poles stand at (−8.0,−5.4), (−8.0,−2.4), (−8.0,1.2), (−8.4,4.4); canopies (Ø 2.9 m) cut through the tabletops of T01/T02/T03/T04 and their chairs. No validation existed. | Decorative placement not derived from table positions. |
| D6 | HIGH | **Two incompatible lighting rigs and exposures.** Explorer: sun (9,15,9) + 2 chandelier points + spot. Live: sun (13,17,9) + 4 practicals + sky-tinted fill, `toneMappingExposure 1.02`. At 12:48 the terrace is bright, the interior reads as night, and the back wall clips to white in daylight. | Lighting logic duplicated per scene, tuned per screenshot. |
| D7 | MEDIUM | **Camera has no discipline.** No polar/target clamps in the live scene (can view from under the floor), default framing crops T18/T19 at 1440×900, focus moves in a straight line through walls, no reset. | Controls configured ad hoc. |
| D8 | MEDIUM | **No clearance rules.** Nothing verifies that chairs stay inside the floor, that the 1.6 m terrace door stays clear, or that aisles are serviceable. The nav grid only checks that *a* path exists, not that it is wide enough. | Validation never implemented. |
| D9 | MEDIUM | **Selection ambiguity.** Explorer hit areas are 1.6 m planes above each table; at 2.6 m table spacing they overlap, and the nearest surface wins arbitrarily. The live scene has no table picking at all (only the DOM list). | Hit area not derived from footprint. |
| D10 | MEDIUM | **Draw-call budget.** Live scene renders every chair, leg, plate, cutlery piece and glass as separate meshes (≈3 500–4 500 draw calls with a full cast), while the explorer instances chairs. Explorer uses one `<Html>` per table plus per-table materials. | Two renderers, no shared instancing layer. |
| D11 | LOW | **Coplanar surfaces:** interior floor y=0, terrace −0.02, bar inset +0.004, entrance mat +0.006, AO decal +0.005, thresholds absent. Z-fighting risk at grazing angles. | Incremental additions. |
| D12 | MEDIUM | **Two human systems.** Explorer guests (`People.tsx`, simple capsules) vs simulation guests (`Actor.tsx`, articulated, hands/face/clothing). The same restaurant is populated by visibly different people depending on the page. | Parallel development. |
| D13 | LOW | **The 2D plan draws the room outline with stale numbers** (−4.8,−7.8,14.4×16.6): it omits the terrace while showing terrace tables. | Fourth copy of the layout. |

## 4. Correction sequence

1. **Single spatial model** — `src/lib/scene/layout.ts`: bounds, floor levels, partitions and their
   openings, fixed fixtures, landmarks, parasol anchors, practical lights. Everything else imports it
   (3D shells, nav grid, 2D plan, validator, camera framing).
2. **Validation layer** — `src/lib/scene/spatial.ts` (generic geometry) + `validate.ts` (domain rules:
   containment, opening clearance, aisle width, reachability, parasol clearance) with severity,
   confirmation and suggested fix. Run it as a test against the seeded 20 tables.
3. **One world** — `components/three/world/*`: a single shell with south wall + entrance, real door
   openings, perimeter soffit and beams (no full ceiling, so the plan stays readable), threshold,
   terrace railing/pergola, bar, pass, kitchen, plants, and a **closed environment dome** with
   gradient sky + fog (no billboards).
4. **One table renderer** — `TableSet.tsx`: instanced chairs/legs/settings, per-table status ring,
   footprint-based hit area, distance-aware label policy.
5. **One cast** — the articulated `Actor` becomes the only human system, used by both scenes.
6. **Presentation** — shared lighting model (`lighting.ts`) driving sun/lamp/exposure from `dayLight`;
   camera framing from bounds (`framing.ts`) with orbit clamps, focus transitions and reset.
7. **Interaction** — hover/select/focus on real footprints, inspector sync, keyboard escape/reset.
8. **Measurement** — runtime probe (`?debug3d=1`, `window.__maison3d`) reporting draw calls,
   triangles, actors and frame time; optimisation targets from measurements.
9. **Re-verify** — screenshots at day/night/close/top, tests, validator report.

Provisional dimensions: floor plates and furniture sizes are design decisions for this
demonstration, not surveyed measurements. They are treated as such and are centralised so they can
be replaced by real values in one place.

---

## 6. Stage C–F verification log (2026-10-22, second pass)

Every defect below was found **by running the scene**, not by reading code. Each entry records what
was seen, the root cause, and the fix that was applied and then re-captured.

| # | Sev | Observed defect (evidence) | Root cause | Correction |
|---|-----|----------------------------|------------|------------|
| D14 | CRITICAL | **Black sky in every capture.** `/tmp/shots/v2a-canvas.png`: room lit correctly, sky pure black, horizon absent. | `createSkyTexture()` built a `CanvasGradient` on a canvas that the capture renderer sampled as flat black. The mesh reported `visible: true, opacity: 1`, which is why metadata alone could not prove it. | Sky rebuilt as **two vertex-coloured `SphereGeometry` shells** (`SKY_PALETTES` + `createSkyGeometry`): opaque night shell at r152, day shell at r150 faded by `dayLight`. No canvas, no upload. Verified in `v3`–`v13`. |
| D15 | HIGH | **Ceiling open to the sky at guest level.** `v9-entrance-canvas.png` shows a white sky band where the roof should be, over a room with beams and chandeliers. | The shell deliberately had beams and a soffit but no ceiling, so the plan stayed readable from above. That trade-off was never made conditional on the camera. | `CutawayCeiling`: a real roof slab over `INTERIOR` whose opacity is a function of camera height (`smoothstep(y, 3.1, 4.6)`). Closed for guest-level views, gone for the establishing view. |
| D16 | HIGH | **Chandeliers and sconces existed but were never mounted.** `PRACTICALS.chandeliers` light sources were live, the fittings were not in the scene: the ceiling read as an empty slab with light coming from nowhere. | `Chandeliers`/`Sconces` components were exported but never composed into `<Fixtures>`. | Both mounted in `Fixtures`; verified in `v11` (two chandeliers over the sala, sconces on the bar wall). |
| D17 | HIGH | **WC vestibule was a black monolith.** In `v9`/`v10` a 2 m black box stands in the middle of the north wall. | Modelled as one `BackSide` box — correct from outside, opaque and unlit from a guest's eye line. | Rebuilt as three walls + floor + mirror + towel rail + bulb, so the niche is *interior architecture*, not a solid. |
| D18 | MEDIUM | **No table view existed that did not fight the camera.** `?mesa=T14` framed from 3.4 m: above the roof slab, and inside the orbit `minDistance` of 6 m, so `OrbitControls` clamped the eye out through the east glazing (`n2-t14-canvas.png`). | A constant close-up pose authored without checking the orbit envelope. | `focusOnTable` re-authored at 1.78 m / 4.2 m distance / 40°, and `CAMERA.orbit.minDistance` lowered to 2.6 m. A test now asserts every close-up stays inside the envelope and below the ceiling. |
| D19 | MEDIUM | **The establishing view was a magic number.** The default eye was hand-tuned to one canvas size; any other aspect cut the terrace. | No relationship between the room bounds and the camera. | `fitPose(box, aspect, …)` solves the minimum distance that contains all eight corners at a given margin; `FitCamera` re-fits on resize. `OVERVIEW` is now derived, and a test asserts containment at seven aspect ratios from 0.5 to 3.2. |
| D20 | MEDIUM | **The building floated on a black plane.** `v12`–`v14`: no ground texture, no street, no scale reference — the room read as a diorama on a table. | Only a flat dark disc, no paving, no exterior props. | Paved forecourt (same floor generator, tinted), kerb strip, four emissive street lamps, six instanced street trees, and the fog colour set to the sky's own horizon colour so the paving dissolves instead of ending. |
| D21 | LOW | **Two copies of the contact-shadow texture** (one per table + one per fixture), each 128×128 and uploaded separately. | `createBlobTexture()` called inside components. | `blobTexture()` memoises a single shared texture. |
| D22 | LOW | **Table numbers were unreadable dark rectangles.** The plaque was a solid plane with no text. | Placeholder geometry kept after the label system moved to DOM. | `tableLabelTexture()` draws the code onto a small canvas per table, tone-matched to cloth or wood. |

### Seating intelligence (product change)

The allocator's `ORDER BY seats` was a database answer to a spatial question: a party of two could be
sent to a six-top next to the pass while a two-top by the window stayed empty. It now scores every
fits-the-party table on five axes derived from the canonical geometry — **fit, ambience, view, access,
comfort** — filters out tables already committed to the slot, and returns the ranking with a
guest-facing reason. `?zone=` on the public reservation form is honoured as a preference (it outweighs
the soft axes but never forces an unfit table). Verified end-to-end against the running server:
`POST /api/reservations {"partySize":2,"zone":"esplanada"}` → `T20`, reason *"Na zona pedida (esplanada)"*;
party of 1 with `zone:"balcao"` → `T16`.

### New inspection instruments (reusable beyond this project)

- `window.__MAISON_SCENE__` gains **`inventory`**: every transparent/emissive mesh with its world
  position and size — the list used to find stray geometry, not just count it.
- `window.__MAISON_PICK__(x, y)`: a screen-space raycast that answers *"what is that object?"* for any
  pixel of a screenshot. It found the `wall-east` glazing in the way of the old table preset.
- `RenderProbe` still publishes real `gl.info` counters (`__MAISON_3D__`): draw calls, triangles,
  geometries, textures.

### Measured performance (SwiftShader, 1500×950, production build)

| Stage | Draw calls | Triangles | Geometries | Meshes | Textures |
|-------|-----------:|----------:|-----------:|-------:|---------:|
| Before the art pass (`v3`) | 723 | 59 426 | 495 | 556 | 26 |
| Instancing plates + bottles (`v4`) | 552 | 58 274 | 324 | 385 | — |
| Current (`n11`) | 685 | 71 120 | 449 | 510 | 28 |

The count rose from 552 to 685 because two ceilings, chandeliers, sconces, a WC vestibule, four
street lamps, six trees and seventeen table labels were added — but the *geometry* budget stayed
close (449 geometries for a materially richer room), and repeated objects (72 chairs, 144 plates,
34 bottles, 6 trees, 4 lamp posts) are instanced: 5 instanced meshes cover what would otherwise be
≈ 260 draw calls. SwiftShader FPS (1–3) is CPU rasterisation and is not app performance.

### Known limitations

- Every capture in this log was taken in **headless Chromium with ANGLE/SwiftShader** at 1500×950.
  GPU frame rate has not been measured in this environment and is not claimed.
- Camera presets are verified for containment at 0.5–3.2 aspect; the transition *animation* is
  verified visually but not asserted frame-by-frame.
- The room is a stylised representation; dimensions remain provisional (see the note at the end of
  §4) and no measurement here is a survey.
