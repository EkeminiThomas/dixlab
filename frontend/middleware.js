/**
 * Vercel Routing Middleware: link previews for published pages.
 *
 * LinkedIn, X, WhatsApp, Slack and friends don't run JavaScript, so a shared
 * /p/:slug link would show a blank card. For those bots only, we hand back the
 * API's small share page (title, description and image tags). Everyone else,
 * including search engines, gets the normal app.
 */
export const config = { matcher: ['/p/:path*', '/'] };

const API = 'https://dixlab.pxxl.click';
const BOTS = /facebookexternalhit|facebookcatalog|meta-externalagent|linkedinbot|twitterbot|slackbot|slack-imgproxy|discordbot|whatsapp|telegrambot|skypeuripreview|pinterest|redditbot|embedly|vkshare|tumblr|bitlybot|applebot|iframely|mastodon|bluesky|google-inspectiontool|snapchat|viber|line\//i;

export default async function middleware(request) {
  const ua = request.headers.get('user-agent') || '';
  if (!BOTS.test(ua)) return undefined; // carry on to the app
  const url = new URL(request.url);
  let slug = /^\/p\/([^/?#]+)/.exec(url.pathname)?.[1];
  try {
    // A custom domain's home page: find which published page it shows.
    if (!slug && url.pathname === '/' && !/(^localhost$|\.vercel\.app$|^(www\.)?dixlab\.click$)/.test(url.hostname)) {
      const r = await fetch(`${API}/api/domains/resolve?host=${encodeURIComponent(url.hostname)}`, { signal: AbortSignal.timeout(3000) });
      slug = r.ok ? (await r.json()).slug : null;
    }
    if (!slug) return undefined;
    const res = await fetch(`${API}/api/public/${encodeURIComponent(decodeURIComponent(slug))}/share`, {
      headers: { 'user-agent': 'DixlabPreview/1.0' },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return undefined;
    return new Response(await res.text(), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' },
    });
  } catch {
    return undefined; // the API is slow or down: the bot just gets the normal page
  }
}
