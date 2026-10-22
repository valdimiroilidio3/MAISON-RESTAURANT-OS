# MAISON® — character system

**Scope.** Every human figure in the product: the live service simulation (`/ao-vivo`,
`/admin/simulacao`). The public floor explorer (`/salon`) contains no people by design — it is an
architectural map of tables, not a scene.

**Status.** Implemented and committed (`eb111b4`), verified in the running application with headless
Chromium. 34 tests, 201 in the suite, `tsc --noEmit` clean, `next build` green.

---

## 1. What was replaced

The previous actors were assembled from `SphereGeometry` and `CapsuleGeometry`: a ball for the head,
a ball for the shoulder, a cylinder for the torso, a cap for the hair. That construction is *why* the
figures read as toys — a sphere has no jaw, a capsule has no deltoid, and a cylinder has no waist.

| | before | after |
| --- | --- | --- |
| head | sphere + two discs for eyes | 14-section skull loft with jaw, brow ridge, cheekbones, nose bridge/tip/alae, ears, lips, lidded eyes |
| hair | a cap | ten styles with their own geometry (cropped, short, receding, side-part, shoulder, bob, bun, curls, ponytail, bald) |
| torso | cylinder | lofted ribcage → waist → pelvis with independent shoulder/chest/waist/hip widths |
| arms | capsule | one continuous loft: deltoid dome → bicep → elbow → forearm → wrist |
| hands | one box | palm + four fingers + thumb, mirrored per side |
| legs | capsule | thigh and shin lofts with knee tuck and calf swell |
| shoes | a cap | sole plate + upper with a toe box, measured for floor contact |
| clothing | colour swap | tee / polo / shirt / blouse / knit / blazer, plus jacket, waistcoat and apron shells |
| identity | `SKIN[i]`, `HAIR[i]`, `SHIRT[i]` | a seeded `Appearance`: stature, build, age band, face proportions, hairstyle geometry, facial hair, garment, shoes, accessories |

3325 lines across `src/lib/characters/` (11 modules) and `HumanCharacter.tsx`.

## 2. External models: evaluated, not integrated

The brief asked for licensed reference models (Cacupé; *Casual Confidence*; *Casual Portrait In A Navy
Polo*; *Elegant Groom in a Gray Suit*). **None could be obtained.** Every Sketchfab host (`sketchfab.com`,
`api.sketchfab.com`, `media.sketchfab.com`, `static.sketchfab.com`) returns `000` from this sandbox —
no DNS, no TLS, no download — so licence, geometry, skeleton, clips and scale could not be checked, and
a model whose licence I cannot read is a model I must not ship. The alternatives were audited instead:
the GitHub character packs available are low-poly with no licence metadata; `@pmndrs/assets` ships HDRIs
and primitives only, no rigged humans.

The consequence is stated plainly: **the figures are still procedural.** What changed is the fidelity
of that procedural work and the fact that it is now solved from anatomy rather than eyeballed.
`src/lib/characters/assets.ts` holds an empty, documented `CHARACTER_MANIFEST` and a resolver as the
seam for real GLB assets: when a licensed, rigged model is supplied, it is registered there and
`usingProceduralBodies` starts returning `false`. Nothing else in the scene has to change.

**No Sketchfab embed or iframe is used anywhere.** The figures are geometry in the scene graph.

## 3. Anatomy

One table, `RATIOS` in `anatomy.ts`, drives every measurement: eye 0.935 H, chin 0.87 H, shoulder
0.82 H, elbow 0.63 H, hip 0.53 H, crotch 0.47 H, knee 0.285 H, ankle 0.039 H. Stature ranges
1.52–1.92 m across five builds. Nothing downstream hard-codes a height or a hip level.

Sitting is solved, not keyed. On a 0.45 m chair the knee height is
`hip − thigh·cos θ`, and the shin must reach the floor, so:

```
sin δ = (footHeight + shin − hipHeight) / thigh
thigh angle = −π/2 − δ        // a tall guest's knees rise above the seat
shin angle  =  0              // shins vertical, feet under the knees
```

A guest too short for the chair gets `dangles: true` and their feet hang — which is what happens in a
real dining room — rather than a shoe pushed through the floor.

## 4. Animation

Ten joint groups per figure (`hips → spine → head`, `spine → shoulders → elbows`, `hips → thighs →
knees → ankles`). Poses are *targets*; each frame the joints are damped toward the target at a rate
that depends on the state, so a state change glides instead of popping and the walk cycle keeps its
phase across the change.

| engine pose | posture | clip family |
| --- | --- | --- |
| `walk` | standing, moving | `walkTargets` — contact/pass/up, opposed arm swing, knee flex on swing, ankle roll |
| `stand`, `idle` | standing | `idleTargets` — breathing, weight shift, head drift |
| `sit` | seated | `seatedIdleTargets "rest"` |
| `eat`, `drink` | seated | `seatedIdleTargets "cutlery" / "glass"` |
| `read` | seated / standing | `readTargets` (menu in hand) |
| `talk` | seated | `seatedIdleTargets "talk"` — conversational gesture |
| `pay` | seated | `payTargets` — terminal in hand |
| `carry` | standing | `carryTargets` — tray held level |
| `serve`, `clear` | standing | `serveTargets` / `clearTargets` — plate forward, torso inclined |
| `cook` | standing | `cookTargets` — bench work |

Every figure has its own `Rhythm` (breath rate, sway, phase) hashed from its seed with splitmix32, so
thirty diners do not breathe in unison. There is **no random joint noise anywhere**: all motion is a
function of time, phase and state.

The floor is a constraint, not a suggestion. `groundedHipHeight` projects the *measured* shoe bounding
box — not the ankle point — through the leg chain, so a sole corner cannot dip when the foot rolls:

```
hip = max over both legs of ( shoe.height·cos θ + reach·|sin θ| − ankleY )
```

Rising is instantaneous (clamped to the solve), settling is damped. This fixed a 14 mm sole
penetration that was visible at contact.

## 5. Space

- Seated guests sit on **their assigned chair**: the engine routes to `seat(table, seatIndex)` and the
  figure's hips land on the seat, knees under the tabletop, feet on the floor.
- Plate, glass and cutlery are parented to the actor **root** at table height, not to the hips, so
  they stay on the table when the guest sits (`TableTop`).
- Staff take a service side; the engine's route never crosses the table's geometric centre.
- Hips are never the table centre: the interaction points are seat, service spot, bar, kitchen pass.

## 6. State discipline

`state.ts` reads `SimActor` and returns an intent (`seated`, `moving`, `variant`). It never writes.
The animation layer cannot change a reservation, an order or a table state — asserted by test.

## 7. Performance

- Body geometry cached by a quantised signature (height to 2 cm + build + jaw + cheek), so thirty
  diners share a dozen copies of each part.
- **39–41 meshes per figure, down from 67** in the primitive version — 40 fewer draw calls per
  actor, ~1 000 fewer in a full dinner service. Everything is `merge`d per body part (five fingers
  cost one draw call, not five).
- **Triangles went up**, and this is the honest cost of the change: 11.0 k per guest, 11.9 k per
  waiter, against roughly 2–3 k for capsules. At 25 actors that is ~275 k triangles in the main and
  shadow passes. It renders, but the head and hands are the next places to decimate.
- Materials cached and shared across figures.
- LOD: face details hidden beyond 11 m, secondary details beyond 18 m, sampled 4×/s.
- Immersive-only: the whole layer is inside the simulation canvas; nothing loads on the public site.

## 8. Verification

**Automated** — `npx vitest run` 201 passed / 17 files; `tests/characters.test.ts` (26) covers
anthropometry, the seated solve, floor contact through a full walk cycle, diversity (heights, faces,
hair and garments must differ), staff identity, determinism, the state→intent map and geometry bounds;
`tests/human-character.test.tsx` (8) mounts the component in `@react-three/test-renderer` and asserts
the rig, the hip height standing vs seated, the walk phase, the seated angle, reduced motion, the
tabletop parenting and that a moving actor's legs actually swing (a regression test for a bug where
the pose reset every frame and the figure slid while standing still).

**In the real application** — headless Chromium 153 (the `@sparticuz/chromium` build, ANGLE/SwiftShader)
against `next start` on :3000:
`/ao-vivo` advanced to dinner service, orbit + zoom, captured at 1280×820 and 1600×1000. Confirmed in
the captures: guests seated on chairs at their tables with knees under the tabletop, staff in white
shirt + dark apron circulating, terrace guests seated, no page errors, canvas alive.

To reproduce a capture: `npm i --no-save @sparticuz/chromium puppeteer-core`, extract
`node_modules/@sparticuz/chromium/bin/al2023.tar.br` to `/tmp/al2023` and put `/tmp/al2023/lib` on
`LD_LIBRARY_PATH` (the package's Chromium needs the Amazon Linux 2023 shared libraries), then drive
`/ao-vivo` with puppeteer-core and screenshot the canvas element.

**Not verified** — GPU frame time on real hardware (SwiftShader is CPU-rasterised and its frame rate
is not representative), a physical phone, and a simulated asset-load failure (there are no remote
assets to fail). Draw calls and triangle counts are the honest proxy: calls improved, triangles did
not.

## 9. Known limitations

1. **Stylised, not photoreal.** The figures have correct proportion, joints and clothing, and the
   faces read at conversational distance, but skin, hair and cloth are flat-shaded PBR without maps.
   They will not be mistaken for photographs, and the UI says so.
2. **Rigid segments.** Knee and elbow junctions are visible as a seam at close range because the leg
   is two rigid lofts; a skinned mesh would need weights this system does not have.
3. **Licensed models remain the next step** for anyone who wants photographic fidelity; the manifest
   seam exists precisely for that.
4. Cloth does not deform — a jacket is a shell, not a simulation.
5. Foot planting is exact at contact; during the swing phase a lifted foot can trail by a few
   millimetres rather than following a full IK arc.
