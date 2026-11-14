import { useState } from 'react';

/* ==========================================================================
   Tool and skill logos. A name like "Node.js" or "After Effects" shows that
   tool's logo (from Devicon, then Simple Icons); skills without a logo, like
   "User research", fall back to a small text badge.
   ========================================================================== */

const DV = 'https://cdn.jsdelivr.net/npm/devicon@2.16.0/icons';
const SI = 'https://cdn.simpleicons.org';

const dv = (n, v) => (v ? [`${DV}/${n}/${n}-${v}.svg`] : [`${DV}/${n}/${n}-original.svg`, `${DV}/${n}/${n}-plain.svg`]);
const si = (slug) => [`${SI}/${slug}`];

/** Common spellings mapped to the right icon. Keys are normalised (see key()). */
const ALIAS = {
  js: dv('javascript'), ts: dv('typescript'), node: dv('nodejs'), html: dv('html5'), css: dv('css3'), scss: dv('sass'),
  tailwind: dv('tailwindcss'), vue: dv('vuejs'), nuxt: dv('nuxtjs'), next: dv('nextjs'), reactnative: dv('react'), reactjs: dv('react'),
  angularjs: dv('angular'), golang: dv('go'), expressjs: dv('express'), springboot: dv('spring'), net: dv('dotnetcore'), dotnet: dv('dotnetcore'),
  aspnet: dv('dotnetcore'), rubyonrails: dv('rails'), shell: dv('bash'), terminal: dv('bash'), aws: dv('amazonwebservices', 'original-wordmark'),
  amazonwebservices: dv('amazonwebservices', 'original-wordmark'), gcp: dv('googlecloud'), googlecloudplatform: dv('googlecloud'),
  microsoftazure: dv('azure'), postgres: dv('postgresql'), mongo: dv('mongodb'), npm: dv('npm', 'original-wordmark'),
  visualstudiocode: dv('vscode'), vsc: dv('vscode'), d3: dv('d3js'), three: dv('threejs'), unreal: dv('unrealengine'),
  premiere: dv('premierepro'), ae: dv('aftereffects'), ps: dv('photoshop'), ai: [], c4d: si('cinema4d'), davinci: si('davinciresolve'),
  githubactions: si('githubactions'), kali: si('kalilinux'), burp: si('burpsuite'), framermotion: si('framer'), googleanalytics: si('googleanalytics'),
  ml: [], ux: [], ui: [],
};

const key = (name = '') => name.trim().toLowerCase()
  .replace(/\+/g, 'plus').replace(/#/g, 'sharp')
  .replace(/[\s._\-/]+/g, '')
  .replace(/[^a-z0-9]/g, '');

/** Icon URLs to try, best first. */
function candidates(name) {
  const k = key(name);
  if (!k) return [];
  if (ALIAS[k]) return ALIAS[k];
  const bare = k.startsWith('adobe') ? k.slice(5) : k.startsWith('microsoft') ? k.slice(9) : k;
  if (ALIAS[bare]) return ALIAS[bare];
  return [...dv(bare), ...si(k), ...(bare !== k ? si(bare) : [])];
}

// Remember which URL worked (or that none did), so each name resolves once per visit.
const resolved = new Map();

/** One tool: its logo, or a text badge when there isn't one. */
export function Tool({ name, as: Tag = 'li', className = '' }) {
  const k = key(name);
  const urls = candidates(name);
  const [i, setI] = useState(() => (resolved.has(k) ? resolved.get(k) : 0));
  const hasLogo = i < urls.length;
  return (
    <Tag className={`tk__item ${hasLogo ? '' : 'tk__item--text'} ${className}`} title={name}>
      {hasLogo ? (
        <img
          className="tk__logo"
          src={urls[i]}
          alt={name}
          loading="lazy"
          referrerPolicy="no-referrer"
          draggable={false}
          onLoad={() => resolved.set(k, i)}
          onError={() => { const next = i + 1; if (next >= urls.length) resolved.set(k, next); setI(next); }}
        />
      ) : (
        <span className="tk__text">{name}</span>
      )}
    </Tag>
  );
}

/** A row of tool logos. */
export function ToolList({ items = [], className = '', size = 'md', label }) {
  const list = [...new Set(items.map((x) => String(x).trim()).filter(Boolean))];
  if (!list.length) return null;
  return (
    <ul className={`tk tk--${size} ${className}`} aria-label={label}>
      {list.map((name) => <Tool key={name} name={name} />)}
    </ul>
  );
}
