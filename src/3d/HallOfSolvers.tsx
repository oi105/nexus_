import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { User } from 'firebase/auth';
import * as THREE from 'three';
import {
  Award,
  CheckCircle2,
  LayoutGrid,
  LogOut,
  Moon,
  Sparkles,
  Sun,
  Trophy,
  X,
} from 'lucide-react';
import type { NavView, TopSolverEntry, UserProfile } from '../types/nexus';
import type { LeaderboardPeriod } from '../utils/nexusLogic';
import { getInitials } from '../utils/nexusLogic';
import { NexusLogo, UserAvatar } from '../components/NexusBrand';
import { Dock } from './hud/Dock';
import { getTopicAccent, getTopicLightInk, getTopicShortMark } from './topicTheme';
import { detectSoftwareWebGL } from './webgl';

export interface HallLeaderDisplay extends TopSolverEntry {
  branch?: string;
  year?: string;
  topics: string[];
  highlightQuote: string;
  featuredDoubt: string;
  isDemo?: boolean;
}

interface HallOfSolversExperienceProps {
  leaders: HallLeaderDisplay[];
  theme: 'light' | 'dark';
  period: LeaderboardPeriod;
  onChangePeriod: (p: LeaderboardPeriod) => void;
  activeView: NavView;
  isAdmin: boolean;
  unreadMessagesCount: number;
  currentUser: User | null;
  profile: UserProfile | null;
  onToggleTheme: () => void;
  onSwitchTo2d: () => void;
  onNavigate: (view: NavView) => void;
  onOpenAskDoubt: () => void;
  onSignInGoogle: () => Promise<void>;
  onSignOut: () => Promise<void>;
}

const HALL_STATION_SPACING = 10.8;

function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > maxWidth && line) {
      out.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) out.push(line);
  if (out.length > maxLines) {
    out.length = maxLines;
    out[maxLines - 1] = `${out[maxLines - 1].replace(/\s+\S*$/, '')}…`;
  }
  return out;
}

function getMedalColor(rank: number): string {
  if (rank === 1) return '#FFD166';
  if (rank === 2) return '#F59E0B';
  if (rank === 3) return '#EF233C';
  return '#EAB308';
}

function paintLeaderFrameTexture(
  leader: HallLeaderDisplay,
  theme: 'light' | 'dark',
  maxAniso: number,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 640;
  const ctx = c.getContext('2d');
  const medal = getMedalColor(leader.rank);
  const isDark = theme === 'dark';

  if (ctx) {
    // Card background
    ctx.fillStyle = isDark ? '#120D06' : '#FFFDF7';
    rr(ctx, 10, 10, 1004, 620, 32);
    ctx.fill();

    // Golden studio radial corner glow
    const grad = ctx.createLinearGradient(0, 0, 1024, 640);
    grad.addColorStop(0, isDark ? 'rgba(245, 184, 46, 0.18)' : 'rgba(245, 184, 46, 0.14)');
    grad.addColorStop(0.55, 'rgba(0,0,0,0)');
    grad.addColorStop(1, isDark ? 'rgba(239, 35, 60, 0.12)' : 'rgba(217, 119, 6, 0.1)');
    ctx.fillStyle = grad;
    rr(ctx, 10, 10, 1004, 620, 32);
    ctx.fill();

    // High-contrast double stroke border (Black + Gold in Light; Gold + Obsidian in Dark)
    ctx.lineWidth = 8;
    ctx.strokeStyle = isDark ? medal : '#090B10';
    rr(ctx, 10, 10, 1004, 620, 32);
    ctx.stroke();

    ctx.lineWidth = 3.5;
    ctx.strokeStyle = isDark ? 'rgba(255, 224, 138, 0.45)' : '#D97706';
    rr(ctx, 22, 22, 980, 596, 24);
    ctx.stroke();

    // Rank Ribbon
    ctx.fillStyle = isDark ? medal : '#090B10';
    rr(ctx, 48, 44, 136, 52, 14);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = isDark ? '#120D06' : '#FFD166';
    ctx.font = '800 30px "IBM Plex Mono", monospace';
    ctx.fillText(`#${leader.rank}`, 116, 80);

    // Showcase / Verified Badge top-right
    const tag = leader.isDemo ? 'SHOWCASE LEADER' : 'VERIFIED SOLVER';
    ctx.fillStyle = leader.isDemo
      ? isDark
        ? 'rgba(239, 35, 60, 0.24)'
        : '#FEF2F2'
      : isDark
        ? 'rgba(255, 209, 102, 0.24)'
        : '#FEF3C7';
    rr(ctx, 682, 44, 294, 48, 12);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = leader.isDemo ? '#EF233C' : '#D97706';
    ctx.stroke();
    ctx.fillStyle = leader.isDemo
      ? isDark
        ? '#FCA5A5'
        : '#B91C1C'
      : isDark
        ? '#FFD166'
        : '#92400E';
    ctx.font = '700 20px "IBM Plex Mono", monospace';
    ctx.fillText(tag, 829, 75);

    // Portrait Crest
    ctx.fillStyle = isDark ? 'rgba(245, 184, 46, 0.22)' : '#FEF3C7';
    ctx.beginPath();
    ctx.arc(124, 192, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = isDark ? medal : '#090B10';
    ctx.stroke();
    ctx.fillStyle = isDark ? '#FFF8E7' : '#090B10';
    ctx.font = '800 44px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(getInitials(leader.displayName), 124, 207);

    // Name & Branch
    ctx.textAlign = 'left';
    ctx.fillStyle = isDark ? '#FFFDF7' : '#090B10';
    ctx.font = '800 48px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(leader.displayName, 214, 184);

    ctx.fillStyle = isDark ? '#E7C878' : '#3F4A5F';
    ctx.font = '600 25px "IBM Plex Mono", monospace';
    ctx.fillText(
      `${leader.branch || 'Engineering'} · ${leader.year || 'Peer Mentor'}`,
      214,
      226,
    );

    // Topic chips
    let chipX = 48;
    leader.topics.slice(0, 3).forEach((tp) => {
      const ac = getTopicAccent(tp);
      const lightInk = getTopicLightInk(tp);
      ctx.font = '700 22px "IBM Plex Mono", monospace';
      const w = Math.min(280, ctx.measureText(tp).width + 38);
      ctx.fillStyle = isDark ? `${ac}26` : '#FFFFFF';
      rr(ctx, chipX, 286, w, 46, 12);
      ctx.fill();
      ctx.strokeStyle = isDark ? ac : lightInk;
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = isDark ? ac : lightInk;
      ctx.fillText(tp, chipX + 19, 316);
      chipX += w + 14;
    });

    // Quote block
    ctx.fillStyle = isDark ? 'rgba(255, 224, 138, 0.08)' : '#FEF8E6';
    rr(ctx, 48, 358, 928, 128, 18);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = isDark ? 'rgba(245, 184, 46, 0.28)' : '#E5C97B';
    ctx.stroke();
    ctx.fillStyle = isDark ? '#F6E7C1' : '#1E1B14';
    ctx.font = '600 27px "Plus Jakarta Sans", sans-serif';
    const qLines = wrapText(ctx, `“${leader.highlightQuote}”`, 872, 2);
    qLines.forEach((ln, idx) => {
      ctx.fillText(ln, 76, 412 + idx * 42);
    });

    // Credits & Solved Bottom Metrics
    ctx.fillStyle = isDark ? medal : '#090B10';
    rr(ctx, 48, 514, 444, 78, 16);
    ctx.fill();
    ctx.fillStyle = isDark ? '#120D06' : '#FFD166';
    ctx.font = '800 32px "IBM Plex Mono", monospace';
    ctx.fillText(`★ ${leader.totalCredits} CREDITS`, 78, 563);

    ctx.fillStyle = isDark ? '#21180B' : '#FEF3C7';
    rr(ctx, 514, 514, 462, 78, 16);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = isDark ? '#F5B82E' : '#090B10';
    ctx.stroke();
    ctx.fillStyle = isDark ? '#FFFDF7' : '#090B10';
    ctx.font = '800 30px "IBM Plex Mono", monospace';
    ctx.fillText(`${leader.solvedCount} DOUBTS SOLVED`, 546, 563);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso || 1);
  return tex;
}

function paintCollageTexture(
  leader: HallLeaderDisplay,
  theme: 'light' | 'dark',
  maxAniso: number,
): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 920;
  c.height = 360;
  const ctx = c.getContext('2d');
  const isDark = theme === 'dark';
  const medal = getMedalColor(leader.rank);

  if (ctx) {
    ctx.fillStyle = isDark ? '#151008' : '#FFFDF7';
    rr(ctx, 8, 8, 904, 344, 24);
    ctx.fill();

    ctx.lineWidth = 6;
    ctx.strokeStyle = isDark ? medal : '#090B10';
    rr(ctx, 8, 8, 904, 344, 24);
    ctx.stroke();

    // Header
    ctx.fillStyle = isDark ? '#FFD166' : '#B45309';
    ctx.font = '700 20px "IBM Plex Mono", monospace';
    ctx.fillText(`TOPIC MASTERY & ARCHIVE · ${leader.displayName.toUpperCase()}`, 34, 46);

    // 3 Topic Mastery Mosaic Tiles on Left
    const tiles = leader.topics.slice(0, 3);
    while (tiles.length < 3) tiles.push('Programming');

    tiles.forEach((tp, idx) => {
      const tx = 34 + idx * 164;
      const ty = 68;
      const ac = getTopicAccent(tp);
      const lightInk = getTopicLightInk(tp);
      ctx.fillStyle = isDark ? '#1F160A' : '#FFFFFF';
      rr(ctx, tx, ty, 148, 252, 16);
      ctx.fill();
      ctx.strokeStyle = isDark ? ac : '#090B10';
      ctx.lineWidth = 3;
      rr(ctx, tx, ty, 148, 252, 16);
      ctx.stroke();

      ctx.fillStyle = isDark ? `${ac}2E` : '#FEF8E6';
      rr(ctx, tx + 12, ty + 14, 124, 134, 12);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle = isDark ? ac : lightInk;
      ctx.font = '800 42px "IBM Plex Mono", monospace';
      ctx.fillText(getTopicShortMark(tp), tx + 74, ty + 96);

      ctx.fillStyle = isDark ? '#FFF8E7' : '#090B10';
      ctx.font = '700 18px "Plus Jakarta Sans", sans-serif';
      const shortTp = tp.length > 12 ? `${tp.slice(0, 11)}…` : tp;
      ctx.fillText(shortTp, tx + 74, ty + 206);
      ctx.textAlign = 'left';
    });

    // Featured Solved Doubt Highlight Card on Right
    ctx.fillStyle = isDark ? '#1D1509' : '#FEF8E6';
    rr(ctx, 536, 68, 348, 252, 18);
    ctx.fill();
    ctx.strokeStyle = isDark ? '#FFD166' : '#D97706';
    ctx.lineWidth = 3;
    rr(ctx, 536, 68, 348, 252, 18);
    ctx.stroke();

    ctx.fillStyle = isDark ? '#FFD166' : '#B91C1C';
    ctx.font = '700 18px "IBM Plex Mono", monospace';
    ctx.fillText('SIGNATURE SOLVED', 560, 108);

    ctx.fillStyle = isDark ? '#FFFDF7' : '#090B10';
    ctx.font = '700 25px "Plus Jakarta Sans", sans-serif';
    const fLines = wrapText(ctx, leader.featuredDoubt, 296, 4);
    fLines.forEach((ln, idx) => {
      ctx.fillText(ln, 560, 154 + idx * 34);
    });

    ctx.fillStyle = isDark ? '#D4B872' : '#475569';
    ctx.font = '600 17px "IBM Plex Mono", monospace';
    ctx.fillText(`BAY #${leader.rank} · CLICK TO INSPECT`, 560, 298);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso || 1);
  return tex;
}

function HallWallStation({
  leader,
  index,
  theme,
  selected,
  onSelect,
}: {
  leader: HallLeaderDisplay;
  index: number;
  theme: 'light' | 'dark';
  selected: boolean;
  onSelect: (stationZ: number, sideX: number) => void;
}) {
  const { gl } = useThree();
  const medalRef = useRef<THREE.Mesh>(null);
  const isLeft = index % 2 === 0;
  const zPos = -10.5 - index * HALL_STATION_SPACING;
  // Angled museum display bays facing the camera down the corridor so every word is crystal-clear
  const bayX = isLeft ? -3.08 : 3.08;
  const rotY = isLeft ? 0.42 : -0.42;
  const medalColor = getMedalColor(leader.rank);
  const maxAniso = gl.capabilities.getMaxAnisotropy();
  const isDark = theme === 'dark';

  const portraitTex = useMemo(
    () => paintLeaderFrameTexture(leader, theme, maxAniso),
    [leader, theme, maxAniso],
  );
  const collageTex = useMemo(
    () => paintCollageTexture(leader, theme, maxAniso),
    [leader, theme, maxAniso],
  );

  useEffect(() => {
    return () => {
      portraitTex.dispose();
      collageTex.dispose();
    };
  }, [portraitTex, collageTex]);

  useFrame((_, delta) => {
    if (medalRef.current) {
      medalRef.current.rotation.y += delta * 0.9;
    }
  });

  const frameBorderColor = selected ? '#FFFFFF' : medalColor;

  return (
    <group position={[0, 0, zPos]}>
      {/* Angled Golden Museum Bay */}
      <group position={[bayX, 0, 0]} rotation={[0, rotY, 0]}>
        {/* Main Portrait Plaque */}
        <group position={[0, 1.9, 0]}>
          <mesh position={[0, 0, -0.05]}>
            <boxGeometry args={[3.58, 2.26, 0.08]} />
            <meshStandardMaterial
              color={frameBorderColor}
              emissive={medalColor}
              emissiveIntensity={selected ? 0.65 : isDark ? 0.35 : 0.15}
              metalness={0.8}
              roughness={0.22}
            />
          </mesh>
          <mesh
            position={[0, 0, 0.01]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(zPos, isLeft ? -0.45 : 0.45);
            }}
            onPointerOver={() => {
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              document.body.style.cursor = 'auto';
            }}
          >
            <planeGeometry args={[3.42, 2.14]} />
            <meshBasicMaterial map={portraitTex} transparent={isDark} />
          </mesh>
        </group>

        {/* Companion Topic Collage mounted cleanly ABOVE the portrait (zero overlap) */}
        <group position={[0, 3.84, -0.04]}>
          <mesh position={[0, 0, -0.04]}>
            <boxGeometry args={[3.35, 1.34, 0.07]} />
            <meshStandardMaterial
              color={isDark ? '#D97706' : '#090B10'}
              emissive={medalColor}
              emissiveIntensity={isDark ? 0.25 : 0.08}
              metalness={0.7}
              roughness={0.3}
            />
          </mesh>
          <mesh
            position={[0, 0, 0.01]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(zPos, isLeft ? -0.45 : 0.45);
            }}
          >
            <planeGeometry args={[3.22, 1.24]} />
            <meshBasicMaterial map={collageTex} transparent={isDark} />
          </mesh>
        </group>

        {/* Crown Light Bar above bay */}
        <mesh position={[0, 4.66, 0.08]}>
          <boxGeometry args={[2.35, 0.07, 0.07]} />
          <meshBasicMaterial color={medalColor} />
        </mesh>
      </group>

      {/* Sculpted Golden Trophy Pedestal flanking the outer aisle (never obstructing text) */}
      <group position={[isLeft ? -4.1 : 4.1, 0, 1.6]}>
        <mesh position={[0, 0.48, 0]}>
          <cylinderGeometry args={[0.32, 0.42, 0.96, 8]} />
          <meshStandardMaterial
            color={isDark ? '#1E1608' : '#E7D7AE'}
            metalness={0.55}
            roughness={0.28}
          />
        </mesh>
        <mesh position={[0, 0.98, 0]}>
          <cylinderGeometry args={[0.36, 0.36, 0.06, 16]} />
          <meshStandardMaterial
            color={medalColor}
            emissive={medalColor}
            emissiveIntensity={0.6}
          />
        </mesh>
        <mesh ref={medalRef} position={[0, 1.4, 0]}>
          <octahedronGeometry args={[0.25, 0]} />
          <meshStandardMaterial
            color="#FFD166"
            emissive="#F59E0B"
            emissiveIntensity={isDark ? 0.85 : 0.35}
            metalness={0.5}
            roughness={0.18}
          />
        </mesh>
      </group>
    </group>
  );
}

function GoldDustParticles({ count, color }: { count: number; color: string }) {
  const ref = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 9.5;
      arr[i * 3 + 1] = 0.4 + Math.random() * 5.2;
      arr[i * 3 + 2] = 6 - Math.random() * 110;
    }
    return arr;
  }, [count]);

  useFrame((_, delta) => {
    if (!ref.current) return;
    ref.current.rotation.z += delta * 0.015;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color={color} size={0.075} transparent opacity={0.7} sizeAttenuation />
    </points>
  );
}

function HallGalleryCorridor({
  leaders,
  theme,
  walkZ,
  targetCameraX,
  selectedId,
  onSelectLeader,
  onSyncWalk,
}: {
  leaders: HallLeaderDisplay[];
  theme: 'light' | 'dark';
  walkZ: React.MutableRefObject<number>;
  targetCameraX: React.MutableRefObject<number>;
  selectedId: string | null;
  onSelectLeader: (leader: HallLeaderDisplay, zPos: number, sideX: number) => void;
  onSyncWalk: (z: number) => void;
}) {
  const isDark = theme === 'dark';
  const keys = useRef({ fwd: false, back: false });
  const lightRef = useRef<THREE.PointLight>(null);
  const lastSync = useRef(0);

  const ribGeo = useMemo(() => {
    const pts = [
      new THREE.Vector3(-4.95, 0.04, 0),
      new THREE.Vector3(4.95, 0.04, 0),
      new THREE.Vector3(4.95, 6.1, 0),
      new THREE.Vector3(-4.95, 6.1, 0),
      new THREE.Vector3(-4.95, 0.04, 0),
    ];
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  useEffect(() => () => ribGeo.dispose(), [ribGeo]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const el = document.activeElement?.tagName;
      if (el === 'INPUT' || el === 'TEXTAREA') return;
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp' || e.key === ' ') {
        keys.current.fwd = true;
      }
      if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        keys.current.back = true;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp' || e.key === ' ') {
        keys.current.fwd = false;
      }
      if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
        keys.current.back = false;
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      document.body.style.cursor = 'auto';
    };
  }, []);

  const maxDepth = -Math.max(2, leaders.length) * HALL_STATION_SPACING;

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    if (keys.current.fwd) walkZ.current = Math.max(maxDepth, walkZ.current - dt * 13);
    if (keys.current.back) walkZ.current = Math.min(4, walkZ.current + dt * 13);

    state.camera.position.z = THREE.MathUtils.damp(state.camera.position.z, walkZ.current, 6, dt);
    state.camera.position.x = THREE.MathUtils.damp(
      state.camera.position.x,
      targetCameraX.current,
      5,
      dt,
    );
    state.camera.position.y = 2.15;
    state.camera.lookAt(
      targetCameraX.current * 0.7,
      2.35,
      state.camera.position.z - 16,
    );

    if (lightRef.current) {
      lightRef.current.position.set(0, 4.4, state.camera.position.z - 5.5);
    }

    if (state.clock.elapsedTime - lastSync.current > 0.15) {
      lastSync.current = state.clock.elapsedTime;
      queueMicrotask(() => onSyncWalk(state.camera.position.z));
    }
  });

  const corridorLength = Math.max(100, leaders.length * HALL_STATION_SPACING + 40);
  const ribCount = Math.ceil(corridorLength / 5.5);
  const goldTrim = isDark ? '#F5B82E' : '#D97706';

  return (
    <>
      <hemisphereLight
        args={[isDark ? '#FFE8A3' : '#FFFBF0', isDark ? '#3A2406' : '#E8D5A5', isDark ? 1.65 : 1.9]}
      />
      <directionalLight
        position={[5, 12, 8]}
        intensity={isDark ? 1.35 : 1.5}
        color={isDark ? '#FFE08A' : '#FFF4CC'}
      />
      <pointLight ref={lightRef} color="#FFD166" intensity={isDark ? 3.5 : 1.6} distance={38} decay={1.8} />

      <GoldDustParticles count={240} color={isDark ? '#FFD166' : '#D97706'} />

      {/* Warm Golden Hall Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -corridorLength / 2 + 10]}>
        <planeGeometry args={[10.4, corridorLength]} />
        <meshStandardMaterial
          color={isDark ? '#241706' : '#F4E3B8'}
          emissive={isDark ? '#2E1C05' : '#F6E7BE'}
          emissiveIntensity={isDark ? 0.32 : 0.25}
          roughness={isDark ? 0.3 : 0.48}
          metalness={isDark ? 0.45 : 0.12}
        />
      </mesh>

      {/* Center Golden Carpet Runner */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, -corridorLength / 2 + 10]}>
        <planeGeometry args={[2.3, corridorLength]} />
        <meshStandardMaterial
          color={isDark ? '#6B430C' : '#EBD08A'}
          emissive={isDark ? '#5C3908' : '#E8C56E'}
          emissiveIntensity={isDark ? 0.35 : 0.2}
          roughness={0.5}
          metalness={0.25}
        />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 6.1, -corridorLength / 2 + 10]}>
        <planeGeometry args={[10.4, corridorLength]} />
        <meshStandardMaterial
          color={isDark ? '#261907' : '#FFF8E6'}
          emissive={isDark ? '#2B1B05' : '#FFF4D6'}
          emissiveIntensity={isDark ? 0.28 : 0.35}
          roughness={0.45}
          metalness={0.25}
        />
      </mesh>

      {/* Left & Right Golden Gallery Walls + 24K Gold Neon Trim */}
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh
            position={[side * 5.2, 3.05, -corridorLength / 2 + 10]}
            rotation={[0, -side * (Math.PI / 2), 0]}
          >
            <planeGeometry args={[corridorLength, 6.1]} />
            <meshStandardMaterial
              color={isDark ? '#2F1F08' : '#FFFDF5'}
              emissive={isDark ? '#3B2508' : '#FFF5D6'}
              emissiveIntensity={isDark ? 0.36 : 0.32}
              roughness={0.42}
              metalness={isDark ? 0.35 : 0.06}
              side={THREE.DoubleSide}
            />
          </mesh>
          <mesh position={[side * 5.1, 0.07, -corridorLength / 2 + 10]}>
            <boxGeometry args={[0.1, 0.1, corridorLength]} />
            <meshBasicMaterial color={goldTrim} />
          </mesh>
          <mesh position={[side * 5.1, 6.02, -corridorLength / 2 + 10]}>
            <boxGeometry args={[0.1, 0.1, corridorLength]} />
            <meshBasicMaterial color={isDark ? '#FFD166' : '#090B10'} />
          </mesh>
        </group>
      ))}

      {/* Golden Portal Ribs */}
      {Array.from({ length: ribCount }, (_, i) => (
        <lineLoop key={i} geometry={ribGeo} position={[0, 0, 5 - i * 5.5]}>
          <meshBasicMaterial color={isDark ? '#9A701E' : '#B45309'} />
        </lineLoop>
      ))}

      {/* Distant Golden Sanctuary Portal Arch */}
      <group position={[0, 3.05, -corridorLength + 16]}>
        <mesh>
          <ringGeometry args={[1.6, 2.05, 48]} />
          <meshBasicMaterial color="#FFD166" side={THREE.DoubleSide} />
        </mesh>
        <mesh>
          <circleGeometry args={[1.6, 48]} />
          <meshBasicMaterial color={isDark ? '#F5B82E' : '#FEF3C7'} transparent opacity={0.28} />
        </mesh>
      </group>

      {/* Angled Museum Stations */}
      {leaders.map((leader, idx) => (
        <HallWallStation
          key={leader.userId}
          leader={leader}
          index={idx}
          theme={theme}
          selected={selectedId === leader.userId}
          onSelect={(zPos, sideX) => onSelectLeader(leader, zPos, sideX)}
        />
      ))}
    </>
  );
}

export function HallOfSolversExperience({
  leaders,
  theme,
  period,
  onChangePeriod,
  activeView,
  isAdmin,
  unreadMessagesCount,
  currentUser,
  profile,
  onToggleTheme,
  onSwitchTo2d,
  onNavigate,
  onOpenAskDoubt,
  onSignInGoogle,
  onSignOut,
}: HallOfSolversExperienceProps) {
  const isSoftwareGl = useMemo(() => detectSoftwareWebGL(), []);
  const isDark = theme === 'dark';
  const stageBg = isDark ? '#191105' : '#FCF6E2';

  const walkZ = useRef(5);
  const targetCameraX = useRef(0);
  const dragRef = useRef<{ active: boolean; lastY: number; moved: number }>({
    active: false,
    lastY: 0,
    moved: 0,
  });

  const [selectedLeader, setSelectedLeader] = useState<HallLeaderDisplay | null>(null);
  const [activeWallIdx, setActiveWallIdx] = useState(1);

  const maxDepth = -Math.max(2, leaders.length) * HALL_STATION_SPACING;

  const stepCorridor = (deltaZ: number) => {
    walkZ.current = Math.min(4, Math.max(maxDepth, walkZ.current + deltaZ));
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedLeader) {
        setSelectedLeader(null);
        targetCameraX.current = 0;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedLeader]);

  const handleSelectStation = (leader: HallLeaderDisplay, zPos: number, sideX: number) => {
    if (dragRef.current.moved > 6) return;
    walkZ.current = zPos + 5.6;
    targetCameraX.current = sideX;
    setSelectedLeader(leader);
  };

  const handleCloseSpotlight = () => {
    setSelectedLeader(null);
    targetCameraX.current = 0;
  };

  const displayName = currentUser?.isAnonymous
    ? 'Guest'
    : profile?.displayName || currentUser?.displayName || 'Student';
  const vaultCredits = profile?.totalCreditsEarned ?? 0;

  return (
    <div
      data-testid="hall-of-fame-3d-wall"
      onWheel={(e) => {
        if (selectedLeader) return;
        stepCorridor(-e.deltaY * 0.025);
      }}
      onPointerDown={(e) => {
        if (selectedLeader || (e.target as HTMLElement).closest('button,input,header,nav')) return;
        dragRef.current = { active: true, lastY: e.clientY, moved: 0 };
      }}
      onPointerMove={(e) => {
        if (!dragRef.current.active || selectedLeader) return;
        const dy = e.clientY - dragRef.current.lastY;
        dragRef.current.lastY = e.clientY;
        dragRef.current.moved += Math.abs(dy);
        stepCorridor(dy * 0.055);
      }}
      onPointerUp={() => {
        dragRef.current.active = false;
        window.setTimeout(() => {
          dragRef.current.moved = 0;
        }, 50);
      }}
      onPointerLeave={() => {
        dragRef.current.active = false;
      }}
      className="relative w-full h-screen overflow-hidden select-none"
      style={{ backgroundColor: stageBg }}
    >
      {/* Floating Golden Top Bar */}
      <header className="absolute top-3 inset-x-0 z-40 px-3 sm:px-6 pointer-events-none">
        <div className="max-w-[1400px] mx-auto flex flex-wrap items-center justify-between gap-2.5 px-4 py-2 rounded-2xl border shadow-xl pointer-events-auto transition-colors bg-white/95 border-2 border-[#090B10]/20 text-[#090B10] dark:bg-[#140E05]/92 dark:border-[#F5B82E]/35 dark:text-[#FFF8E7]">
          <div className="flex items-center gap-2.5 shrink-0">
            <NexusLogo size={26} />
            <div className="leading-tight">
              <div className="flex items-center gap-1.5">
                <span className="font-display font-extrabold text-sm tracking-tight">
                  HALL OF FAME
                </span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#FEF3C7] text-[#92400E] border border-[#D97706]/50 dark:bg-[#F5B82E]/20 dark:text-[#FFD166] dark:border-[#F5B82E]/50">
                  <Trophy className="w-3 h-3" />
                  GOLDEN GALLERY
                </span>
              </div>
              <p className="text-[10px] font-mono hidden sm:block text-[#475569] dark:text-[#D4B872]">
                {leaders.length} honored solvers · Scroll, drag or W/S to walk · Click frame to spotlight
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Period Selector */}
            <div
              role="tablist"
              aria-label="Hall of Fame period"
              className="inline-flex items-center gap-1 p-1 rounded-full border border-[#090B10]/15 bg-[#FCF8EC] dark:bg-[#0B0804] dark:border-[#F5B82E]/30"
            >
              <button
                type="button"
                role="tab"
                aria-selected={period === 'all_time'}
                onClick={() => onChangePeriod('all_time')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  period === 'all_time'
                    ? 'bg-[#090B10] text-[#FFD166] dark:bg-[#F5B82E] dark:text-[#0B0804]'
                    : 'text-[#3F4A5F] hover:text-[#090B10] dark:text-[#D4B872] dark:hover:text-white'
                }`}
              >
                All Time
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={period === 'month'}
                onClick={() => onChangePeriod('month')}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                  period === 'month'
                    ? 'bg-[#090B10] text-[#FFD166] dark:bg-[#F5B82E] dark:text-[#0B0804]'
                    : 'text-[#3F4A5F] hover:text-[#090B10] dark:text-[#D4B872] dark:hover:text-white'
                }`}
              >
                This Month
              </button>
            </div>

            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={isDark ? 'Switch to Light theme' : 'Switch to Dark theme'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#090B10]/20 bg-[#FCF8EC] text-[#090B10] hover:border-[#090B10] dark:bg-white/10 dark:border-[#F5B82E]/30 dark:text-[#FFD166] text-xs font-semibold transition-colors"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span className="hidden md:inline">{isDark ? 'Light' : 'Dark'}</span>
            </button>

            <button
              type="button"
              onClick={onSwitchTo2d}
              title="Switch to 2D Standings View"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#090B10]/25 bg-white text-[#090B10] hover:bg-[#FEF3C7] dark:bg-white/10 dark:border-[#F5B82E]/40 dark:text-[#FFF8E7] dark:hover:bg-[#F5B82E]/20 text-xs font-semibold transition-colors"
            >
              <LayoutGrid className="w-3.5 h-3.5 text-[#D97706] dark:text-[#FFD166]" />
              <span>2D View</span>
            </button>

            {currentUser && !currentUser.isAnonymous ? (
              <div className="flex items-center gap-1.5">
                <div className="inline-flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full border border-[#090B10]/20 bg-[#FCF8EC] dark:bg-white/10 dark:border-[#F5B82E]/30 text-xs">
                  <UserAvatar
                    name={displayName}
                    photoURL={profile?.photoURL || currentUser.photoURL || undefined}
                    size="xs"
                  />
                  <span className="hidden lg:inline font-semibold max-w-[90px] truncate">
                    {displayName}
                  </span>
                  <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-[#92400E] dark:text-[#FFD166]">
                    <Award className="w-3 h-3" />
                    {vaultCredits}
                  </span>
                </div>
                <button
                  type="button"
                  aria-label="Sign out"
                  onClick={() => void onSignOut()}
                  className="w-8 h-8 rounded-full border border-[#090B10]/20 bg-[#FCF8EC] dark:bg-white/10 dark:border-[#F5B82E]/30 inline-flex items-center justify-center"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void onSignInGoogle()}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#EF233C] hover:bg-[#DC2626] text-white text-xs font-semibold transition-colors whitespace-nowrap shadow-md"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{currentUser?.isAnonymous ? 'Guest · Sign in' : 'Sign in'}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Minimal Bottom-Left Depth Pill (zero clunky arrows/prev/next buttons) */}
      <div className="absolute left-4 sm:left-6 bottom-6 z-30 hidden md:flex items-center gap-2 px-3.5 py-1.5 rounded-full border-2 border-[#090B10]/20 bg-white/95 text-[#090B10] dark:bg-[#140E05]/90 dark:border-[#F5B82E]/35 dark:text-[#FFD166] font-mono text-xs font-semibold pointer-events-none">
        <span>
          Hall Frame {activeWallIdx} / {Math.max(1, leaders.length)} · Scroll or drag
        </span>
      </div>

      {/* Bottom Floating Navigation Dock */}
      <Dock
        activeView={activeView}
        isAdmin={isAdmin}
        unreadMessagesCount={unreadMessagesCount}
        theme={theme}
        onNavigate={onNavigate}
        onOpenAskDoubt={onOpenAskDoubt}
      />

      {/* Full-Viewport Golden 3D Hall Canvas */}
      <Canvas
        dpr={isSoftwareGl ? 1 : [1, 1.75]}
        gl={{ antialias: !isSoftwareGl, powerPreference: 'high-performance' }}
        camera={{ position: [0, 2.15, 5], fov: 56, near: 0.1, far: 150 }}
      >
        <color attach="background" args={[stageBg]} />
        <fogExp2 attach="fog" args={[stageBg, isDark ? 0.017 : 0.01]} />

        <HallGalleryCorridor
          leaders={leaders}
          theme={theme}
          walkZ={walkZ}
          targetCameraX={targetCameraX}
          selectedId={selectedLeader?.userId ?? null}
          onSelectLeader={handleSelectStation}
          onSyncWalk={(z) => {
            const idx = Math.min(
              Math.max(1, leaders.length),
              Math.max(1, Math.floor(Math.max(0, 5 - z) / HALL_STATION_SPACING) + 1),
            );
            setActiveWallIdx(idx);
          }}
        />
      </Canvas>

      {/* Spotlight Overlay when clicking a framed solver */}
      {selectedLeader && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-sm"
          onClick={handleCloseSpotlight}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-lg w-full rounded-2xl border-2 border-[#090B10] dark:border-[#F5B82E] bg-[#FFFDF7] dark:bg-[#140E05] text-[#090B10] dark:text-[#FFF8E7] p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="px-2.5 py-1 rounded-lg font-mono text-sm font-extrabold shrink-0"
                  style={{
                    backgroundColor: getMedalColor(selectedLeader.rank),
                    color: '#090B10',
                  }}
                >
                  #{selectedLeader.rank}
                </span>
                <UserAvatar
                  name={selectedLeader.displayName}
                  photoURL={selectedLeader.photoURL}
                  size="md"
                />
                <div className="min-w-0">
                  <h2 className="font-display font-extrabold text-xl truncate">
                    {selectedLeader.displayName}
                  </h2>
                  <p className="text-xs font-mono text-[#475569] dark:text-[#D4B872]">
                    {selectedLeader.branch || 'Engineering'} · {selectedLeader.year || 'Peer Mentor'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Back to Golden Hall"
                onClick={handleCloseSpotlight}
                className="w-8 h-8 rounded-full border border-[#090B10]/20 dark:border-[#F5B82E]/35 flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="rounded-xl p-3.5 bg-[#FEF8E6] dark:bg-white/5 border border-[#D97706]/40 dark:border-[#F5B82E]/25 space-y-1.5">
              <p className="text-sm font-medium italic">
                “{selectedLeader.highlightQuote}”
              </p>
              <p className="text-xs font-mono text-[#92400E] dark:text-[#FFD166]">
                Signature solved: {selectedLeader.featuredDoubt}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedLeader.topics.map((tp) => (
                <span
                  key={tp}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono font-semibold border"
                  style={{
                    borderColor: isDark ? getTopicAccent(tp) : getTopicLightInk(tp),
                    color: isDark ? getTopicAccent(tp) : getTopicLightInk(tp),
                    backgroundColor: isDark ? `${getTopicAccent(tp)}1A` : '#FFFFFF',
                  }}
                >
                  {tp}
                </span>
              ))}
              {selectedLeader.isDemo && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold bg-[#FEF2F2] text-[#B91C1C] border border-[#EF233C]/40 dark:bg-[#EF233C]/20 dark:text-[#FCA5A5]">
                  <Sparkles className="w-3 h-3" />
                  Showcase Leader
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#090B10]/15 dark:border-[#F5B82E]/25">
              <div className="flex items-center gap-2.5 font-mono text-xs">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#090B10] text-[#FFD166] dark:bg-[#F5B82E] dark:text-[#0B0804] font-bold">
                  <Award className="w-4 h-4" />
                  {selectedLeader.totalCredits} credits
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#090B10]/20 dark:border-[#F5B82E]/35 font-semibold">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  {selectedLeader.solvedCount} solved
                </span>
              </div>
              <button
                type="button"
                onClick={handleCloseSpotlight}
                className="px-4 py-1.5 rounded-full bg-[#EF233C] hover:bg-[#DC2626] text-white text-xs font-semibold transition-colors"
              >
                Back to Hall
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
