import 'dotenv/config';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, Type } from '@google/genai';
import { isValidCloudinaryCredentialPair } from './src/utils/nexusLogic';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const MAX_AI_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_AI_TEXT_DOC_BYTES = 32 * 1024;
const UPLOADS_DIR = path.resolve(__dirname, 'uploads');

try {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch (err) {
  console.warn('Could not pre-create uploads directory:', err);
}

const MIME_EXTENSION_MAP: Record<string, { ext: string; inline: boolean }> = {
  'image/jpeg': { ext: 'jpg', inline: true },
  'image/jpg': { ext: 'jpg', inline: true },
  'image/png': { ext: 'png', inline: true },
  'image/webp': { ext: 'webp', inline: true },
  'application/pdf': { ext: 'pdf', inline: true },
  'application/msword': { ext: 'doc', inline: false },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', inline: false },
  'application/vnd.ms-powerpoint': { ext: 'ppt', inline: false },
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', inline: false },
  'text/plain': { ext: 'txt', inline: false },
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
};

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  if (buffer.byteLength === 0) return false;
  const mime = mimeType.toLowerCase();

  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return buffer.byteLength >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (mime === 'image/png') {
    return (
      buffer.byteLength >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }
  if (mime === 'image/webp') {
    return (
      buffer.byteLength >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    );
  }
  if (mime === 'application/pdf') {
    return buffer.byteLength >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  }
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    return buffer.byteLength >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  }
  if (mime === 'application/msword' || mime === 'application/vnd.ms-powerpoint') {
    const isOle =
      buffer.byteLength >= 4 &&
      buffer[0] === 0xd0 &&
      buffer[1] === 0xcf &&
      buffer[2] === 0x11 &&
      buffer[3] === 0xe0;
    const isZip = buffer.byteLength >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;
    return isOle || isZip;
  }
  if (mime === 'text/plain') {
    const sample = buffer.subarray(0, Math.min(8192, buffer.byteLength));
    return !sample.includes(0);
  }
  return false;
}

const DIFFICULTY_REWARD_MAP = {
  QUICK_FIX: 5,
  STANDARD: 10,
  CHALLENGING: 20,
  ADVANCED: 30,
} as const;

type DifficultyTier = keyof typeof DIFFICULTY_REWARD_MAP;

const ALLOWED_UPLOAD_MIME_TYPES = new Set(Object.keys(MIME_EXTENSION_MAP));

// Controlled retry throttle map per questionId (prevents spam retries on server)
const assessmentAttemptTimestamps = new Map<string, number>();

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function isSafePublicHttpUrl(rawUrl: string): { ok: true; url: URL } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { ok: false, error: 'Please enter a valid URL starting with https:// or http://.' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, error: 'Only http:// and https:// links are allowed.' };
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    return { ok: false, error: 'Private or local network URLs cannot be previewed.' };
  }
  return { ok: true, url: parsed };
}

function decodeBasicHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaContent(html: string, attrName: string, attrValue: string): string | null {
  const metaTags = html.match(/<meta\s+[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    const attrPattern = new RegExp(`${attrName}\\s*=\\s*["']${attrValue}["']`, 'i');
    if (attrPattern.test(tag)) {
      const contentMatch = tag.match(/content\s*=\s*["']([^"']{1,400})["']/i);
      if (contentMatch?.[1]) {
        return decodeBasicHtmlEntities(contentMatch[1]);
      }
    }
  }
  return null;
}

function extractTitleTag(html: string): string | null {
  const match = html.match(/<title[^>]*>([^<]{1,240})<\/title>/i);
  return match?.[1] ? decodeBasicHtmlEntities(match[1]) : null;
}

async function prepareAttachmentContext(attachments: unknown[]) {
  const incomingAttachments = Array.isArray(attachments) ? attachments.slice(0, 6) : [];
  const analyzedAttachments: string[] = [];
  const skippedAttachments: { name: string; reason: string }[] = [];
  const imageParts: Array<{ inlineData: { mimeType: string; data: string } }> = [];
  const attachmentContextLines: string[] = [];

  for (const item of incomingAttachments) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const attType = String(record.type ?? '');
    const attName = String(record.fileName || record.linkTitle || 'Attachment').slice(0, 120);
    const secureUrl = typeof record.secureUrl === 'string' ? record.secureUrl : '';
    const mimeType = typeof record.mimeType === 'string' ? record.mimeType.toLowerCase() : '';

    if (attType === 'image' && secureUrl) {
      const localMatch = secureUrl.match(/^\/api\/uploads\/file\/([a-zA-Z0-9_-]{1,80}\.(jpg|jpeg|png|webp))$/i);
      if (localMatch) {
        try {
          const resolved = path.resolve(UPLOADS_DIR, localMatch[1]);
          if (resolved.startsWith(UPLOADS_DIR + path.sep)) {
            const buf = await fs.promises.readFile(resolved);
            const ext = localMatch[2].toLowerCase();
            const localMime = EXT_TO_MIME[ext] || 'image/png';
            if (buf.byteLength > 0 && buf.byteLength <= MAX_AI_IMAGE_BYTES) {
              imageParts.push({
                inlineData: {
                  mimeType: localMime,
                  data: buf.toString('base64'),
                },
              });
              analyzedAttachments.push(attName);
              attachmentContextLines.push(`Image attached and visually inspected: ${attName}`);
              continue;
            }
          }
        } catch {
          skippedAttachments.push({
            name: attName,
            reason: 'Could not read stored attachment image for AI vision analysis.',
          });
          continue;
        }
      }

      const safeUrl = isSafePublicHttpUrl(secureUrl);
      if (!safeUrl.ok) {
        skippedAttachments.push({
          name: attName,
          reason: 'Local or private image URL not accessible to server AI.',
        });
        continue;
      }
      try {
        const imgRes = await fetch(safeUrl.url.toString(), {
          signal: AbortSignal.timeout(4000),
        });
        const mime = (imgRes.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (
          imgRes.ok &&
          (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp' || mime === 'image/gif')
        ) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          if (buf.byteLength > 0 && buf.byteLength <= MAX_AI_IMAGE_BYTES) {
            imageParts.push({
              inlineData: {
                mimeType: mime,
                data: buf.toString('base64'),
              },
            });
            analyzedAttachments.push(attName);
            attachmentContextLines.push(`Image attached and visually inspected: ${attName}`);
            continue;
          }
        }
        skippedAttachments.push({
          name: attName,
          reason: 'Image exceeded 4 MB AI limit or returned unsupported format.',
        });
      } catch {
        skippedAttachments.push({
          name: attName,
          reason: 'Could not download remote image for AI vision analysis.',
        });
      }
    } else if (attType === 'document') {
      if (mimeType === 'text/plain' && secureUrl) {
        const localTxtMatch = secureUrl.match(/^\/api\/uploads\/file\/([a-zA-Z0-9_-]{1,80}\.txt)$/i);
        if (localTxtMatch) {
          try {
            const resolved = path.resolve(UPLOADS_DIR, localTxtMatch[1]);
            if (resolved.startsWith(UPLOADS_DIR + path.sep)) {
              const rawText = (await fs.promises.readFile(resolved, 'utf8')).slice(0, MAX_AI_TEXT_DOC_BYTES).trim();
              if (rawText.length > 0) {
                analyzedAttachments.push(attName);
                attachmentContextLines.push(
                  `Plain-text document excerpt (${attName}):\n${rawText.slice(0, 2500)}`,
                );
                continue;
              }
            }
          } catch {
            // Fall through to skipped notice
          }
        }

        const safeUrl = isSafePublicHttpUrl(secureUrl);
        if (safeUrl.ok) {
          try {
            const docRes = await fetch(safeUrl.url.toString(), {
              signal: AbortSignal.timeout(3500),
            });
            if (docRes.ok) {
              const rawText = (await docRes.text()).slice(0, MAX_AI_TEXT_DOC_BYTES).trim();
              if (rawText.length > 0) {
                analyzedAttachments.push(attName);
                attachmentContextLines.push(
                  `Plain-text document excerpt (${attName}):\n${rawText.slice(0, 2500)}`,
                );
                continue;
              }
            }
          } catch {
            // Fall through to skipped notice
          }
        }
      }
      attachmentContextLines.push(`Document attached (filename only, contents NOT parsed): ${attName}`);
      skippedAttachments.push({
        name: attName,
        reason: 'Document binary contents (PDF/DOCX/PPTX) are not parsed by server AI; only filename was noted.',
      });
    } else if (attType === 'youtube') {
      const label = String(record.linkTitle || attName);
      attachmentContextLines.push(`YouTube link attached (metadata only, video NOT watched): ${label}`);
      skippedAttachments.push({
        name: label,
        reason: 'YouTube video audio/frames are not transcribed automatically.',
      });
    } else if (attType === 'link') {
      const label = String(record.linkTitle || record.linkDomain || attName);
      attachmentContextLines.push(`External URL attached (title/domain only, page NOT scraped): ${label}`);
      skippedAttachments.push({
        name: label,
        reason: 'External webpage body is not scraped during AI generation.',
      });
    }
  }

  return {
    analyzedAttachments,
    skippedAttachments,
    imageParts,
    attachmentContextLines,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Honest integration status check (never treats placeholder Cloudinary keys as valid)
  app.get('/api/integrations/status', (_req, res) => {
    const geminiConfigured = Boolean(
      process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY',
    );
    const cloudinaryCheck = isValidCloudinaryCredentialPair({
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
      uploadPreset: process.env.CLOUDINARY_UPLOAD_PRESET,
    });

    res.json({
      geminiConfigured,
      cloudinaryConfigured: cloudinaryCheck.configured,
      cloudinaryCloudName: cloudinaryCheck.configured ? process.env.CLOUDINARY_CLOUD_NAME || null : null,
      cloudinaryMode: cloudinaryCheck.mode,
      directUploadReady: true,
    });
  });

  // Built-in direct media storage endpoint (validated MIME + magic bytes, max 10 MB)
  app.post('/api/uploads/direct', express.json({ limit: '16mb' }), async (req, res) => {
    const { mimeType, fileName, dataBase64 } = req.body ?? {};
    const cleanMime = typeof mimeType === 'string' ? mimeType.trim().toLowerCase() : '';
    const mimeSpec = MIME_EXTENSION_MAP[cleanMime];

    if (!mimeSpec || !ALLOWED_UPLOAD_MIME_TYPES.has(cleanMime)) {
      res.status(400).json({
        error: 'Unsupported file type. Allowed formats: JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX, PPT, PPTX, TXT.',
      });
      return;
    }

    if (typeof dataBase64 !== 'string' || dataBase64.trim().length === 0) {
      res.status(400).json({ error: 'File payload is missing.' });
      return;
    }

    const strippedBase64 = dataBase64.replace(/^data:[^;]+;base64,/i, '').trim();
    const buffer = Buffer.from(strippedBase64, 'base64');

    if (buffer.byteLength <= 0 || buffer.byteLength > MAX_ATTACHMENT_BYTES) {
      res.status(400).json({ error: 'File must be between 1 byte and 10 MB.' });
      return;
    }

    if (!validateMagicBytes(buffer, cleanMime)) {
      res.status(400).json({
        error: `File signature does not match ${cleanMime}. Please upload a genuine image or document.`,
      });
      return;
    }

    const safeFileName = `nx_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${mimeSpec.ext}`;
    const destPath = path.resolve(UPLOADS_DIR, safeFileName);
    if (!destPath.startsWith(UPLOADS_DIR + path.sep)) {
      res.status(400).json({ error: 'Invalid upload destination.' });
      return;
    }

    try {
      await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });
      await fs.promises.writeFile(destPath, buffer);
      res.json({
        secureUrl: `/api/uploads/file/${safeFileName}`,
        mimeType: cleanMime,
        fileSize: buffer.byteLength,
        originalFileName: typeof fileName === 'string' ? fileName.slice(0, 140) : safeFileName,
        storage: 'nexus-direct',
      });
    } catch (err) {
      console.error('Direct upload write error:', err);
      res.status(500).json({ error: 'Failed to store uploaded file on server.' });
    }
  });

  // Serve stored uploaded attachments safely with strict path validation & CORS headers for 3D textures
  app.get('/api/uploads/file/:fileName', async (req, res) => {
    const rawName = String(req.params.fileName || '');
    const match = rawName.match(/^([a-zA-Z0-9_-]{1,80})\.([a-zA-Z0-9]{2,6})$/);
    if (!match) {
      res.status(400).json({ error: 'Invalid file name.' });
      return;
    }

    const ext = match[2].toLowerCase();
    const mimeType = EXT_TO_MIME[ext];
    if (!mimeType) {
      res.status(400).json({ error: 'Unsupported file extension.' });
      return;
    }

    const targetPath = path.resolve(UPLOADS_DIR, rawName);
    if (!targetPath.startsWith(UPLOADS_DIR + path.sep)) {
      res.status(403).json({ error: 'Forbidden path.' });
      return;
    }

    try {
      const data = await fs.promises.readFile(targetPath);
      const spec = MIME_EXTENSION_MAP[mimeType];
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', String(data.byteLength));
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      if (spec && !spec.inline) {
        res.setHeader('Content-Disposition', `attachment; filename="${rawName}"`);
      }
      res.send(data);
    } catch {
      res.status(404).json({ error: 'Attachment file not found.' });
    }
  });

  // Cloudinary signed upload authorization endpoint (only when credentials are genuinely valid)
  app.post('/api/uploads/cloudinary-sign', (req, res) => {
    const { mimeType, fileSize, fileName, folder } = req.body ?? {};
    if (typeof mimeType !== 'string' || !ALLOWED_UPLOAD_MIME_TYPES.has(mimeType.toLowerCase())) {
      res.status(400).json({
        error: 'Unsupported file type. Allowed formats: JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX, PPT, PPTX, TXT.',
      });
      return;
    }
    if (typeof fileSize !== 'number' || fileSize <= 0 || fileSize > MAX_ATTACHMENT_BYTES) {
      res.status(400).json({
        error: 'File exceeds the 10 MB maximum upload limit.',
      });
      return;
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;

    const credCheck = isValidCloudinaryCredentialPair({
      cloudName,
      apiKey,
      apiSecret,
      uploadPreset,
    });

    const cleanFolder =
      typeof folder === 'string' && /^[a-zA-Z0-9_/-]{1,64}$/.test(folder)
        ? folder
        : 'nexus_attachments';

    if (credCheck.configured && credCheck.mode === 'signed' && cloudName && apiKey && apiSecret) {
      const timestamp = Math.floor(Date.now() / 1000);
      const paramsToSign = `folder=${cleanFolder}&timestamp=${timestamp}${apiSecret}`;
      const signature = crypto.createHash('sha1').update(paramsToSign).digest('hex');

      res.json({
        mode: 'signed',
        cloudName,
        apiKey,
        timestamp,
        folder: cleanFolder,
        signature,
        fileName: typeof fileName === 'string' ? fileName.slice(0, 140) : 'attachment',
        uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/auto/upload`,
      });
      return;
    }

    if (credCheck.configured && credCheck.mode === 'unsigned' && cloudName && uploadPreset) {
      res.json({
        mode: 'unsigned',
        cloudName,
        uploadPreset,
        folder: cleanFolder,
        fileName: typeof fileName === 'string' ? fileName.slice(0, 140) : 'attachment',
        uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/auto/upload`,
      });
      return;
    }

    res.status(501).json({
      configured: false,
      fallback: 'direct',
      error: 'Cloudinary is not configured; using NEXUS direct upload storage.',
    });
  });

  // Safe metadata preview for external URLs & YouTube oEmbed
  app.post('/api/links/preview', async (req, res) => {
    const { url } = req.body ?? {};
    if (typeof url !== 'string') {
      res.status(400).json({ error: 'A valid URL string is required.' });
      return;
    }

    const checked = isSafePublicHttpUrl(url);
    if (!checked.ok) {
      res.status(400).json({ error: checked.error });
      return;
    }

    const parsedUrl = checked.url;
    const domain = parsedUrl.hostname.replace(/^www\./, '');

    try {
      if (domain === 'youtube.com' || domain === 'm.youtube.com' || domain === 'youtu.be') {
        const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(parsedUrl.toString())}&format=json`;
        const oembedResp = await fetch(oembedUrl, {
          signal: AbortSignal.timeout(4000),
        });
        if (oembedResp.ok) {
          const data = (await oembedResp.json()) as {
            title?: string;
            author_name?: string;
            thumbnail_url?: string;
          };
          res.json({
            url: parsedUrl.toString(),
            domain: 'youtube.com',
            title: typeof data.title === 'string' ? data.title.slice(0, 180) : 'YouTube Video',
            description:
              typeof data.author_name === 'string'
                ? `YouTube · ${data.author_name.slice(0, 80)}`
                : 'YouTube video reference',
            thumbnailUrl: typeof data.thumbnail_url === 'string' ? data.thumbnail_url : null,
            metadataFetched: true,
          });
          return;
        }
      }

      const resp = await fetch(parsedUrl.toString(), {
        headers: {
          'User-Agent': 'NEXUS-LinkPreview/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(4000),
      });

      const contentType = resp.headers.get('content-type') ?? '';
      if (!resp.ok || !contentType.includes('text/html')) {
        res.json({
          url: parsedUrl.toString(),
          domain,
          title: domain,
          description: '',
          thumbnailUrl: null,
          metadataFetched: false,
        });
        return;
      }

      const text = (await resp.text()).slice(0, 200_000);
      const title =
        extractMetaContent(text, 'property', 'og:title') ||
        extractMetaContent(text, 'name', 'twitter:title') ||
        extractTitleTag(text) ||
        domain;
      const description =
        extractMetaContent(text, 'property', 'og:description') ||
        extractMetaContent(text, 'name', 'description') ||
        '';
      const rawThumb = extractMetaContent(text, 'property', 'og:image');
      let thumbnailUrl: string | null = null;
      if (rawThumb) {
        try {
          const resolved = new URL(rawThumb, parsedUrl).toString();
          if (resolved.startsWith('https://') || resolved.startsWith('http://')) {
            thumbnailUrl = resolved.slice(0, 500);
          }
        } catch {
          thumbnailUrl = null;
        }
      }

      res.json({
        url: parsedUrl.toString(),
        domain,
        title: title.slice(0, 180),
        description: description.slice(0, 280),
        thumbnailUrl,
        metadataFetched: true,
      });
    } catch {
      res.json({
        url: parsedUrl.toString(),
        domain,
        title: domain,
        description: '',
        thumbnailUrl: null,
        metadataFetched: false,
      });
    }
  });

  // Server-side NEXUS AI Reward Engine (Difficulty Tier Classification + Fixed Credit Mapping)
  app.post('/api/nexus-ai/assess-doubt', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'NEXUS AI reward assessment is pending: GEMINI_API_KEY is not configured on the server.',
        assessmentStatus: 'pending',
      });
      return;
    }

    const { questionId, title, description, topic, tags, attachments, isRetry } = req.body ?? {};
    if (
      typeof title !== 'string' ||
      title.trim().length < 5 ||
      typeof description !== 'string' ||
      description.trim().length < 10
    ) {
      res.status(400).json({
        error: 'A valid question title and description are required for AI difficulty classification.',
      });
      return;
    }

    if (typeof questionId === 'string' && questionId.length > 0 && isRetry) {
      const lastTry = assessmentAttemptTimestamps.get(questionId) ?? 0;
      if (Date.now() - lastTry < 8000) {
        res.status(429).json({
          error: 'Please wait a few seconds before retrying AI assessment for this doubt.',
          assessmentStatus: 'pending',
        });
        return;
      }
      assessmentAttemptTimestamps.set(questionId, Date.now());
    }

    const safeTopic = typeof topic === 'string' ? topic.slice(0, 40) : 'Engineering';
    const safeTags = Array.isArray(tags)
      ? tags.filter((t): t is string => typeof t === 'string').slice(0, 8)
      : [];

    const { imageParts, attachmentContextLines } = await prepareAttachmentContext(attachments);

    try {
      const prompt = [
        `Subject / Category: ${safeTopic}`,
        safeTags.length > 0 ? `Author Tags: ${safeTags.join(', ')}` : '',
        `Doubt Title: ${title.trim().slice(0, 200)}`,
        `Doubt Description:\n${description.trim().slice(0, 4000)}`,
        attachmentContextLines.length > 0
          ? `Attached Context:\n${attachmentContextLines.join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const contents = imageParts.length > 0 ? [...imageParts, { text: prompt }] : prompt;

      const aiRes = await callGeminiJson({
        task: 'assess-doubt',
        system:
          'You are the NEXUS AI Difficulty Assessor. Classify an engineering/academic student doubt strictly into one of four tiers based on technical complexity, prerequisite domain knowledge, number of reasoning steps, and problem-solving effort:\n' +
          '- QUICK_FIX: Simple syntax fix, single definition, basic formula check, or direct lookup.\n' +
          '- STANDARD: Normal coursework bug, standard algorithmic trace, or 2-3 step conceptual explanation.\n' +
          '- CHALLENGING: Multi-step debugging, nuanced edge cases, non-trivial mathematical derivation, or system design trade-offs.\n' +
          '- ADVANCED: Deep concurrency/memory/compiler internals, rigorous proof, multi-subsystem architecture, or complex research-level engineering.\n' +
          'CRITICAL: Do NOT assign a higher tier merely because the description is long or has many attachments. Never mention or invent numerical credit points. Keep difficultyReason concise and objective (1-2 sentences, <= 260 chars).',
        contents,
        schema: {
          type: Type.OBJECT,
          properties: {
            difficultyTier: {
              type: Type.STRING,
              enum: ['QUICK_FIX', 'STANDARD', 'CHALLENGING', 'ADVANCED'],
              description: 'Difficulty tier classification.',
            },
            difficultyReason: {
              type: Type.STRING,
              description: 'Concise 1-2 sentence technical justification for the chosen difficulty tier.',
            },
            estimatedComplexity: {
              type: Type.STRING,
              description: 'Short label summarizing reasoning depth and prerequisite knowledge.',
            },
            relevantSkillTags: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Up to 6 relevant lowercase technical skill tags.',
            },
          },
          required: [
            'difficultyTier',
            'difficultyReason',
            'estimatedComplexity',
            'relevantSkillTags',
          ],
        },
      });

      if (!aiRes.ok || !aiRes.data) {
        res.status(502).json({
          error: aiRes.error || 'Gemini returned an empty difficulty assessment.',
          assessmentStatus: 'pending',
        });
        return;
      }

      const parsed = aiRes.data as {
        difficultyTier?: string;
        difficultyReason?: string;
        estimatedComplexity?: string;
        relevantSkillTags?: unknown[];
      };

      const tier = parsed.difficultyTier as DifficultyTier;
      if (!(tier in DIFFICULTY_REWARD_MAP)) {
        res.status(502).json({
          error: 'Gemini returned an unrecognized difficulty tier.',
          assessmentStatus: 'pending',
        });
        return;
      }

      const assignedCredits = DIFFICULTY_REWARD_MAP[tier];
      const cleanSkillTags = Array.isArray(parsed.relevantSkillTags)
        ? parsed.relevantSkillTags
            .filter((t): t is string => typeof t === 'string')
            .map((t) => t.trim().toLowerCase().replace(/^#/, '').slice(0, 40))
            .filter(Boolean)
            .slice(0, 6)
        : [];

      res.json({
        difficultyTier: tier,
        difficultyReason: String(parsed.difficultyReason || 'Assessed by NEXUS AI.').slice(0, 480),
        estimatedComplexity: String(parsed.estimatedComplexity || 'Standard reasoning').slice(0, 110),
        relevantSkillTags: cleanSkillTags,
        assignedCredits,
        assessmentStatus: 'completed',
        model: aiRes.modelUsed || 'gemini-2.5-flash',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to assess doubt difficulty.';
      console.error('NEXUS AI reward assessment error:', message);
      res.status(502).json({
        error: message,
        assessmentStatus: 'pending',
      });
    }
  });

  // Server-side NEXUS AI Insight generation via @google/genai (with honest attachment inspection)
  app.post('/api/nexus-ai/insight', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'NEXUS AI is not configured: GEMINI_API_KEY is missing in server secrets.',
      });
      return;
    }

    const { title, description, topic, tags, attachments } = req.body ?? {};
    if (
      typeof title !== 'string' ||
      title.trim().length < 5 ||
      typeof description !== 'string' ||
      description.trim().length < 10
    ) {
      res.status(400).json({
        error: 'A valid question title and description are required to generate an AI insight.',
      });
      return;
    }

    const safeTopic = typeof topic === 'string' ? topic.slice(0, 40) : 'Engineering';
    const safeTags = Array.isArray(tags)
      ? tags.filter((t): t is string => typeof t === 'string').slice(0, 8)
      : [];

    const { analyzedAttachments, skippedAttachments, imageParts, attachmentContextLines } =
      await prepareAttachmentContext(attachments);

    try {
      const prompt = [
        `Topic: ${safeTopic}`,
        safeTags.length > 0 ? `Tags: ${safeTags.join(', ')}` : '',
        `Question Title: ${title.trim().slice(0, 200)}`,
        `Student Description:\n${description.trim().slice(0, 4000)}`,
        attachmentContextLines.length > 0
          ? `Attachment Disclosure (be honest about what was or was not inspected):\n${attachmentContextLines.join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n');

      const contents =
        imageParts.length > 0
          ? [...imageParts, { text: prompt }]
          : prompt;

      const aiRes = await callGeminiJson({
        task: 'insight',
        system:
          'You are NEXUS AI, an academic peer-learning study guide. Provide concise, accurate, structured technical guidance for a university student doubt without doing their homework blindly. If attachments were skipped (such as PDFs or external links), never pretend you read their contents. Keep explanations crisp, factual, and organized.',
        contents,
        schema: {
          type: Type.OBJECT,
          properties: {
            suggestedExplanation: {
              type: Type.STRING,
              description: 'Clear 2-4 sentence conceptual explanation of the underlying problem.',
            },
            importantClues: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '2-4 key technical clues or observations from the question.',
            },
            stepByStepApproach: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '3-5 concrete, ordered steps to diagnose or solve the problem.',
            },
            possibleErrors: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '2-3 common mistakes or edge cases students run into here.',
            },
            helpfulNextSteps: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: '2-3 actionable next steps or verification checks.',
            },
          },
          required: [
            'suggestedExplanation',
            'importantClues',
            'stepByStepApproach',
            'possibleErrors',
            'helpfulNextSteps',
          ],
        },
      });

      if (!aiRes.ok || !aiRes.data) {
        res.status(502).json({ error: aiRes.error || 'Gemini returned an empty response.' });
        return;
      }

      res.json({
        ...aiRes.data,
        analyzedAttachments,
        skippedAttachments: skippedAttachments.map((s) => `${s.name}: ${s.reason}`),
        model: aiRes.modelUsed || 'gemini-2.5-flash',
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate NEXUS AI insight.';
      console.error('NEXUS AI error:', message);
      res.status(500).json({ error: message });
    }
  });

  // Shared AI Helper & Logging
  async function callGeminiJson(params: {
    task: string;
    system: string;
    contents: any;
    schema: any;
  }): Promise<{ ok: boolean; data?: any; error?: string; modelUsed?: string; fallbackUsed?: boolean }> {
    const ai = getGeminiClient();
    if (!ai) return { ok: false, error: 'AI not configured' };

    const primaryModel = process.env.PRIMARY_MODEL || 'gemini-2.5-flash';
    const fallbackModel = process.env.FALLBACK_MODEL || 'gemini-1.5-flash';

    let modelUsed = primaryModel;
    let fallbackUsed = false;
    let rawText = '';

    try {
      const res = await Promise.race([
        ai.models.generateContent({
          model: primaryModel,
          contents: params.contents,
          config: {
            systemInstruction: params.system,
            responseMimeType: 'application/json',
            responseSchema: params.schema,
          },
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('AI timeout')), 25000)),
      ]) as any;
      rawText = res.text ?? '';
    } catch {
      fallbackUsed = true;
      modelUsed = fallbackModel;
      try {
        const resFallback = await Promise.race([
          ai.models.generateContent({
            model: fallbackModel,
            contents: params.contents,
            config: {
              systemInstruction: params.system,
              responseMimeType: 'application/json',
              responseSchema: params.schema,
            },
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('AI fallback timeout')), 25000)),
        ]) as any;
        rawText = resFallback.text ?? '';
      } catch (fallbackErr: any) {
        return { ok: false, error: fallbackErr.message || 'AI failed' };
      }
    }

    try {
      const parsed = JSON.parse(rawText);
      return { ok: true, data: parsed, modelUsed, fallbackUsed };
    } catch {
      return { ok: false, error: 'Invalid JSON response from AI', modelUsed, fallbackUsed };
    }
  }

  // Snap-to-Doubt image analysis endpoint
  app.post('/api/doubts/analyze-image', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({ error: 'AI analysis is currently unavailable.' });
      return;
    }
    const { imageBase64, mimeType, note } = req.body ?? {};
    if (typeof imageBase64 !== 'string' || !imageBase64.startsWith('data:image/')) {
      res.status(400).json({ error: 'Valid base64 image data is required.' });
      return;
    }
    const base64Data = imageBase64.replace(/^data:image\/[a-z]+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.byteLength > 1.5 * 1024 * 1024) {
      res.status(400).json({ error: 'Image size exceeds 1.5MB limit.' });
      return;
    }

    const result = await callGeminiJson({
      task: 'analyze-image',
      system: 'You are an expert technical study assistant. Read the user uploaded image (code screenshot, math problem, error message, diagram) and return structured JSON analyzing the problem. Provide transcription, category, suggested title, description, and missing info questions.',
      contents: [
        { inlineData: { mimeType: mimeType || 'image/jpeg', data: base64Data } },
        { text: note ? `Student note: ${note}` : 'Analyze this student problem image.' },
      ],
      schema: {
        type: Type.OBJECT,
        properties: {
          legible: { type: Type.BOOLEAN },
          confidence: { type: Type.STRING, enum: ['low', 'medium', 'high'] },
          contentType: { type: Type.STRING },
          subject: { type: Type.STRING },
          transcribedText: { type: Type.STRING },
          suggestedTitle: { type: Type.STRING },
          suggestedDescription: { type: Type.STRING },
          stuckPoint: { type: Type.STRING },
          suggestedCategory: { type: Type.STRING },
          suggestedTags: { type: Type.ARRAY, items: { type: Type.STRING } },
          missingInfoQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          containsPersonalInfo: { type: Type.BOOLEAN },
        },
        required: [
          'legible',
          'confidence',
          'contentType',
          'subject',
          'transcribedText',
          'suggestedTitle',
          'suggestedDescription',
          'stuckPoint',
          'suggestedCategory',
          'suggestedTags',
          'missingInfoQuestions',
          'containsPersonalInfo',
        ],
      },
    });

    if (!result.ok) {
      res.status(502).json({ error: result.error || 'Failed to analyze image.' });
      return;
    }

    res.json(result.data);
  });

  // Admin AI Health endpoint
  app.get('/api/admin/ai-health', async (_req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.json({ configured: false });
      return;
    }
    const startTime = Date.now();
    let testOk = false;
    try {
      const testRes = await ai.models.generateContent({
        model: process.env.PRIMARY_MODEL || 'gemini-2.5-flash',
        contents: 'ping',
      });
      testOk = Boolean(testRes.text);
    } catch {
      testOk = false;
    }
    res.json({
      configured: true,
      primaryModel: process.env.PRIMARY_MODEL || 'gemini-2.5-flash',
      fallbackModel: process.env.FALLBACK_MODEL || 'gemini-1.5-flash',
      embeddingModel: process.env.EMBEDDING_MODEL || 'gemini-embedding-2',
      testCallOk: testOk,
      latencyMs: Date.now() - startTime,
    });
  });

  // Gmail Personal Account Activity & Notification Send API (client passes OAuth token via Bearer header)
  function extractBearerToken(req: express.Request): string | null {
    const raw = req.headers.authorization;
    if (typeof raw !== 'string') return null;
    const match = raw.match(/^Bearer\s+([A-Za-z0-9._~+/-]+=*)$/);
    return match?.[1] ?? null;
  }

  app.get('/api/mail/activity', async (req, res) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({
        error: 'Connect Gmail to access your personal mail activity.',
        needsGmailAuth: true,
      });
      return;
    }

    try {
      const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000),
      });

      if (profileRes.status === 401 || profileRes.status === 403) {
        res.status(401).json({
          error: 'Gmail session expired or missing mail permission. Please reconnect Gmail.',
          needsGmailAuth: true,
        });
        return;
      }

      if (!profileRes.ok) {
        const text = await profileRes.text();
        res.status(profileRes.status).json({
          error: `Gmail profile request failed: ${text.slice(0, 180)}`,
        });
        return;
      }

      const profileJson = (await profileRes.json()) as {
        emailAddress?: string;
        messagesTotal?: number;
      };

      const listRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=12',
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8000),
        },
      );

      if (!listRes.ok) {
        res.status(listRes.status).json({
          error: 'Unable to list Gmail messages.',
        });
        return;
      }

      const listJson = (await listRes.json()) as {
        messages?: Array<{ id: string; threadId: string }>;
      };

      const refs = Array.isArray(listJson.messages) ? listJson.messages.slice(0, 12) : [];

      const messages = await Promise.all(
        refs.map(async (msgRef) => {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
              msgRef.id,
            )}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
            {
              headers: { Authorization: `Bearer ${token}` },
              signal: AbortSignal.timeout(6000),
            },
          );
          if (!msgRes.ok) return null;
          const msgData = (await msgRes.json()) as {
            id?: string;
            threadId?: string;
            snippet?: string;
            labelIds?: string[];
            payload?: { headers?: Array<{ name?: string; value?: string }> };
          };
          const headers = msgData.payload?.headers ?? [];
          const getHeader = (name: string) =>
            headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
          const labelIds = Array.isArray(msgData.labelIds) ? msgData.labelIds : [];
          return {
            id: String(msgData.id || msgRef.id),
            threadId: String(msgData.threadId || msgRef.threadId),
            subject: decodeBasicHtmlEntities(getHeader('Subject')) || '(No Subject)',
            from: getHeader('From'),
            to: getHeader('To'),
            date: getHeader('Date'),
            snippet: decodeBasicHtmlEntities(String(msgData.snippet ?? '')),
            unread: labelIds.includes('UNREAD'),
            labelIds,
          };
        }),
      );

      res.json({
        connectedEmail: String(profileJson.emailAddress ?? ''),
        messagesTotal: Number(profileJson.messagesTotal ?? 0),
        messages: messages.filter((m): m is NonNullable<typeof m> => Boolean(m)),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to fetch personal Gmail activity.';
      res.status(502).json({ error: message });
    }
  });

  app.post('/api/mail/send', async (req, res) => {
    const token = extractBearerToken(req);
    if (!token) {
      res.status(401).json({
        error: 'Connect Gmail before sending an email notification.',
        needsGmailAuth: true,
      });
      return;
    }

    const { to, subject, body, confirmed } = req.body ?? {};
    if (confirmed !== true) {
      res.status(400).json({
        error: 'Explicit user confirmation is required before sending any email.',
      });
      return;
    }

    const cleanTo = typeof to === 'string' ? to.replace(/[\r\n]/g, '').trim() : '';
    const cleanSubject = typeof subject === 'string' ? subject.replace(/[\r\n]/g, ' ').trim().slice(0, 200) : '';
    const cleanBody = typeof body === 'string' ? body.trim().slice(0, 8000) : '';

    if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(cleanTo)) {
      res.status(400).json({ error: 'A valid recipient email address is required.' });
      return;
    }
    if (!cleanSubject || !cleanBody) {
      res.status(400).json({ error: 'Email subject and body are required.' });
      return;
    }

    const encodedSubject = `=?UTF-8?B?${Buffer.from(cleanSubject, 'utf8').toString('base64')}?=`;
    const rfc2822 = [
      `To: ${cleanTo}`,
      `Subject: ${encodedSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      cleanBody,
    ].join('\r\n');

    const rawEncoded = Buffer.from(rfc2822, 'utf8').toString('base64url');

    try {
      const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: rawEncoded }),
        signal: AbortSignal.timeout(8000),
      });

      if (sendRes.status === 401 || sendRes.status === 403) {
        res.status(401).json({
          error: 'Gmail send permission expired. Please reconnect Gmail and try again.',
          needsGmailAuth: true,
        });
        return;
      }

      if (!sendRes.ok) {
        const text = await sendRes.text();
        res.status(sendRes.status).json({
          error: `Gmail send failed: ${text.slice(0, 220)}`,
        });
        return;
      }

      const sentJson = (await sendRes.json()) as { id?: string; threadId?: string };
      res.json({
        ok: true,
        id: sentJson.id ?? '',
        threadId: sentJson.threadId ?? '',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to send email via Gmail API.';
      res.status(502).json({ error: message });
    }
  });

  // Cloudinary unsigned preset metadata endpoint (only when genuinely valid)
  app.get('/api/uploads/cloudinary-config', (_req, res) => {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const uploadPreset = process.env.CLOUDINARY_UPLOAD_PRESET;
    const check = isValidCloudinaryCredentialPair({ cloudName, uploadPreset });
    if (!check.configured || check.mode !== 'unsigned') {
      res.status(501).json({
        configured: false,
        fallback: 'direct',
        error: 'Cloudinary unsigned preset is not configured; using NEXUS direct upload storage.',
      });
      return;
    }
    res.json({
      configured: true,
      cloudName,
      uploadPreset,
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NEXUS server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start NEXUS server:', err);
  process.exit(1);
});
