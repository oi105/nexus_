import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Question } from '../types/nexus';
import { getTopicAccent, getTopicShortMark } from './topicTheme';

interface DoubtCrystalProps {
  question?: Question | null;
  position: [number, number, number];
  isSoftwareGl?: boolean;
  theme?: 'light' | 'dark';
  hovered?: boolean;
}

let sharedGlowTexture: THREE.CanvasTexture | null = null;
function getGlowTexture(): THREE.CanvasTexture {
  if (sharedGlowTexture) return sharedGlowTexture;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.32, 'rgba(255,255,255,0.42)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  sharedGlowTexture = new THREE.CanvasTexture(c);
  return sharedGlowTexture;
}

function createTopicBadgeTexture(topic: string, accent: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 256);

    // Outer hexagonal / circular medallion backdrop
    ctx.fillStyle = '#0B1020';
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const ang = (Math.PI / 3) * i - Math.PI / 6;
      const x = 128 + Math.cos(ang) * 112;
      const y = 128 + Math.sin(ang) * 112;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.lineWidth = 10;
    ctx.strokeStyle = accent;
    ctx.stroke();

    // Inner subtle tint ring
    ctx.fillStyle = `${accent}22`;
    ctx.beginPath();
    ctx.arc(128, 128, 86, 0, Math.PI * 2);
    ctx.fill();

    const mark = getTopicShortMark(topic);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (topic === 'C++') {
      ctx.fillStyle = '#00E5FF';
      ctx.font = '800 84px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('C++', 128, 130);
    } else if (topic === 'Python') {
      // Iconic dual-dot snake crest + Py monogram
      ctx.fillStyle = '#3776AB';
      ctx.beginPath();
      ctx.roundRect(78, 66, 66, 54, 18);
      ctx.fill();
      ctx.fillStyle = '#FFD43B';
      ctx.beginPath();
      ctx.roundRect(112, 136, 66, 54, 18);
      ctx.fill();
      ctx.fillStyle = '#0B1020';
      ctx.beginPath();
      ctx.arc(98, 86, 6, 0, Math.PI * 2);
      ctx.arc(158, 170, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 42px "IBM Plex Mono", monospace';
      ctx.fillText('Py', 128, 128);
    } else if (topic === 'CAD and AutoCAD') {
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(128, 56);
      ctx.lineTo(74, 194);
      ctx.moveTo(128, 56);
      ctx.lineTo(182, 194);
      ctx.moveTo(92, 148);
      ctx.lineTo(164, 148);
      ctx.stroke();
    } else if (topic === 'Mathematics') {
      ctx.fillStyle = '#FFB020';
      ctx.font = '800 108px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Σ', 128, 132);
    } else if (topic === 'UI/UX') {
      ctx.strokeStyle = '#FF7AC6';
      ctx.lineWidth = 8;
      ctx.strokeRect(72, 76, 76, 76);
      ctx.fillStyle = '#FF7AC633';
      ctx.fillRect(108, 108, 76, 76);
      ctx.strokeRect(108, 108, 76, 76);
    } else {
      ctx.fillStyle = '#F3F5FB';
      ctx.font = `800 ${mark.length >= 3 ? 66 : 82}px "IBM Plex Mono", monospace`;
      ctx.fillText(mark, 128, 132);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Distinctive 3D Topic Logo Sculptures replacing generic diamond shapes:
 * - DSA: Connected 3D Graph nodes & edges
 * - DBMS: Stacked 3D database cylinder discs
 * - CAD/AutoCAD: Isometric 3D wireframe cube + compass medallion
 * - Debugging: Target crosshair reticle rings + pulse core
 * - Mathematics: Interlocking orbital torus-knot sculpture + Sigma crest
 * - C++, Python, UI/UX, Programming, etc.: Floating sculptural 3D topic medallion + orbital collar
 */
export function DoubtCrystal({
  question,
  position,
  theme = 'dark',
  hovered = false,
}: DoubtCrystalProps) {
  const sculptureRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  const topic = question?.topic || 'All Topics';
  const isResolved = question?.status === 'resolved';
  const isCritical = question?.urgency === 'critical';
  const accent = isResolved ? '#C8ED62' : isCritical ? '#FF694F' : getTopicAccent(topic);

  const glowTex = useMemo(() => getGlowTexture(), []);
  const badgeTex = useMemo(() => createTopicBadgeTexture(topic, accent), [topic, accent]);

  useEffect(() => {
    return () => {
      badgeTex.dispose();
    };
  }, [badgeTex]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    if (sculptureRef.current) {
      sculptureRef.current.rotation.y += delta * (hovered ? 1.55 : isCritical ? 1.15 : 0.55);
      sculptureRef.current.position.y = Math.sin(t * 1.8 + position[2]) * 0.06;
    }
    if (ringRef.current) {
      ringRef.current.rotation.z += delta * 0.45;
    }
  });

  const isDark = theme === 'dark';

  return (
    <group position={position}>
      {/* Soft additive neon aura behind topic emblem */}
      <sprite scale={hovered ? [2.1, 2.1, 1] : [1.55, 1.55, 1]}>
        <spriteMaterial
          map={glowTex}
          color={accent}
          transparent
          opacity={isDark ? (hovered ? 0.85 : 0.58) : 0.25}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </sprite>

      {/* Topic-specific 3D Sculpture */}
      <group ref={sculptureRef}>
        {topic === 'DSA' ? (
          /* 3D Connected Binary Tree / Graph Nodes */
          <group>
            <mesh position={[0, 0.28, 0]}>
              <sphereGeometry args={[0.14, 16, 16]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.75} roughness={0.2} />
            </mesh>
            <mesh position={[-0.26, -0.14, 0]}>
              <sphereGeometry args={[0.11, 14, 14]} />
              <meshStandardMaterial color="#C8ED62" emissive="#C8ED62" emissiveIntensity={0.65} roughness={0.2} />
            </mesh>
            <mesh position={[0.26, -0.14, 0]}>
              <sphereGeometry args={[0.11, 14, 14]} />
              <meshStandardMaterial color="#00E5FF" emissive="#00E5FF" emissiveIntensity={0.65} roughness={0.2} />
            </mesh>
            <mesh position={[-0.13, 0.07, 0]} rotation={[0, 0, -0.55]}>
              <cylinderGeometry args={[0.024, 0.024, 0.48, 8]} />
              <meshStandardMaterial color="#E2E8F0" emissive={accent} emissiveIntensity={0.4} />
            </mesh>
            <mesh position={[0.13, 0.07, 0]} rotation={[0, 0, 0.55]}>
              <cylinderGeometry args={[0.024, 0.024, 0.48, 8]} />
              <meshStandardMaterial color="#E2E8F0" emissive={accent} emissiveIntensity={0.4} />
            </mesh>
            <mesh position={[0, -0.14, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.02, 0.02, 0.52, 8]} />
              <meshStandardMaterial color="#94A3B8" emissive={accent} emissiveIntensity={0.35} />
            </mesh>
          </group>
        ) : topic === 'DBMS' ? (
          /* 3D Stacked Relational Database Cylinders */
          <group>
            {[-0.2, 0, 0.2].map((y, idx) => (
              <group key={idx} position={[0, y, 0]}>
                <mesh>
                  <cylinderGeometry args={[0.3, 0.3, 0.13, 24]} />
                  <meshStandardMaterial
                    color={isDark ? '#141B2D' : '#E2E8F0'}
                    emissive={accent}
                    emissiveIntensity={0.22}
                    metalness={0.55}
                    roughness={0.25}
                  />
                </mesh>
                <mesh position={[0, 0.065, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.3, 0.016, 8, 28]} />
                  <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.95} />
                </mesh>
              </group>
            ))}
          </group>
        ) : topic === 'Debugging' ? (
          /* 3D Crosshair Target Reticle Emblem */
          <group>
            <mesh>
              <torusGeometry args={[0.32, 0.032, 12, 32]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.85} />
            </mesh>
            <mesh rotation={[0, Math.PI / 2, 0]}>
              <torusGeometry args={[0.21, 0.022, 10, 28]} />
              <meshStandardMaterial color="#FFB020" emissive="#FFB020" emissiveIntensity={0.75} />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.1, 14, 14]} />
              <meshStandardMaterial color="#FFFFFF" emissive={accent} emissiveIntensity={1.1} />
            </mesh>
          </group>
        ) : topic === 'Mathematics' ? (
          /* 3D Torus-Knot Geometry + Sigma Crest */
          <group>
            <mesh scale={0.62}>
              <torusKnotGeometry args={[0.36, 0.09, 64, 12, 2, 3]} />
              <meshStandardMaterial
                color={accent}
                emissive={accent}
                emissiveIntensity={0.65}
                roughness={0.2}
                metalness={0.45}
              />
            </mesh>
          </group>
        ) : (
          /* 3D Metallic Medallion Disc with Crisp Topic Emblem (C++, Python, AutoCAD, UI/UX, Programming, etc.) */
          <group>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.42, 0.42, 0.08, 6]} />
              <meshStandardMaterial
                color={isDark ? '#11182B' : '#1E293B'}
                emissive={accent}
                emissiveIntensity={0.28}
                metalness={0.65}
                roughness={0.25}
              />
            </mesh>
            {/* Front & back topic logo faces */}
            <mesh position={[0, 0, 0.044]}>
              <planeGeometry args={[0.68, 0.68]} />
              <meshBasicMaterial map={badgeTex} transparent />
            </mesh>
            <mesh position={[0, 0, -0.044]} rotation={[0, Math.PI, 0]}>
              <planeGeometry args={[0.68, 0.68]} />
              <meshBasicMaterial map={badgeTex} transparent />
            </mesh>
            {/* Glowing perimeter ring */}
            <mesh>
              <torusGeometry args={[0.44, 0.02, 8, 24]} />
              <meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={0.95} />
            </mesh>
          </group>
        )}
      </group>

      {/* Orbital accent ring */}
      <mesh ref={ringRef} rotation={[Math.PI / 2.6, 0.25, 0]}>
        <torusGeometry args={[0.56, 0.015, 8, 36]} />
        <meshStandardMaterial
          color={accent}
          emissive={accent}
          emissiveIntensity={isDark ? 0.7 : 0.3}
          roughness={0.25}
          metalness={0.5}
        />
      </mesh>
    </group>
  );
}
