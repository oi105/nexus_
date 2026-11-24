import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Question } from '../types/nexus';
import { DoubtFrame } from './DoubtFrame';
import { FRAME_SPACING, POOL_SIZE, getPooledSlots, useCorridorStore } from './store';
import { getTopicAccent } from './topicTheme';

interface CorridorProps {
  questions: Question[];
  theme: 'light' | 'dark';
  isSoftwareGl: boolean;
  onOpenChamber: (questionId: string) => void;
  onOpenAskDoubt: () => void;
}

interface FlyState {
  t: number;
  dur: number;
  p0: THREE.Vector3;
  q0: THREE.Quaternion;
  f0: number;
  p1: THREE.Vector3;
  q1: THREE.Quaternion;
  f1: number;
  enteringChamber: boolean;
  cb?: () => void;
}

function easeCubic(k: number) {
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
}

export function Corridor({
  questions,
  theme,
  isSoftwareGl,
  onOpenChamber,
  onOpenAskDoubt,
}: CorridorProps) {
  const { camera } = useThree();
  const targetZ = useCorridorStore((s) => s.targetZ);
  const windowAnchor = useCorridorStore((s) => s.windowAnchor);
  const activeTopic = useCorridorStore((s) => s.activeTopic);
  const activeChamberId = useCorridorStore((s) => s.activeChamberId);
  const setCameraZ = useCorridorStore((s) => s.setCameraZ);
  const setWindowAnchor = useCorridorStore((s) => s.setWindowAnchor);
  const stepWalkZ = useCorridorStore((s) => s.stepWalkZ);

  const shellRef = useRef<THREE.Group>(null);
  const portalRef = useRef<THREE.Group>(null);
  const pointLightRef = useRef<THREE.PointLight>(null);
  const dustRef = useRef<THREE.Points>(null);

  const stripMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#EF233C' }),
    [],
  );
  const ribMaterial = useMemo(
    () => new THREE.LineBasicMaterial({ color: '#8A1C2A' }),
    [],
  );

  const pointerRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<{ forward: boolean; backward: boolean }>({
    forward: false,
    backward: false,
  });
  const anchorRef = useRef(0);
  const lastSyncRef = useRef(0);
  const flyRef = useRef<FlyState | null>(null);
  const prevChamberRef = useRef<string | null>(activeChamberId);
  const [hoveredPoolIdx, setHoveredPoolIdx] = useState<number | null>(null);

  const isDark = theme === 'dark';
  const wingAccent = useMemo(() => new THREE.Color(getTopicAccent(activeTopic)), [activeTopic]);
  const liveWingColor = useRef(new THREE.Color(getTopicAccent(activeTopic)));

  // Architectural corridor rib LineLoop geometry
  const ribGeometry = useMemo(() => {
    const pts = [
      new THREE.Vector3(-4.65, 0.04, 0),
      new THREE.Vector3(4.65, 0.04, 0),
      new THREE.Vector3(4.65, 5.95, 0),
      new THREE.Vector3(-4.65, 5.95, 0),
      new THREE.Vector3(-4.65, 0.04, 0),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  // Luminous corridor dust particles
  const dustGeometry = useMemo(() => {
    const count = isSoftwareGl ? 160 : 320;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      positions[i * 3] = (Math.random() - 0.5) * 8.6;
      positions[i * 3 + 1] = Math.random() * 5.8 + 0.1;
      positions[i * 3 + 2] = -Math.random() * 120;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [isSoftwareGl]);

  useEffect(() => {
    return () => {
      ribGeometry.dispose();
      dustGeometry.dispose();
      stripMaterial.dispose();
      ribMaterial.dispose();
    };
  }, [ribGeometry, dustGeometry, stripMaterial, ribMaterial]);

  // Smooth fly-back when closing Doubt Chamber
  useEffect(() => {
    if (prevChamberRef.current && !activeChamberId) {
      const z = useCorridorStore.getState().targetZ;
      const targetPos = new THREE.Vector3(0, 1.65, z);
      const lookPos = new THREE.Vector3(0, 1.6, z - 12);
      const tmp = new THREE.PerspectiveCamera();
      tmp.position.copy(targetPos);
      tmp.lookAt(lookPos);
      flyRef.current = {
        t: 0,
        dur: 0.75,
        p0: camera.position.clone(),
        q0: camera.quaternion.clone(),
        f0: (camera as THREE.PerspectiveCamera).fov,
        p1: targetPos,
        q1: tmp.quaternion.clone(),
        f1: 55,
        enteringChamber: false,
      };
    }
    prevChamberRef.current = activeChamberId;
  }, [activeChamberId, camera]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      pointerRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointerRef.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeChamberId) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
        keysRef.current.forward = true;
      } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        keysRef.current.backward = true;
      } else if (e.key === ' ') {
        e.preventDefault();
        stepWalkZ(-FRAME_SPACING);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
        keysRef.current.forward = false;
      } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        keysRef.current.backward = false;
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      document.body.style.cursor = 'auto';
    };
  }, [activeChamberId, stepWalkZ]);

  const pooledSlots = useMemo(() => getPooledSlots(windowAnchor), [windowAnchor]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const perspCam = state.camera as THREE.PerspectiveCamera;

    // Lerp wing neon accent across all 4 floor/ceiling strips, all portal ribs, and tracking light
    liveWingColor.current.lerp(wingAccent, 0.1);
    stripMaterial.color.copy(liveWingColor.current);
    if (isDark) {
      ribMaterial.color.copy(liveWingColor.current).multiplyScalar(0.55);
    } else {
      ribMaterial.color.set('#1E293B');
    }
    if (pointLightRef.current) {
      pointLightRef.current.color.copy(liveWingColor.current);
      pointLightRef.current.position.set(0, 3.2, perspCam.position.z - 5);
    }

    if (flyRef.current) {
      const f = flyRef.current;
      f.t += dt;
      const k = easeCubic(Math.min(1, f.t / f.dur));
      perspCam.position.lerpVectors(f.p0, f.p1, k);
      perspCam.quaternion.copy(f.q0).slerp(f.q1, k);
      perspCam.fov = f.f0 + (f.f1 - f.f0) * k;
      perspCam.updateProjectionMatrix();
      if (f.t >= f.dur) {
        const cb = f.cb;
        flyRef.current = null;
        if (cb) cb();
      }
      return;
    }

    if (!activeChamberId) {
      if (keysRef.current.forward) stepWalkZ(-dt * 15);
      if (keysRef.current.backward) stepWalkZ(dt * 15);

      const desiredZ = useCorridorStore.getState().targetZ;
      perspCam.position.z = THREE.MathUtils.damp(perspCam.position.z, desiredZ, 6, dt);
      perspCam.position.x = THREE.MathUtils.damp(
        perspCam.position.x,
        pointerRef.current.x * 0.35 + Math.sin(state.clock.elapsedTime * 0.5) * 0.025,
        5,
        dt,
      );
      perspCam.position.y = THREE.MathUtils.damp(
        perspCam.position.y,
        1.65 - pointerRef.current.y * 0.1 + Math.sin(state.clock.elapsedTime * 1.2) * 0.015,
        5,
        dt,
      );

      perspCam.lookAt(
        pointerRef.current.x * 0.65,
        1.55 - pointerRef.current.y * 0.2,
        perspCam.position.z - 18,
      );
    }

    const camZ = perspCam.position.z;
    if (shellRef.current) shellRef.current.position.z = camZ - 140;
    if (portalRef.current) portalRef.current.position.z = camZ - 52;

    // Recycle floating dust particles infinitely along corridor
    if (dustRef.current) {
      const attr = dustGeometry.attributes.position as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) {
        if (arr[i + 2] > camZ + 8) arr[i + 2] -= 120;
        else if (arr[i + 2] < camZ - 112) arr[i + 2] += 120;
      }
      attr.needsUpdate = true;
    }

    const nextAnchor = Math.max(0, Math.floor(Math.max(0, 2 - camZ) / FRAME_SPACING));
    if (nextAnchor !== anchorRef.current) {
      anchorRef.current = nextAnchor;
      queueMicrotask(() => setWindowAnchor(nextAnchor));
    }

    if (state.clock.elapsedTime - lastSyncRef.current > 0.12) {
      lastSyncRef.current = state.clock.elapsedTime;
      queueMicrotask(() => setCameraZ(camZ));
    }
  });

  const cycleLength = Math.max(1, questions.length + 1);
  const minRib = Math.max(0, Math.floor(-targetZ / 4) - 2);
  const ribIndices: number[] = [];
  for (let r = minRib; r <= minRib + 28; r += 1) {
    ribIndices.push(r);
  }

  const wallMatColor = isDark ? '#08090F' : '#FFFFFF';
  const floorMatColor = isDark ? '#06070B' : '#F1F5F9';

  return (
    <group>
      {/* Active point light tinted to Wing neon color */}
      <pointLight ref={pointLightRef} intensity={isDark ? 2.6 : 1.0} distance={32} decay={2} />

      {/* Moving Corridor Metallic Floor, Ceiling, Walls & 4 Neon Edge Strips */}
      <group ref={shellRef} position={[0, 0, -140]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[9.4, 340]} />
          <meshStandardMaterial
            color={floorMatColor}
            emissive={isDark ? '#000000' : '#E2E8F0'}
            emissiveIntensity={isDark ? 0 : 0.35}
            roughness={isDark ? 0.24 : 0.65}
            metalness={isDark ? 0.65 : 0.04}
          />
        </mesh>

        <mesh position={[0, 6, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[9.4, 340]} />
          <meshStandardMaterial
            color={wallMatColor}
            emissive={isDark ? '#000000' : '#FFFFFF'}
            emissiveIntensity={isDark ? 0 : 0.55}
            roughness={isDark ? 0.34 : 0.75}
            metalness={isDark ? 0.45 : 0.02}
          />
        </mesh>

        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[side * 4.7, 3, 0]} rotation={[0, -side * (Math.PI / 2), 0]}>
              <planeGeometry args={[340, 6]} />
              <meshStandardMaterial
                color={wallMatColor}
                emissive={isDark ? '#000000' : '#FFFFFF'}
                emissiveIntensity={isDark ? 0 : 0.52}
                roughness={isDark ? 0.3 : 0.75}
                metalness={isDark ? 0.52 : 0.02}
                side={THREE.DoubleSide}
              />
            </mesh>
            {[0.06, 5.94].map((y) => (
              <mesh key={y} position={[side * 4.6, y, 0]} material={stripMaterial}>
                <boxGeometry args={[0.1, 0.1, 340]} />
              </mesh>
            ))}
          </group>
        ))}
      </group>

      {/* Repeating Architectural Portal Ribs */}
      {ribIndices.map((r, i) => (
        <lineLoop
          key={`rib_${i}`}
          geometry={ribGeometry}
          material={ribMaterial}
          position={[0, 0, -r * 4]}
        />
      ))}

      {/* Luminous Floating Dust Particles */}
      <points ref={dustRef} geometry={dustGeometry} frustumCulled={false}>
        <pointsMaterial
          color={isDark ? '#FCA5A5' : '#090B10'}
          size={isDark ? 0.055 : 0.045}
          transparent
          opacity={isDark ? 0.65 : 0.25}
          depthWrite={false}
        />
      </points>

      {/* Distant Horizon Portal Ring */}
      <group ref={portalRef} position={[0, 2.5, -52]}>
        <mesh>
          <ringGeometry args={[1.65, 1.92, 48]} />
          <meshBasicMaterial
            color={getTopicAccent(activeTopic)}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[0, 0, -0.1]}>
          <circleGeometry args={[1.62, 48]} />
          <meshBasicMaterial
            color={isDark ? '#2A0B12' : '#FFFFFF'}
            transparent
            opacity={isDark ? 0.55 : 0.85}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>

      {/* Pooled 3D Glass Doubt Frames along the Infinite Corridor */}
      {pooledSlots.map(({ poolIdx, slotIdx }) => {
        const zPos = -slotIdx * FRAME_SPACING - 10;
        const isLeft = slotIdx % 2 === 0;
        const xPos = isLeft ? -2.85 : 2.85;
        const rotY = isLeft ? 0.48 : -0.48;

        const modIdx = slotIdx % cycleLength;
        const q = questions.length > 0 && modIdx < questions.length ? questions[modIdx] : null;

        return (
          <DoubtFrame
            key={`frame_pool_${poolIdx}`}
            question={q}
            activeTopic={activeTopic}
            position={[xPos, 0, zPos]}
            rotationY={rotY}
            theme={theme}
            isSoftwareGl={isSoftwareGl}
            dimmed={hoveredPoolIdx !== null && hoveredPoolIdx !== poolIdx}
            onHoverChange={(isHov) => {
              setHoveredPoolIdx((curr) => (isHov ? poolIdx : curr === poolIdx ? null : curr));
            }}
            onSelectFrame={(worldCenter, worldNormal) => {
              if (!q) {
                onOpenAskDoubt();
                return;
              }
              const camPosTarget = worldCenter.clone().addScaledVector(worldNormal, 4.15);
              camPosTarget.y = 1.95;
              const tmp = new THREE.PerspectiveCamera();
              tmp.position.copy(camPosTarget);
              tmp.lookAt(worldCenter);
              flyRef.current = {
                t: 0,
                dur: 0.72,
                p0: camera.position.clone(),
                q0: camera.quaternion.clone(),
                f0: (camera as THREE.PerspectiveCamera).fov,
                p1: camPosTarget,
                q1: tmp.quaternion.clone(),
                f1: 42,
                enteringChamber: true,
                cb: () => onOpenChamber(q.id),
              };
            }}
          />
        );
      })}
    </group>
  );
}
