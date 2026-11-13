/* ==========================================================================
   Case study data: the recommended fields, sample case studies, image
   uploads, and the normaliser every case study template renders from.
   ========================================================================== */

/**
 * The details a strong case study needs, grouped by editor step.
 * `rec` marks the recommended ones counted in the "case study strength" meter.
 */
export const CASE_FIELDS = [
  { key: 'title', step: 'cs-overview', label: 'Project title', rec: true },
  { key: 'tagline', step: 'cs-overview', label: 'One-line summary', rec: true },
  { key: 'role', step: 'cs-overview', label: 'Your role', rec: true },
  { key: 'client', step: 'cs-overview', label: 'Client or company' },
  { key: 'timeline', step: 'cs-overview', label: 'Timeline' },
  { key: 'team', step: 'cs-overview', label: 'Team' },
  { key: 'skills', step: 'cs-overview', label: 'Tools & skills', rec: true },
  { key: 'notes', step: 'cs-problem', label: 'Background', rec: true },
  { key: 'problem', step: 'cs-problem', label: 'The problem', rec: true },
  { key: 'goals', step: 'cs-problem', label: 'Goals', rec: true },
  { key: 'audience', step: 'cs-problem', label: 'Audience' },
  { key: 'constraints', step: 'cs-problem', label: 'Constraints' },
  { key: 'research', step: 'cs-process', label: 'Research & discovery' },
  { key: 'process', step: 'cs-process', label: 'Process steps', rec: true },
  { key: 'contribution', step: 'cs-process', label: 'Your contribution', rec: true },
  { key: 'tradeoffs', step: 'cs-process', label: 'What you cut', rec: true },
  { key: 'solution', step: 'cs-results', label: 'The solution', rec: true },
  { key: 'metrics', step: 'cs-results', label: 'Results in numbers', rec: true },
  { key: 'quote', step: 'cs-results', label: 'Testimonial' },
  { key: 'learned', step: 'cs-results', label: 'What you learned', rec: true },
  { key: 'next', step: 'cs-results', label: 'Next steps' },
  { key: 'cover', step: 'cs-materials', label: 'Cover image', rec: true },
  { key: 'gallery', step: 'cs-materials', label: 'Supporting visuals' },
  { key: 'files', step: 'cs-materials', label: 'Files & attachments' },
  { key: 'link', step: 'cs-materials', label: 'Live link or prototype' },
];

const has = (p, key) => {
  const v = p[key];
  if (key === 'process') return (v || []).some((s) => s.title?.trim() || s.desc?.trim());
  if (key === 'metrics') return (v || []).some((m) => m.value?.trim() && m.label?.trim());
  if (key === 'gallery' || key === 'files') return (v || []).some((g) => g.src);
  if (key === 'cover') return Boolean(v?.src);
  return typeof v === 'string' ? v.trim().length > 0 : Boolean(v);
};

/** How complete a case study is: recommended fields filled, and what's missing. */
export function caseStrength(p) {
  const rec = CASE_FIELDS.filter((f) => f.rec);
  const missing = rec.filter((f) => !has(p, f.key));
  return { done: rec.length - missing.length, total: rec.length, missing, filled: (key) => has(p, key) };
}

export const blankStep = () => ({ title: '', desc: '' });
export const blankMetric = () => ({ value: '', label: '' });

const S = (o) => o;
export const CASE_SAMPLES = {
  ux: S({
    title: 'Booking a hospital appointment in under a minute', tagline: 'Redesigning outpatient booking for 1.2 million patients a year.',
    client: 'Northwind Health', role: 'Lead product designer', team: '1 designer, 4 engineers, 1 PM', timeline: '14 weeks · 2025', industry: 'Healthcare',
    skills: ['User research', 'Interaction design', 'Prototyping', 'Figma', 'Accessibility'],
    context: 'Northwind’s patients booked appointments over the phone or through a 12-step web form built in 2014. Call centres were overwhelmed and online bookings were falling.',
    problem: 'Seven in ten patients who started booking online gave up before confirming, and older patients found the form impossible on a phone.',
    goals: ['Cut the time to book an appointment by half', 'Raise online completion above 60%', 'Meet WCAG 2.2 AA throughout'],
    audience: 'Outpatients aged 18–90, many booking on behalf of a relative.', constraints: 'Had to work with the existing scheduling system and NHS identity rules.',
    research: 'Interviewed 18 patients and 6 call-centre staff, ran a diary study and audited 3,000 abandoned sessions.',
    process: [
      { title: 'Discover', desc: 'Mapped every step of the booking journey and where people dropped out.' },
      { title: 'Define', desc: 'Turned findings into three principles: fewer decisions, plain words, forgiving inputs.' },
      { title: 'Prototype', desc: 'Tested four rounds of prototypes with 32 patients, including screen-reader users.' },
      { title: 'Ship', desc: 'Released to 10% of patients, then everyone after the numbers held.' },
    ],
    tradeoffs: 'I cut rescheduling from the first release. It touched three hospital systems and would have doubled the timeline, and the people abandoning were booking, not rescheduling.',
    contribution: 'I led research and design end to end, ran every usability session and worked daily with engineers on the build.',
    solution: 'A three-step flow that suggests the earliest slots first, remembers details for next time and works fully by keyboard.',
    metrics: [{ value: '54s', label: 'median time to book, down from 6 minutes' }, { value: '71%', label: 'online completion rate' }, { value: '−38%', label: 'calls to the booking line' }],
    quote: 'Patients tell us it’s the easiest thing they’ve done online with the NHS.', quoteBy: 'Head of Outpatients, Northwind Health',
    learned: 'Accessibility work done early made the product better for everyone, not just the people it was aimed at.',
    next: 'Bring the same patterns to test results and prescriptions.', link: 'northwind.health/booking',
  }),
  eng: S({
    title: 'Cutting checkout latency by 60%', tagline: 'Rebuilding the payments service for a growing delivery platform.',
    client: 'Parcelwise', role: 'Senior software engineer', team: '5 engineers', timeline: '5 months · 2024', industry: 'Logistics',
    skills: ['Go', 'PostgreSQL', 'Kafka', 'AWS', 'Observability'],
    context: 'Parcelwise grew from 3 to 22 markets in two years. The monolith’s checkout path hadn’t changed since launch.',
    problem: 'Checkout took 2.4 seconds at peak and failed for 1.8% of orders, costing an estimated $3m a year.',
    goals: ['Bring p95 checkout latency under one second', 'Cut failed payments below 0.3%', 'Migrate with zero downtime'],
    audience: 'Customers in 22 markets and the internal finance team.', constraints: 'No downtime allowed during peak season.',
    research: 'Profiled production traffic and traced every external call in the checkout path.',
    process: [
      { title: 'Measure', desc: 'Added tracing to find the five calls responsible for 80% of the wait.' },
      { title: 'Split', desc: 'Moved payments into its own service behind a feature flag.' },
      { title: 'Harden', desc: 'Added idempotency keys, retries and a circuit breaker for the payment provider.' },
      { title: 'Migrate', desc: 'Shifted traffic market by market with automatic rollback.' },
    ],
    tradeoffs: 'We didn’t rewrite the whole checkout. Only the payment path moved out; cart and pricing stayed in the monolith until the new service had proved itself.',
    contribution: 'I designed the new service, led the migration plan and wrote the load-testing suite.',
    solution: 'An event-driven payments service with parallel provider calls and safe retries.',
    metrics: [{ value: '−60%', label: 'p95 checkout latency' }, { value: '0.2%', label: 'failed payments' }, { value: '0', label: 'minutes of downtime' }],
    quote: 'The quietest peak season we’ve ever had.', quoteBy: 'VP Engineering, Parcelwise',
    learned: 'Measure before you design. Half our early ideas targeted the wrong bottleneck.', next: 'Apply the same pattern to refunds.', link: '',
  }),
  brand: S({
    title: 'Relaunching a 90-year-old tea brand', tagline: 'A new identity, packaging and launch campaign for Hartley’s Tea.',
    client: 'Hartley’s Tea', role: 'Brand & campaign lead', team: 'Studio of 6', timeline: '6 months · 2025', industry: 'Food & drink',
    skills: ['Brand strategy', 'Identity', 'Packaging', 'Campaigns', 'Social'],
    context: 'Hartley’s was loved by older customers but invisible to anyone under 40, and supermarkets were cutting shelf space.',
    problem: 'Sales had fallen 12% in three years and the packaging looked indistinguishable from own-label tea.',
    goals: ['Reach drinkers under 40 without losing loyal customers', 'Win back shelf space in two supermarkets', 'Grow sales 10% in year one'],
    audience: 'Existing loyal customers and curious younger tea drinkers.', constraints: 'Keep the heritage crest and stay within a £400k launch budget.',
    research: 'Ran shelf audits in 40 stores, two customer workshops and a review of 1930s archive designs.',
    process: [
      { title: 'Strategy', desc: 'Defined the idea “a proper cup, properly made”.' },
      { title: 'Identity', desc: 'Redrew the crest and built a colour system per blend.' },
      { title: 'Packaging', desc: 'Tested three directions on shelf with 200 shoppers.' },
      { title: 'Launch', desc: 'An out-of-home and social campaign across five cities.' },
    ],
    tradeoffs: 'We dropped the plan to rename the blends. Customers knew them by number, and renaming would have confused the loyal buyers we couldn’t afford to lose.',
    contribution: 'I led strategy and creative direction and presented to the founding family.',
    solution: 'A bold, archive-inspired identity with a colour per blend that stands out from across the aisle.',
    metrics: [{ value: '+23%', label: 'sales in the first year' }, { value: '2', label: 'new supermarket listings' }, { value: '4.1m', label: 'campaign impressions' }],
    quote: 'It finally looks like the tea we always knew we made.', quoteBy: 'Managing Director, Hartley’s Tea',
    learned: 'Heritage is an asset when you edit it, not when you preserve all of it.', next: 'Extend the system to a café range.', link: '',
  }),
  research: S({
    title: 'Why students abandon sign-up', tagline: 'A mixed-methods study for a university events app.',
    client: 'Campus Collective', role: 'UX researcher', team: '2 researchers', timeline: '8 weeks · 2024', industry: 'Education',
    skills: ['Interviews', 'Surveys', 'Analytics', 'Usability testing', 'Synthesis'],
    context: 'The events app had strong downloads but only 22% of new users finished creating an account.',
    problem: 'Nobody knew whether students were leaving because of the form, trust, or simply not seeing the value yet.',
    goals: ['Find the main reasons students abandon sign-up', 'Recommend fixes the team could ship in a sprint', 'Set a baseline for future tests'],
    audience: 'First- and second-year students at three universities.', constraints: 'Eight weeks and no budget for incentives over £10.',
    research: 'Funnel analysis of 14,000 sessions, a 600-person survey and 12 interviews.',
    process: [
      { title: 'Hypothesis', desc: 'Students drop out because they are asked for too much, too soon.' },
      { title: 'Measure', desc: 'Funnel analysis showed 61% left at the phone-number step.' },
      { title: 'Listen', desc: 'Interviews revealed students feared spam from societies.' },
      { title: 'Test', desc: 'An A/B test made the phone number optional and explained why we ask.' },
    ],
    tradeoffs: 'I chose not to start with a big survey. Interviews came first, so we knew which questions were worth asking at scale.',
    contribution: 'I planned the study, ran the interviews and presented findings to the leadership team.',
    solution: 'Ask for less up front, explain every field and let students browse events before signing up.',
    metrics: [{ value: '22% → 48%', label: 'sign-up completion' }, { value: '61%', label: 'drop-off found at one step' }, { value: '12', label: 'interviews synthesised' }],
    quote: '', quoteBy: '', learned: 'The loudest opinion in the room was the wrong hypothesis; the data settled it in a day.', next: 'Study retention in the first month.', link: '',
  }),
  ops: S({
    title: 'Reducing warehouse costs by 18%', tagline: 'Redesigning the fulfilment network for a national grocer.',
    client: 'Freshcart', role: 'Operations consultant', team: '3 consultants, client ops team', timeline: '12 weeks · 2025', industry: 'Retail',
    skills: ['Network design', 'Data modelling', 'Stakeholder management', 'Excel', 'SQL'],
    context: 'Freshcart ran nine warehouses with overlapping delivery areas built up through acquisitions.',
    problem: 'Cost per order was 30% above competitors, and two sites were running at under half capacity.',
    goals: ['Cut cost per order by 15%', 'Keep next-day delivery for 98% of customers', 'Agree a plan the board could approve'],
    audience: 'The executive team and regional operations leaders.', constraints: 'No redundancies in the first year.',
    research: 'Modelled 18 months of order data and visited every site.',
    process: [
      { title: 'Baseline', desc: 'Built a cost model for every site and route.' },
      { title: 'Options', desc: 'Compared five network designs on cost, service and risk.' },
      { title: 'Decide', desc: 'Ran workshops with regional leaders to agree the preferred option.' },
      { title: 'Plan', desc: 'Phased the change over 18 months with clear checkpoints.' },
    ],
    tradeoffs: 'We ruled out closing a third site. It saved more on paper but would have broken next-day delivery for a whole region.',
    contribution: 'I built the network model and led the regional workshops.',
    solution: 'Consolidate to seven sites, re-zone delivery areas and redeploy staff to growing regions.',
    metrics: [{ value: '−18%', label: 'cost per order' }, { value: '98.6%', label: 'next-day coverage kept' }, { value: '£11m', label: 'annual savings' }],
    quote: 'Clear, honest and built with our people, not just for them.', quoteBy: 'COO, Freshcart', learned: 'Involving the people who run the sites early turned critics into owners.', next: 'Track savings quarterly against the model.', link: '',
  }),
};

const lines = (v) => (Array.isArray(v) ? v : (v || '').split('\n')).map((s) => String(s).replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
const list = (v) => (Array.isArray(v) ? v : (v || '').split(',')).map((s) => String(s).trim()).filter(Boolean);

/** Map a saved Dixlab project to case study data. */
export function projectToCase(p) {
  return {
    title: p.title, tagline: p.tagline, client: p.client, role: p.role, team: p.team, timeline: p.timeline, industry: p.industry,
    skills: list(p.skills), context: p.notes, problem: p.problem, goals: lines(p.goals), audience: p.audience, constraints: p.constraints,
    research: p.research, process: p.process || [], contribution: p.contribution, tradeoffs: p.tradeoffs, solution: p.solution, metrics: p.metrics || [],
    quote: p.quote, quoteBy: p.quoteBy, learned: p.learned, next: p.next, link: p.link,
    cover: p.cover || null, gallery: p.gallery || [], files: p.files || [], brand: p.brand || {}, ghost: true,
  };
}

/** Normalise for rendering. With `ghost`, empty key sections borrow faded sample text. */
export function cs(data = {}) {
  const base = CASE_SAMPLES.ux;
  const ghost = {};
  const t = (v) => (typeof v === 'string' ? v.trim() : v);
  const pick = (key, value, empty) => {
    if (!empty || !data.ghost) return value;
    ghost[key] = true;
    return base[key];
  };
  const process = (data.process || []).filter((s) => t(s.title) || t(s.desc));
  const metrics = (data.metrics || []).filter((m) => t(m.value) && t(m.label));
  const goals = lines(data.goals);
  const skills = list(data.skills);
  const out = {
    title: t(data.title) || 'Untitled case study',
    tagline: pick('tagline', t(data.tagline) || '', !t(data.tagline)),
    client: t(data.client) || '', role: t(data.role) || '', team: t(data.team) || '', timeline: t(data.timeline) || '', industry: t(data.industry) || '',
    skills,
    context: pick('context', t(data.context) || '', !t(data.context)),
    problem: pick('problem', t(data.problem) || '', !t(data.problem)),
    goals: pick('goals', goals, !goals.length),
    audience: t(data.audience) || '', constraints: t(data.constraints) || '', research: t(data.research) || '',
    process: pick('process', process, !process.length),
    contribution: t(data.contribution) || '',
    tradeoffs: t(data.tradeoffs) || '',
    solution: pick('solution', t(data.solution) || '', !t(data.solution)),
    metrics: pick('metrics', metrics, !metrics.length),
    quote: t(data.quote) || '', quoteBy: t(data.quoteBy) || '',
    learned: t(data.learned) || '', next: t(data.next) || '', link: t(data.link) || '',
    cover: data.cover?.src ? data.cover : null,
    gallery: (data.gallery || []).filter((g) => g.src),
    files: (data.files || []).filter((f) => f.src),
  };
  out.ghost = ghost;
  out.facts = [['Client', out.client], ['Role', out.role], ['Timeline', out.timeline], ['Team', out.team], ['Industry', out.industry]].filter(([, v]) => v);
  return out;
}

/* ---------- Image uploads ---------- */

export const MAX_GALLERY = 8;

/**
 * Read an image file, scale it down and re-encode it so it fits comfortably in
 * browser storage. Resolves to a data: URL.
 */
export function readImage(file, maxW = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) { reject(new Error('That file isn’t an image.')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.naturalWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Couldn’t read that image.')); };
    img.src = url;
  });
}
