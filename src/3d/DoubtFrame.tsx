import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { Question, RichAttachment } from '../types/nexus';
import {
  formatRelativeTime,
  formatTimestampRange,
  getInitials,
} from '../utils/nexusLogic';
import { DoubtCrystal } from './DoubtCrystal';
import { soundManager } from './audio';
import { getTopicAccent, getTopicLightInk } from './topicTheme';

interface DoubtFrameProps {
  question: Question | null;
  activeTopic: string;
  position: [number, number, number];
  rotationY: number;
  theme: 'light' | 'dark';
  isSoftwareGl: boolean;
  dimmed: boolean;
  onHoverChange: (hovered: boolean) => void;
  onSelectFrame: (worldCenter: THREE.Vector3, worldNormal: THREE.Vector3) => void;
}

let sharedPoolTex: THREE.CanvasTexture | null = null;
function getPoolTexture(): THREE.CanvasTexture {
  if (sharedPoolTex) return sharedPoolTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
  }
  sharedPoolTex = new THREE.CanvasTexture(c);
  return sharedPoolTex;
}

function roundRectPath(
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

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s+\S*$/, '')}…`;
  }
  return lines;
}

function pickPrimaryAttachment(attachments: RichAttachment[]): RichAttachment | null {
  if (!attachments || attachments.length === 0) return null;
  return (
    attachments.find((a) => a.type === 'image') ??
    attachments.find((a) => a.type === 'youtube') ??
    attachments.find((a) => a.type === 'document') ??
    attachments[0] ??
    null
  );
}

function getAttachmentPreviewUrl(att: RichAttachment | null): string | null {
  if (!att) return null;
  if (att.type === 'image') return att.secureUrl;
  if (att.type === 'youtube' && att.youtubeId) {
    return att.thumbnailUrl || `https://i.ytimg.com/vi/${att.youtubeId}/hqdefault.jpg`;
  }
  if (att.type === 'link' && att.thumbnailUrl) return att.thumbnailUrl;
  return null;
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) return;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function paintCardTexture(
  question: Question | null,
  activeTopic: string,
  theme: 'light' | 'dark',
  maxAniso: number,
  loadedMediaImg: HTMLImageElement | null,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 640;
  const ctx = canvas.getContext('2d');

  const isDark = theme === 'dark';
  const isGhost = !question;
  const isResolved = question?.status === 'resolved';
  const isCritical = question?.urgency === 'critical';
  const isUrgent = question?.urgency === 'urgent';

  const rawTopicAccent = isGhost
    ? getTopicAccent(activeTopic)
    : isResolved
      ? '#10B981'
      : isCritical
        ? '#EF233C'
        : isUrgent
          ? '#D97706'
          : getTopicAccent(question.topic);

  const inkAccent = isGhost
    ? isDark
      ? rawTopicAccent
      : getTopicLightInk(activeTopic)
    : isResolved
      ? isDark
        ? '#34D399'
        : '#047857'
      : isCritical
        ? '#EF233C'
        : isUrgent
          ? isDark
            ? '#FFB020'
            : '#B45309'
          : isDark
            ? rawTopicAccent
            : getTopicLightInk(question.topic);

  if (ctx) {
    // Solid high-contrast card base (opaque crisp white in Light, obsidian black in Dark)
    ctx.fillStyle = isDark ? '#08090F' : '#FFFFFF';
    roundRectPath(ctx, 8, 8, 1008, 624, 34);
    ctx.fill();

    // Top-left subtle tint wash
    const sheen = ctx.createLinearGradient(0, 0, 1024, 640);
    sheen.addColorStop(0, isDark ? `${rawTopicAccent}22` : `${inkAccent}0D`);
    sheen.addColorStop(0.5, 'rgba(0,0,0,0)');
    ctx.fillStyle = sheen;
    roundRectPath(ctx, 8, 8, 1008, 624, 34);
    ctx.fill();

    // Bold 2-layer crisp stroke framing (Jet Black + Crimson/Topic accent in Light; Crimson/Accent glow in Dark)
    if (!isDark) {
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#090B10';
      if (isGhost) ctx.setLineDash([18, 14]);
      roundRectPath(ctx, 8, 8, 1008, 624, 34);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.lineWidth = 4;
      ctx.strokeStyle = isCritical || isGhost ? '#DC2626' : inkAccent;
      roundRectPath(ctx, 18, 18, 988, 604, 28);
      ctx.stroke();
    } else {
      ctx.lineWidth = isGhost ? 4 : 6;
      ctx.strokeStyle = rawTopicAccent;
      if (isGhost) ctx.setLineDash([18, 14]);
      roundRectPath(ctx, 8, 8, 1008, 624, 34);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (isGhost) {
      ctx.textAlign = 'center';
      ctx.fillStyle = isDark ? '#FFFFFF' : '#090B10';
      ctx.font = '800 52px "Plus Jakarta Sans", sans-serif';
      ctx.fillText('Forge a New Doubt', 512, 260);

      ctx.fillStyle = isDark ? '#CBD5E1' : '#334155';
      ctx.font = '600 26px "Plus Jakarta Sans", sans-serif';
      const sub =
        activeTopic === 'All Topics'
          ? 'The Infinite Corridor continues. Launch your question.'
          : `Be the next voice in the ${activeTopic} wing.`;
      ctx.fillText(sub, 512, 326);

      ctx.fillStyle = isDark ? '#EF233C' : '#090B10';
      roundRectPath(ctx, 302, 388, 420, 72, 36);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '700 26px "IBM Plex Mono", monospace';
      ctx.fillText('+ Click to ask a doubt', 512, 434);
    } else {
      const primaryAtt = pickPrimaryAttachment(question.attachments);
      const hasMediaPanel = Boolean(primaryAtt);
      const textWidth = hasMediaPanel ? 550 : 908;

      // Author avatar crest
      ctx.fillStyle = isDark ? `${rawTopicAccent}38` : '#090B10';
      ctx.beginPath();
      ctx.arc(82, 84, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isDark ? rawTopicAccent : '#DC2626';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 24px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(getInitials(question.authorName), 82, 93);

      // Author & Topic metadata
      ctx.textAlign = 'left';
      ctx.fillStyle = isDark ? '#FFFFFF' : '#090B10';
      ctx.font = '800 30px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(question.authorName, 134, 77);

      ctx.fillStyle = isDark ? '#CBD5E1' : '#334155';
      ctx.font = '600 22px "IBM Plex Mono", monospace';
      ctx.fillText(`${formatRelativeTime(question.createdAtMs)}  ·  ${question.topic}`, 134, 111);

      // Top-right High-Contrast Status Badge
      const statusText = isResolved
        ? '✓ Solved'
        : isCritical
          ? 'Critical'
          : isUrgent
            ? 'Urgent'
            : question.topic;
      ctx.font = '700 21px "IBM Plex Mono", monospace';
      const chipW = Math.min(270, ctx.measureText(statusText).width + 44);
      ctx.fillStyle = isResolved
        ? isDark
          ? '#10B981'
          : '#047857'
        : isCritical || isUrgent
          ? '#DC2626'
          : isDark
            ? `${rawTopicAccent}33`
            : '#090B10';
      roundRectPath(ctx, 972 - chipW, 52, chipW, 48, 14);
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.fillStyle =
        isResolved || isCritical || isUrgent
          ? '#FFFFFF'
          : isDark
            ? rawTopicAccent
            : '#FFFFFF';
      ctx.fillText(statusText, 972 - chipW / 2, 84);

      // Question Title
      ctx.textAlign = 'left';
      ctx.fillStyle = isDark ? '#FFFFFF' : '#090B10';
      ctx.font = hasMediaPanel
        ? '800 36px "Plus Jakarta Sans", sans-serif'
        : '800 42px "Plus Jakarta Sans", sans-serif';
      const lineStep = hasMediaPanel ? 46 : 54;
      const titleLines = wrapLines(ctx, question.title, textWidth, 3);
      titleLines.forEach((line, idx) => {
        ctx.fillText(line, 52, 186 + idx * lineStep);
      });

      // Description
      const descStartY = 186 + titleLines.length * lineStep + 16;
      ctx.fillStyle = isDark ? '#CBD5E1' : '#1E293B';
      ctx.font = '500 24px "Plus Jakarta Sans", sans-serif';
      const descLines = wrapLines(ctx, question.description, textWidth, hasMediaPanel ? 3 : 2);
      descLines.forEach((line, idx) => {
        ctx.fillText(line, 52, descStartY + idx * 34);
      });

      // Right-hand Rich Media Preview Window (Images, YouTube Thumbnails + Timestamp, PDFs, Links)
      if (primaryAtt) {
        const px = 632;
        const py = 148;
        const pw = 340;
        const ph = 330;

        ctx.save();
        roundRectPath(ctx, px, py, pw, ph, 22);
        ctx.clip();

        // Preview frame background
        ctx.fillStyle = isDark ? '#111524' : '#0F172A';
        ctx.fillRect(px, py, pw, ph);

        if (loadedMediaImg && (primaryAtt.type === 'image' || primaryAtt.type === 'youtube' || primaryAtt.thumbnailUrl)) {
          drawCoverImage(ctx, loadedMediaImg, px, py, pw, ph - 58);
        } else if (primaryAtt.type === 'youtube') {
          // Stylized YouTube card preview when thumbnail image hasn't loaded or is blocked
          const ytGrad = ctx.createLinearGradient(px, py, px + pw, py + ph - 58);
          ytGrad.addColorStop(0, '#18181B');
          ytGrad.addColorStop(1, '#450A0A');
          ctx.fillStyle = ytGrad;
          ctx.fillRect(px, py, pw, ph - 58);

          ctx.fillStyle = '#EF233C';
          roundRectPath(ctx, px + pw / 2 - 44, py + (ph - 58) / 2 - 30, 88, 60, 16);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(px + pw / 2 - 12, py + (ph - 58) / 2 - 14);
          ctx.lineTo(px + pw / 2 + 18, py + (ph - 58) / 2);
          ctx.lineTo(px + pw / 2 - 12, py + (ph - 58) / 2 + 14);
          ctx.closePath();
          ctx.fill();
        } else if (primaryAtt.type === 'document') {
          const ext = primaryAtt.fileName.split('.').pop()?.toUpperCase() || 'PDF';
          ctx.fillStyle = isDark ? '#151B2E' : '#1E293B';
          ctx.fillRect(px, py, pw, ph - 58);

          // Crisp Document Sheet Mock Preview
          ctx.fillStyle = '#FFFFFF';
          roundRectPath(ctx, px + 88, py + 34, 164, 198, 12);
          ctx.fill();
          ctx.fillStyle = '#EF233C';
          roundRectPath(ctx, px + 88, py + 34, 164, 46, 12);
          ctx.fill();
          ctx.textAlign = 'center';
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '800 22px "IBM Plex Mono", monospace';
          ctx.fillText(ext, px + 170, py + 65);

          ctx.fillStyle = '#CBD5E1';
          ctx.fillRect(px + 108, py + 102, 124, 10);
          ctx.fillRect(px + 108, py + 124, 104, 10);
          ctx.fillRect(px + 108, py + 146, 116, 10);
          ctx.fillRect(px + 108, py + 168, 88, 10);
          ctx.textAlign = 'left';
        } else {
          ctx.fillStyle = '#111827';
          ctx.fillRect(px, py, pw, ph - 58);
          ctx.fillStyle = '#365BEE';
          roundRectPath(ctx, px + 26, py + 48, 288, 168, 16);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '700 24px "IBM Plex Mono", monospace';
          ctx.fillText(primaryAtt.linkDomain || 'EXTERNAL LINK', px + 44, py + 102);
          ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
          const lLines = wrapLines(ctx, primaryAtt.linkTitle || primaryAtt.fileName, 250, 2);
          lLines.forEach((ln, i) => ctx.fillText(ln, px + 44, py + 144 + i * 28));
        }

        // Play button overlay for YouTube when thumbnail loaded
        if (primaryAtt.type === 'youtube' && loadedMediaImg) {
          ctx.fillStyle = 'rgba(239, 35, 60, 0.94)';
          roundRectPath(ctx, px + pw / 2 - 36, py + (ph - 58) / 2 - 24, 72, 48, 14);
          ctx.fill();
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.moveTo(px + pw / 2 - 10, py + (ph - 58) / 2 - 12);
          ctx.lineTo(px + pw / 2 + 16, py + (ph - 58) / 2);
          ctx.lineTo(px + pw / 2 - 10, py + (ph - 58) / 2 + 12);
          ctx.closePath();
          ctx.fill();
        }

        // Bottom caption bar inside media frame
        ctx.fillStyle = 'rgba(8, 9, 15, 0.94)';
        ctx.fillRect(px, py + ph - 58, pw, 58);

        const typeTag =
          primaryAtt.type === 'image'
            ? 'IMAGE'
            : primaryAtt.type === 'youtube'
              ? formatTimestampRange(primaryAtt.startSeconds, primaryAtt.endSeconds) || 'YOUTUBE'
              : primaryAtt.type === 'document'
                ? 'FILE'
                : 'LINK';
        ctx.fillStyle = primaryAtt.type === 'youtube' ? '#EF233C' : '#365BEE';
        roundRectPath(ctx, px + 12, py + ph - 45, 96, 32, 8);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '700 15px "IBM Plex Mono", monospace';
        ctx.fillText(typeTag.slice(0, 11), px + 60, py + ph - 24);

        ctx.textAlign = 'left';
        ctx.fillStyle = '#F8FAFC';
        ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
        const cap = primaryAtt.linkTitle || primaryAtt.fileName;
        const capTrim = cap.length > 22 ? `${cap.slice(0, 21)}…` : cap;
        ctx.fillText(capTrim, px + 118, py + ph - 24);

        ctx.restore();

        // Media frame crisp border
        ctx.lineWidth = 3;
        ctx.strokeStyle = isDark ? `${rawTopicAccent}AA` : '#090B10';
        roundRectPath(ctx, px, py, pw, ph, 22);
        ctx.stroke();

        // Extra attachment count pill if > 1
        if (question.attachments.length > 1) {
          ctx.fillStyle = '#090B10';
          roundRectPath(ctx, px + pw - 96, py + 12, 84, 30, 10);
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.textAlign = 'center';
          ctx.fillStyle = '#FFFFFF';
          ctx.font = '700 15px "IBM Plex Mono", monospace';
          ctx.fillText(`+${question.attachments.length - 1} more`, px + pw - 54, py + 32);
          ctx.textAlign = 'left';
        }
      }

      // Bottom Divider
      ctx.strokeStyle = isDark ? 'rgba(255,255,255,0.18)' : '#CBD5E1';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(52, 514);
      ctx.lineTo(972, 514);
      ctx.stroke();

      // Credit bounty pill (high contrast)
      const pending = question.assessmentStatus === 'pending';
      const creditText = pending
        ? 'AI assessing…'
        : `+${question.assignedCredits} credits`;
      ctx.fillStyle = pending
        ? isDark
          ? '#312E81'
          : '#E0E7FF'
        : isDark
          ? 'rgba(200, 237, 98, 0.22)'
          : '#ECFDF5';
      roundRectPath(ctx, 52, 536, 260, 56, 14);
      ctx.fill();
      ctx.strokeStyle = pending
        ? '#6366F1'
        : isDark
          ? '#C8ED62'
          : '#047857';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.fillStyle = pending
        ? isDark
          ? '#E0E7FF'
          : '#312E81'
        : isDark
          ? '#C8ED62'
          : '#065F46';
      ctx.font = '700 25px "IBM Plex Mono", monospace';
      ctx.fillText(creditText, 76, 573);

      // Likes + answers counters on right
      ctx.textAlign = 'right';
      ctx.fillStyle = isDark ? '#F1F5F9' : '#090B10';
      ctx.font = '600 24px "IBM Plex Mono", monospace';
      const ansWord = question.answerCount === 1 ? 'answer' : 'answers';
      ctx.fillText(
        `♥ ${question.likeCount} have this  ·  ${question.answerCount} ${ansWord}`,
        970,
        573,
      );
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, maxAniso || 1);
  tex.needsUpdate = true;
  return tex;
}

const _cardWorld = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _normal = new THREE.Vector3();

export function DoubtFrame({
  question,
  activeTopic,
  position,
  rotationY,
  theme,
  isSoftwareGl,
  dimmed,
  onHoverChange,
  onSelectFrame,
}: DoubtFrameProps) {
  const { gl } = useThree();
  const [hovered, setHovered] = useState(false);
  const [loadedMediaImg, setLoadedMediaImg] = useState<HTMLImageElement | null>(null);
  const groupRef = useRef<THREE.Group>(null);
  const cardMeshRef = useRef<THREE.Mesh>(null);
  const poolRef = useRef<THREE.Mesh>(null);

  const hoverAnim = useRef(0);
  const dimAnim = useRef(1);

  const isDark = theme === 'dark';
  const isResolved = question?.status === 'resolved';
  const isCritical = question?.urgency === 'critical';
  const isUrgent = question?.urgency === 'urgent';

  const frameAccent = !question
    ? getTopicAccent(activeTopic)
    : isResolved
      ? '#10B981'
      : isCritical
        ? '#EF233C'
        : isUrgent
          ? '#F59E0B'
          : getTopicAccent(question.topic);

  const primaryAtt = question ? pickPrimaryAttachment(question.attachments) : null;
  const mediaPreviewUrl = getAttachmentPreviewUrl(primaryAtt);

  useEffect(() => {
    let active = true;
    if (!mediaPreviewUrl) {
      setLoadedMediaImg(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (active) setLoadedMediaImg(img);
    };
    img.onerror = () => {
      if (active) setLoadedMediaImg(null);
    };
    img.src = mediaPreviewUrl;
    return () => {
      active = false;
    };
  }, [mediaPreviewUrl]);

  const maxAniso = gl.capabilities.getMaxAnisotropy();
  const attachmentSignature = question?.attachments
    ?.map((a) => `${a.id}:${a.secureUrl}`)
    .join('|');

  const cardTexture = useMemo(
    () => paintCardTexture(question, activeTopic, theme, maxAniso, loadedMediaImg),
    [
      question?.id,
      question?.title,
      question?.description,
      question?.status,
      question?.likeCount,
      question?.answerCount,
      question?.assignedCredits,
      question?.assessmentStatus,
      attachmentSignature,
      loadedMediaImg,
      activeTopic,
      theme,
      maxAniso,
    ],
  );

  useEffect(() => {
    return () => {
      cardTexture.dispose();
    };
  }, [cardTexture]);

  const poolTex = useMemo(() => getPoolTexture(), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    hoverAnim.current += ((hovered ? 1 : 0) - hoverAnim.current) * Math.min(1, dt * 8);
    dimAnim.current += ((dimmed && !hovered ? 0.62 : 1) - dimAnim.current) * Math.min(1, dt * 6);

    if (cardMeshRef.current) {
      cardMeshRef.current.position.z = 0.42 * hoverAnim.current;
      cardMeshRef.current.scale.setScalar(1 + 0.065 * hoverAnim.current);
      const mat = cardMeshRef.current.material as THREE.MeshBasicMaterial;
      mat.color.setScalar(dimAnim.current);
    }

    if (poolRef.current) {
      const pMat = poolRef.current.material as THREE.MeshBasicMaterial;
      pMat.opacity = (isDark ? 0.36 : 0.12) + 0.22 * hoverAnim.current;
    }
  });

  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (!groupRef.current) return;
    groupRef.current.updateWorldMatrix(true, false);
    _cardWorld.set(0, 1.95, 0).applyMatrix4(groupRef.current.matrixWorld);
    groupRef.current.getWorldQuaternion(_quat);
    _normal.set(0, 0, 1).applyQuaternion(_quat).normalize();
    onSelectFrame(_cardWorld.clone(), _normal.clone());
  };

  return (
    <group ref={groupRef} position={position} rotation={[0, rotationY, 0]}>
      {/* Topic-Specific 3D Logo Sculpture floating above card */}
      <DoubtCrystal
        question={question}
        position={[0, 3.68, 0]}
        isSoftwareGl={isSoftwareGl}
        theme={theme}
        hovered={hovered}
      />

      {/* High-DPI 3D Card Plane (100% crisp opaque white in Light mode, obsidian in Dark mode) */}
      <mesh
        ref={cardMeshRef}
        position={[0, 1.95, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onHoverChange(true);
          soundManager.playGlassTick();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          onHoverChange(false);
          document.body.style.cursor = 'auto';
        }}
        onClick={handleClick}
      >
        <planeGeometry args={[3.65, 2.28]} />
        <meshBasicMaterial map={cardTexture} transparent={isDark} />
      </mesh>

      {/* Floor Neon Reflection Pool */}
      <mesh
        ref={poolRef}
        position={[0, 0.03, 1.1]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[4.8, 4.8, 1]}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={poolTex}
          color={frameAccent}
          transparent
          opacity={isDark ? 0.36 : 0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
