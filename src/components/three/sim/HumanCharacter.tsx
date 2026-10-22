"use client";

/**
 * A person.
 *
 * This is the presentation layer of the character system and nothing else: it
 * owns the rig, the per-frame animation and the level of detail, and it reads
 * the simulation through `state.ts` without ever writing to it.
 *
 * The rig is a hierarchy of joint groups (hips → spine → head / shoulders →
 * elbows; hips → thighs → knees → ankles). Each frame the joints move toward a
 * *target pose* produced by `animation.ts`, damped by `blendRateFor` — which is
 * why a change of state glides instead of popping, and why the walk cycle keeps
 * its phase across a state change instead of restarting.
 *
 * Three things the old figure could not do, and this one does:
 *   - the hips are *solved* against the floor, so feet are planted while walking
 *     and while standing, and a seated guest's feet reach the floor;
 *   - the seated pose is solved against the chair, so knees go under the table
 *     and shins land on the ground;
 *   - every figure has its own rhythm, so thirty people do not breathe in unison.
 */

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { SimActor } from "@/lib/simulation/types";
import { appearanceFor } from "@/lib/characters/appearance";
import { bodyFor, collarGeometry } from "@/lib/characters/body";
import { hairGeometry, facialHairGeometry } from "@/lib/characters/hair";
import { jacketGeometry, apronGeometry } from "@/lib/characters/garments";
import { seatedLeg, seatedHipHeight, footHeight, segments } from "@/lib/characters/anatomy";
import {
  carryTargets,
  clearTargets,
  cookTargets,
  dampJoints,
  groundedHipHeight,
  idleTargets,
  joints,
  payTargets,
  readTargets,
  rhythmFor,
  seatedIdleTargets,
  serveTargets,
  walkTargets,
  blendRateFor,
  type JointSet,
} from "@/lib/characters/animation";
import { advancePhase, animationIntentFor, strideLengthFor } from "@/lib/characters/state";
import {
  clothMaterial,
  eyeMaterial,
  hairMaterial,
  leatherMaterial,
  lipMaterial,
  metalMaterial,
  skinMaterial,
  tailoringMaterial,
} from "@/lib/characters/materials";

export interface HumanCharacterProps {
  actor: SimActor;
  reducedMotion: boolean;
  /** Render the bones' targets directly, for debugging the rig. */
  debugPose?: boolean;
  /** Props (tray, menu, terminal) are parented to the right hand. */
  children?: ReactNode;
  /** Props that belong on the table, parented to the actor's root. */
  tabletop?: ReactNode;
}

/** Distance bands for the level of detail. */
const LOD = { face: 11, detail: 18 };

export function HumanCharacter({ actor, reducedMotion, debugPose = false, children, tabletop }: HumanCharacterProps) {
  const appearance = useMemo(() => appearanceFor(actor.kind, actor.seed), [actor.kind, actor.seed]);
  const body = useMemo(() => bodyFor(appearance), [appearance]);
  const p = body.proportions;
  const d = body.dims;
  const seg = useMemo(() => segments(p), [p]);
  const rhythm = useMemo(() => rhythmFor(actor.seed), [actor.seed]);
  const sit = useMemo(() => seatedLeg(p), [p]);
  const foot = footHeight(p);
  // the sole is not a point: its corners tip through the floor when the foot rolls
  // The contact patch is measured from the shoe mesh, not assumed: the toe of
  // the upper overhangs the sole, and the sole is 1.5 mm deeper than the ankle
  // height. Reading the real bounding box makes the floor constraint exact.
  const shoeShape = useMemo(() => {
    body.shoe.computeBoundingBox();
    const box = body.shoe.boundingBox;
    if (!box) return { toe: p.foot.length * 0.5, heel: p.foot.length * 0.5, height: foot };
    return { toe: Math.max(0.01, box.max.z), heel: Math.max(0.01, -box.min.z), height: -box.min.y };
  }, [body, p, foot]);
  const legChain = useMemo(() => ({ thigh: seg.thigh, shin: seg.shin }), [seg]);

  const hair = useMemo(
    () => hairGeometry(appearance.hair.style, ((actor.seed % 1000) / 1000 + 0.13) % 1),
    [appearance.hair.style, actor.seed],
  );
  const facialHair = useMemo(() => facialHairGeometry(appearance.facialHair), [appearance.facialHair]);
  const jacket = useMemo(
    () => (appearance.outfit.jacket ? jacketGeometry(p) : null),
    [appearance.outfit.jacket, p],
  );
  const collar = useMemo(() => {
    const g = appearance.outfit.garment;
    if (appearance.outfit.jacket) return collarGeometry(p, "band");
    if (g === "shirt" || g === "blouse") return collarGeometry(p, "flaps");
    if (g === "polo") return collarGeometry(p, "ring");
    return null;
  }, [appearance.outfit.jacket, appearance.outfit.garment, p]);
  const apron = useMemo(
    () => (appearance.outfit.workwear === "apron" ? apronGeometry(p, actor.kind === "chef") : null),
    [appearance.outfit.workwear, p, actor.kind],
  );

  const skin = skinMaterial(appearance.skin.base, appearance.skin.roughness, appearance.skin.warm, appearance.skin.subsurface);
  const lip = lipMaterial(appearance.skin.warm);
  const hairMat = hairMaterial(appearance.hair.colour, appearance.hair.roughness);
  const browMat = hairMaterial(appearance.brow, 0.62);
  const eyeMat = eyeMaterial();
  const garment = clothMaterial(appearance.outfit.colour);
  const trim = clothMaterial(appearance.outfit.trim ?? appearance.outfit.colour, 0.82);
  const lower = tailoringMaterial(appearance.outfit.lower);
  const shoe = leatherMaterial(appearance.outfit.shoes);
  const jacketMat = tailoringMaterial(appearance.outfit.jacket?.colour ?? appearance.outfit.lower);
  const apronMat = clothMaterial(appearance.staff?.role === "chef" ? "#e9e4d9" : "#c9beac", 0.92);
  const metalMat = metalMaterial();
  // Long sleeves are the jacket's cloth when a jacket is worn — a dark suit with
  // white sleeves is a lab coat, not a uniform.
  const sleeveMat = appearance.outfit.jacket
    ? jacketMat
    : appearance.outfit.longSleeves
      ? garment
      : skin;

  /* ---------------------------------------------------------------- refs */

  const root = useRef<THREE.Group>(null);
  const hips = useRef<THREE.Group>(null);
  const spine = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const shoulderL = useRef<THREE.Group>(null);
  const shoulderR = useRef<THREE.Group>(null);
  const elbowL = useRef<THREE.Group>(null);
  const elbowR = useRef<THREE.Group>(null);
  const thighL = useRef<THREE.Group>(null);
  const thighR = useRef<THREE.Group>(null);
  const kneeL = useRef<THREE.Group>(null);
  const kneeR = useRef<THREE.Group>(null);
  const ankleL = useRef<THREE.Group>(null);
  const ankleR = useRef<THREE.Group>(null);
  const face = useRef<THREE.Group>(null);
  const details = useRef<THREE.Group>(null);

  const current = useRef<JointSet>(joints());
  const phase = useRef(0);
  const clock = useRef(0);
  const lastPosition = useRef({ x: actor.x, z: actor.z });
  const hipHeight = useRef(p.hip);
  const lodTimer = useRef(0);

  useEffect(() => {
    // Reset only when the *actor* changes. This used to depend on x/z as well,
    // which meant every walking frame reset the joints to a neutral pose: the
    // figure slid across the floor standing perfectly still.
    current.current = joints();
    lastPosition.current = { x: actor.x, z: actor.z };
  }, [actor.id]);

  useFrame((state, rawDelta) => {
    const dt = Math.min(0.05, rawDelta);
    const intent = animationIntentFor(actor);
    const t = reducedMotion ? 0.0 : (clock.current += dt);
    const now = state.clock.elapsedTime;

    // ---- distance travelled → walk phase (never wall-clock time)
    const dx = actor.x - lastPosition.current.x;
    const dz = actor.z - lastPosition.current.z;
    const distance = Math.hypot(dx, dz);
    lastPosition.current = { x: actor.x, z: actor.z };
    if (!reducedMotion) {
      phase.current = advancePhase(phase.current, distance, strideLengthFor(p.height));
    }

    // ---- choose the target posture for this frame
    let target: JointSet;
    if (intent.moving) {
      target = walkTargets(phase.current + rhythm.phase * 0.15, rhythm, Math.min(1.3, distance / Math.max(dt, 1e-3) / 1.1));
    } else if (intent.seated) {
      target = seatedIdleTargets(t, rhythm, intent.variant, sit);
      if (actor.pose === "pay") target = payTargets(t, rhythm, sit);
    } else {
      switch (actor.pose) {
        case "carry":
          target = carryTargets(t, rhythm);
          break;
        case "serve":
          target = serveTargets(t, rhythm);
          break;
        case "clear":
          target = clearTargets(t, rhythm);
          break;
        case "cook":
          target = cookTargets(t, rhythm);
          break;
        case "read":
          target = readTargets(t, rhythm);
          break;
        case "talk":
          target = idleTargets(t, rhythm, 1.15);
          break;
        default:
          target = idleTargets(t, rhythm, 1);
      }
    }

    // ---- blend toward it
    const rate = reducedMotion ? 60 : Math.max(blendRateFor(actor.pose), intent.blend);
    current.current = dampJoints(current.current, target, rate, dt);
    const j = current.current;

    // ---- hips: solved against the floor when standing, against the chair when seated
    const seatedHeight = seatedHipHeight(p);
    const standingHeight = groundedHipHeight(j, legChain, foot, shoeShape);
    // A short guest on a 0.45 m chair legitimately dangles; a tall one must not
    // push a shoe through the floor, so the chair height can only rise.
    const targetHip = intent.seated ? Math.max(seatedHeight, standingHeight) : standingHeight;
    const damped = hipHeight.current + (targetHip - hipHeight.current) * (1 - Math.exp(-(reducedMotion ? 60 : 8) * dt));
    // The floor is a constraint, not a suggestion: a smoothed hip lags the walk
    // solve by up to 13 mm at contact, which is enough to bury a sole. Rising is
    // therefore instantaneous; only settling down is smoothed.
    hipHeight.current = Math.max(damped, Math.min(standingHeight, targetHip));

    if (root.current) {
      root.current.position.set(actor.x, 0, actor.z);
      root.current.rotation.y = actor.rotation;
      root.current.visible = !actor.hidden;
    }
    if (hips.current) {
      hips.current.position.y = hipHeight.current;
      hips.current.rotation.set(j.hipX, j.hipY, 0);
    }
    if (spine.current) spine.current.rotation.set(j.spineX, j.spineY, j.spineZ);
    if (head.current) head.current.rotation.set(j.headX, j.headY, 0);
    if (shoulderL.current) shoulderL.current.rotation.set(j.shoulderLX, 0, j.shoulderLZ);
    if (shoulderR.current) shoulderR.current.rotation.set(j.shoulderRX, 0, j.shoulderRZ);
    if (elbowL.current) elbowL.current.rotation.x = j.elbowL;
    if (elbowR.current) elbowR.current.rotation.x = j.elbowR;
    if (thighL.current) thighL.current.rotation.set(j.thighLX, 0, j.thighLZ);
    if (thighR.current) thighR.current.rotation.set(j.thighRX, 0, j.thighRZ);
    if (kneeL.current) kneeL.current.rotation.x = j.kneeL;
    if (kneeR.current) kneeR.current.rotation.x = j.kneeR;
    if (ankleL.current) ankleL.current.rotation.x = j.ankleL;
    if (ankleR.current) ankleR.current.rotation.x = j.ankleR;

    // ---- level of detail: sample the camera twice a second, not every frame
    lodTimer.current += dt;
    if (lodTimer.current > 0.25) {
      lodTimer.current = 0;
      const dist = state.camera.position.distanceTo(root.current?.position ?? new THREE.Vector3());
      if (face.current) face.current.visible = dist < LOD.face;
      if (details.current) details.current.visible = dist < LOD.detail;
    }

    void now;
  });

  if (debugPose) {
    // Renders the rig itself: useful when checking that a pose lands where the
    // solver says it should, without the body hiding the joints.
    return (
      <group ref={root} name={`actor-${actor.id}`}>
        <group ref={hips} position={[0, p.hip, 0]}>
          <group ref={spine}>
            <group ref={head} position={[0, d.headPivotY, 0]}>
              <mesh>
                <sphereGeometry args={[0.02, 8, 6]} />
                <meshBasicMaterial color="#FF625E" />
              </mesh>
            </group>
          </group>
        </group>
      </group>
    );
  }

  return (
    <group ref={root} name={`actor-${actor.id}`} position={[actor.x, 0, actor.z]} rotation={[0, actor.rotation, 0]}>
      {/* the table in front of this person never moves with their hips */}
      {tabletop}
      <group ref={hips} name="hips" position={[0, p.hip, 0]}>
        {/* pelvis */}
        <mesh geometry={body.hips} material={lower} castShadow receiveShadow />

        {/* spine and torso */}
        <group ref={spine}>
          <mesh geometry={body.torso} material={garment} castShadow receiveShadow />
          {appearance.outfit.jacket && jacket && (
            <mesh geometry={jacket} material={jacketMat} castShadow />
          )}
          {apron && <mesh geometry={apron} material={apronMat} castShadow />}
          <group ref={details}>
            {collar && <mesh geometry={collar} material={trim} castShadow />}
          </group>

          {/* neck */}
          <mesh geometry={body.neck} material={skin} castShadow />

          {/* head */}
          <group ref={head} position={[0, d.headPivotY, 0]}>
            <mesh geometry={body.head} material={skin} castShadow receiveShadow />
            <group ref={face}>
              <mesh geometry={body.eyes} material={eyeMat} />
              <mesh geometry={body.brows} material={browMat} />
              <mesh geometry={body.lips} material={lip} />
              {facialHair && <mesh geometry={facialHair} material={hairMat} scale={d.headScale} />}
              {appearance.accessories.glasses !== "none" && (
                <group>
                  {[1, -1].map((side) => (
                    <mesh
                      key={side}
                      position={[side * p.head.width * 0.2, p.head.height * 0.46, p.head.depth * 0.45]}
                      material={appearance.accessories.glasses === "dark" ? metalMaterial("#2a2622", 0.42) : metalMat}
                    >
                      <torusGeometry args={[p.head.width * 0.13, 0.0018, 5, 12]} />
                    </mesh>
                  ))}
                  <mesh position={[0, p.head.height * 0.47, p.head.depth * 0.45]} material={metalMat}>
                    <boxGeometry args={[p.head.width * 0.14, 0.0016, 0.0016]} />
                  </mesh>
                </group>
              )}
            </group>
            {hair && <mesh geometry={hair} material={hairMat} scale={d.headScale} castShadow />}
          </group>

          {/* arms */}
          <group ref={shoulderL} position={[d.shoulderX * 0.78, d.shoulderY * 0.97, 0]} rotation={[0, 0, 0.1]}>
            <mesh geometry={body.upperArm} material={sleeveMat} castShadow />
            {appearance.outfit.longSleeves || appearance.outfit.jacket ? (
              <mesh geometry={body.sleeveLong} material={garment} castShadow />
            ) : (
              <mesh geometry={body.sleeveCap} material={garment} castShadow />
            )}
            <group ref={elbowL} position={[0, -d.upperArmLength, 0]}>
              <mesh geometry={body.foreArm} material={sleeveMat} castShadow />
              <group position={[0, -d.foreArmLength, 0]}>
                <mesh geometry={body.handMirror} material={skin} castShadow />
              </group>
            </group>
          </group>

          <group ref={shoulderR} position={[-d.shoulderX * 0.78, d.shoulderY * 0.97, 0]} rotation={[0, 0, -0.1]}>
            <mesh geometry={body.upperArm} material={sleeveMat} castShadow />
            {appearance.outfit.longSleeves || appearance.outfit.jacket ? (
              <mesh geometry={body.sleeveLong} material={garment} castShadow />
            ) : (
              <mesh geometry={body.sleeveCap} material={garment} castShadow />
            )}
            <group ref={elbowR} position={[0, -d.upperArmLength, 0]}>
              <mesh geometry={body.foreArm} material={sleeveMat} castShadow />
              <group position={[0, -d.foreArmLength, 0]}>
                <mesh geometry={body.hand} material={skin} castShadow />
                {/* props ride in the right hand */}
                {children}
              </group>
            </group>
          </group>
        </group>

        {/* legs */}
        <group ref={thighL} name="thigh-L" position={[d.hipJointX, 0, 0]}>
          <mesh geometry={body.thigh} material={lower} castShadow />
          <group ref={kneeL} name="knee-L" position={[0, -d.thighLength, 0]}>
            <mesh geometry={body.shin} material={lower} castShadow />
            <group ref={ankleL} position={[0, -d.shinLength, 0]}>
              <mesh geometry={body.shoe} material={shoe} castShadow receiveShadow />
            </group>
          </group>
        </group>
        <group ref={thighR} name="thigh-R" position={[-d.hipJointX, 0, 0]}>
          <mesh geometry={body.thigh} material={lower} castShadow />
          <group ref={kneeR} name="knee-R" position={[0, -d.thighLength, 0]}>
            <mesh geometry={body.shin} material={lower} castShadow />
            <group ref={ankleR} position={[0, -d.shinLength, 0]}>
              <mesh geometry={body.shoe} material={shoe} castShadow receiveShadow />
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

/**
 * Materials and geometry are pooled by module, so a cast member unmounting must
 * **not** dispose them — the next guest uses the same buffers. The pools are
 * released by `clearBodyCache` / `clearMaterialCache` when the room itself goes.
 */
