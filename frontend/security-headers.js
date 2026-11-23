/* Browser security headers for Dixlab's pages.

   Used by `npm run dev` and `npm run preview` (see vite.config.js). When the
   built app is hosted for real (e.g. on Pxxl), configure the host to send
   `production` below on every page; the API sets its own headers.

   The Content-Security-Policy only lets scripts come from Dixlab itself, so an
   injected script can't run or send data elsewhere, and frame-ancestors stops
   other sites embedding Dixlab to trick people into clicking (clickjacking). */

const shared = {
  "default-src": ["'self'"],
  // React's inline style attributes need 'unsafe-inline' for styles (not scripts).
  "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
  "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
  // Tool logos come from two icon CDNs; data:/blob: are local image previews.
  "img-src": ["'self'", "data:", "blob:", "https://cdn.jsdelivr.net", "https://cdn.simpleicons.org"],
  "media-src": ["'self'", "blob:", "data:"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
  "frame-ancestors": ["'none'"],
  // Case study embeds: only the players Dixlab builds (components/case/extras.jsx).
  "frame-src": ["https://www.youtube-nocookie.com", "https://www.loom.com", "https://player.vimeo.com"],
  "worker-src": ["'self'", "blob:"],
};

const csp = (extra) => Object.entries({ ...shared, ...extra }).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');

const common = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // The interview can use the microphone for voice answers; nothing else is needed.
  'Permissions-Policy': 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)',
};

export const production = {
  ...common,
  // data: is for turning a resized image into an upload (fetch of a data: URL).
  'Content-Security-Policy': csp({ "script-src": ["'self'"], "connect-src": ["'self'", "data:"] }),
  // Send only over HTTPS in production (the host must serve HTTPS).
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

// The dev server injects an inline script for hot reload and talks over a websocket.
export const development = {
  ...common,
  'Content-Security-Policy': csp({ "script-src": ["'self'", "'unsafe-inline'"], "connect-src": ["'self'", "data:", "ws:", "wss:"] }),
};

// `vite preview` serves the production build locally over plain HTTP: same policy, no HSTS.
export const preview = { ...production };
delete preview['Strict-Transport-Security'];
