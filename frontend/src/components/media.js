/* Uploading project media: images are resized in the browser first; videos
   and GIFs are uploaded as they are (so GIFs keep their animation). */
import { readImage } from './case/data.js';
import { uploadImage, uploadFile, isSignedIn } from '../api.js';

export const MAX_VIDEO_MB = 50;
export const MAX_IMAGE_MB = 15;
export const ACCEPT = 'image/*,video/mp4,video/webm,video/quicktime';

/** Upload one file. Resolves to { type: 'image' | 'video', src }. */
export async function uploadMedia(file, onProgress) {
  const isVideo = file.type.startsWith('video/');
  if (!isVideo && !file.type.startsWith('image/')) throw new Error(`“${file.name}” isn’t an image or a video.`);

  if (isVideo) {
    if (!isSignedIn()) throw new Error('Log in to upload videos. They’re too large to keep in your browser.');
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) throw new Error(`“${file.name}” is over ${MAX_VIDEO_MB} MB. Try a shorter or compressed clip.`);
    const { url } = await uploadFile(file, onProgress);
    return { type: 'video', src: url };
  }
  if (file.type === 'image/gif' && isSignedIn() && file.size <= MAX_IMAGE_MB * 1024 * 1024) {
    const { url } = await uploadFile(file, onProgress);
    return { type: 'image', src: url };
  }
  const src = await uploadImage(await readImage(file));
  onProgress?.(1);
  return { type: 'image', src };
}

/**
 * A profile photo: centre-cropped to a square and resized in the browser,
 * then uploaded (or kept in this browser when signed out). Resolves to its URL.
 */
export async function uploadProfilePhoto(file, size = 640) {
  if (!file?.type?.startsWith('image/')) throw new Error('Choose an image: a JPG, PNG or WebP photo.');
  if (file.size > MAX_IMAGE_MB * 1024 * 1024) throw new Error(`That photo is over ${MAX_IMAGE_MB} MB. Try a smaller one.`);
  const dataUrl = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const out = Math.min(size, side);
      const c = document.createElement('canvas');
      c.width = out; c.height = out;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, out, out);
      // Centre crop, biased slightly upwards so faces in portrait photos stay in frame.
      const sx = (img.naturalWidth - side) / 2;
      const sy = Math.max(0, (img.naturalHeight - side) * 0.35);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Couldn’t read that image. Try a JPG or PNG.')); };
    img.src = url;
  });
  return uploadImage(dataUrl);
}

/* Case study attachments: research reports, decks, specs, data. */
export const FILE_TYPES = { pdf: 'PDF', docx: 'Word', pptx: 'PowerPoint', xlsx: 'Excel' };
export const FILE_ACCEPT = '.pdf,.docx,.pptx,.xlsx';
export const MAX_FILE_MB = 20;

export const fileExt = (s = '') => (s.split('?')[0].split('.').pop() || '').toLowerCase();
export const fileSize = (n) => (!n ? '' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** Upload one document. Resolves to { type: 'file', src, name, size }. */
export async function uploadAttachment(file, onProgress) {
  const ext = fileExt(file.name);
  if (!FILE_TYPES[ext]) {
    throw new Error(`“${file.name}” isn’t a PDF, Word, PowerPoint or Excel file.${['doc', 'ppt', 'xls', 'key', 'pages'].includes(ext) ? ' Save it as a PDF and try again.' : ''}`);
  }
  if (!isSignedIn()) throw new Error('Log in to attach files. They’re stored in your account, not in this browser.');
  if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`“${file.name}” is over ${MAX_FILE_MB} MB.`);
  const r = await uploadFile(file, onProgress);
  return { type: 'file', src: r.url, name: r.filename || file.name, size: r.size };
}
