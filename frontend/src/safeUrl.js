/* Second line of defence for links built from user content (the server already
   cleans projects when they're saved, published and served). Browsers ignore
   whitespace and control characters inside a scheme, so check without them. */
const compact = (s) => String(s || '').replace(/[\u0000- \u007f]+/g, '').toLowerCase();

/** A link people can click: web, email or same-site. Anything else becomes undefined. */
export function safeHref(url) {
  const raw = String(url || '').trim();
  const c = compact(raw);
  if (!c) return undefined;
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(c)?.[1];
  if (scheme && !['http', 'https', 'mailto'].includes(scheme)) return undefined;
  if (!scheme && !c.startsWith('/') && !c.startsWith('#')) return `https://${raw}`; // "alex.dev" -> https://alex.dev
  return raw;
}

/** A file or media address Dixlab serves itself ("/uploads/…") or an inline image. */
export function safeSrc(url) {
  const raw = String(url || '').trim();
  const c = compact(raw);
  if (c.startsWith('/') && !c.startsWith('//')) return raw;
  if (/^data:image\/(png|jpe?g|webp|gif);base64,/i.test(raw)) return raw;
  if (c.startsWith('blob:')) return raw; // local previews while uploading
  return undefined;
}
