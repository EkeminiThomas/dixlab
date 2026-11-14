/* ==========================================================================
   Interviews for case studies and portfolios. With an account and AI
   configured, the server (Claude) picks each question and writes the draft.
   Otherwise this guided version runs in the browser: the same topics, a
   follow-up when an answer is thin, and a draft built from the person's own
   sentences.
   ========================================================================== */
import { interviewNext, interviewDraft, isSignedIn } from '../../api.js';

const CASE_TOPICS = [
  { key: 'context', label: 'The project', q: 'What was the project, and who was it for?', follow: 'When was this, and roughly how long did it run?' },
  { key: 'problem', label: 'The problem', q: 'What was going wrong before you started, and why did it matter?', follow: 'Can you describe one specific moment where that problem showed up?' },
  { key: 'role', label: 'Your part', q: 'What was your part in it? Who else was involved?', follow: 'Which decisions were yours to make?' },
  { key: 'tried', label: 'What you tried', q: 'Walk me through what you actually did. What did you try first?', follow: 'Was there something you tried that didn’t work? What happened?' },
  { key: 'cut', label: 'What you cut', q: 'What did you decide not to do, or cut along the way? Why?', follow: 'What did that trade-off cost you, and was it worth it?' },
  { key: 'changed', label: 'What changed', q: 'What changed because of your work?', follow: 'Is there a number, a quote or a reaction that shows the change?' },
  { key: 'learned', label: 'What you learned', q: 'Looking back, what would you do differently?', follow: null },
];

const PORTFOLIO_TOPICS = [
  { key: 'intro', label: 'What you do', q: 'In a sentence or two, what do you do, and who do you do it for?', follow: 'What kind of work do you want more of?' },
  { key: 'role', label: 'Your title', q: 'What job title or label should people see at the top of your portfolio?', follow: null },
  { key: 'project', label: 'Your projects', q: 'Let’s start with a project you’re proud of. What’s it called?', follow: null },
  { key: 'skills', label: 'Skills & tools', q: 'Which skills and tools do you want to be known for?', follow: null },
  { key: 'experience', label: 'Experience', q: 'Where have you worked or studied? One per line: role, place, years.', follow: null },
  { key: 'proof', label: 'Proof', q: 'Any awards, certifications, clients or kind words worth naming?', follow: null },
];
const MAX_PROJECTS = 4;

export const topicsFor = (kind) => (kind === 'portfolio' ? PORTFOLIO_TOPICS : CASE_TOPICS);
/** Kept for the case study pages that import it directly. */
export const TOPICS = CASE_TOPICS;

const words = (s = '') => s.trim().split(/\s+/).filter(Boolean).length;
const isThin = (a) => words(a) < 15; // short answers get one follow-up

function nextAfter(topics, transcript, done) {
  const covered = new Set(transcript.map((t) => t.topic));
  const next = topics.find((t) => !covered.has(t.key));
  if (!next) return { done: true, topic: topics[topics.length - 1].key, question: done };
  return { done: false, topic: next.key, question: next.q, part: next.key === 'project' ? 'name' : undefined };
}

function nextCase(transcript) {
  if (!transcript.length) return { done: false, topic: CASE_TOPICS[0].key, question: CASE_TOPICS[0].q };
  const last = transcript[transcript.length - 1];
  const topic = CASE_TOPICS.find((t) => t.key === last.topic);
  const askedHere = transcript.filter((t) => t.topic === last.topic).length;
  if (topic?.follow && askedHere === 1 && last.a.trim() && isThin(last.a)) {
    return { done: false, topic: topic.key, question: topic.follow };
  }
  return nextAfter(CASE_TOPICS, transcript, 'Thank you, that’s everything I need. Ready to see it written up?');
}

function nextPortfolio(transcript) {
  if (!transcript.length) return { done: false, topic: 'intro', question: PORTFOLIO_TOPICS[0].q };
  const last = transcript[transcript.length - 1];
  const done = 'Thank you, that’s everything I need. Ready to see your portfolio?';
  if (last.topic === 'intro' && transcript.filter((t) => t.topic === 'intro').length === 1 && last.a.trim() && isThin(last.a)) {
    return { done: false, topic: 'intro', question: PORTFOLIO_TOPICS[0].follow };
  }
  if (last.topic === 'project') {
    const named = transcript.filter((t) => t.topic === 'project' && t.part === 'name' && t.a.trim()).length;
    if (last.part === 'name' && last.a.trim()) {
      return { done: false, topic: 'project', part: 'detail', question: `What is “${last.a.trim().replace(/[.!?]$/, '')}”, what was your part, and what came of it?` };
    }
    if (last.part === 'detail' && named < MAX_PROJECTS) {
      return { done: false, topic: 'project', part: 'name', question: 'Got another project to show? What’s it called? (Skip to move on.)' };
    }
  }
  return nextAfter(PORTFOLIO_TOPICS, transcript, done);
}

/** Next question without AI. */
export const nextLocal = (transcript, kind = 'case') => (kind === 'portfolio' ? nextPortfolio(transcript) : nextCase(transcript));

const sentences = (s = '') => s.replace(/\s+/g, ' ').trim().match(/[^.!?]+[.!?]*/g)?.map((x) => x.trim()).filter(Boolean) || [];
const firstSentence = (s) => sentences(s)[0] || '';
const tidy = (s = '') => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t && /[.!?]$/.test(t) ? t : t ? `${t}.` : '';
};
const listOf = (s = '') => s.split(/,|;|\n|\band\b/).map((x) => x.trim().replace(/[.!]$/, '')).filter(Boolean);

function draftCase(transcript, project) {
  const by = (key) => transcript.filter((t) => t.topic === key && t.a.trim()).map((t) => tidy(t.a)).join(' ');
  const changed = by('changed');
  return {
    title: project.title?.trim() ? project.title : firstSentence(changed).replace(/[.!?]$/, '').slice(0, 80),
    tagline: firstSentence(by('problem')),
    notes: by('context'),
    problem: by('problem'),
    contribution: by('role'),
    process: sentences(by('tried')).slice(0, 5).map((desc) => ({ title: '', desc })),
    tradeoffs: by('cut'),
    solution: changed,
    learned: by('learned'),
  };
}

function draftPortfolio(transcript) {
  const answers = (key) => transcript.filter((t) => t.topic === key && t.a.trim()).map((t) => t.a.trim());
  const intro = answers('intro');
  const projects = [];
  for (const t of transcript) {
    if (t.topic !== 'project' || !t.a.trim()) continue;
    if (t.part === 'name') projects.push({ title: t.a.trim().replace(/[.!?]$/, '').slice(0, 60), desc: '', link: '' });
    else if (projects.length) {
      // A long answer becomes the project page write-up, with its opening as the summary.
      const last = projects[projects.length - 1];
      const text = tidy(t.a);
      if (text.length > 220) { last.desc = firstSentence(text); last.details = text; } else last.desc = text;
    }
    else projects.push({ title: firstSentence(t.a).slice(0, 60), desc: tidy(t.a), link: '' }); // AI-style turn
  }
  const experience = answers('experience').join('\n').split(/\n|;/).map((line) => {
    const [role = '', place = '', ...rest] = line.split(',').map((x) => x.trim());
    const years = rest.join(' ') || line;
    const m = years.match(/(\d{4})\s*(?:[–—-]|to)\s*(\d{4}|present|now|current)/i);
    const one = years.match(/\b(19|20)\d{2}\b/);
    return { role, company: place, from: m ? m[1] : one ? one[0] : '', to: m ? m[2].replace(/^(now|current)$/i, 'Present').replace(/^present$/i, 'Present') : '' };
  }).filter((x) => x.role || x.company);
  return {
    role: (answers('role')[0] || '').replace(/[.!]$/, ''),
    tagline: firstSentence(intro[0] || ''),
    notes: intro.map(tidy).join('\n\n'),
    projects,
    skills: listOf(answers('skills').join(', ')).join(', '),
    experience,
    certs: listOf(answers('proof').join(', ')).join(', '),
  };
}

/** A draft without AI: the person's own answers, placed where they belong. */
export const draftLocal = (transcript, project = {}, kind = 'case') =>
  (kind === 'portfolio' ? draftPortfolio(transcript) : draftCase(transcript, project));

const fallsBack = (e) => e.offline || e.body?.unavailable || [401, 404, 405].includes(e.status);

/** Ask the server first; fall back to the guided version. Resolves to { ..., source }. */
export async function askNext(transcript, hint, preferLocal, kind = 'case') {
  if (!preferLocal && isSignedIn()) {
    try {
      return { ...(await interviewNext(transcript, hint, kind)), source: 'ai' };
    } catch (e) {
      if (!fallsBack(e)) throw e;
    }
  }
  return { ...nextLocal(transcript, kind), source: 'local' };
}

export async function writeDraft(transcript, project, preferLocal, kind = 'case') {
  if (!preferLocal && isSignedIn()) {
    try {
      return { draft: (await interviewDraft(transcript, kind)).draft, source: 'ai' };
    } catch (e) {
      if (!fallsBack(e)) throw e;
    }
  }
  return { draft: draftLocal(transcript, project, kind), source: 'local' };
}

/** The fields an interview draft can fill (kept so "Undo draft" can restore them). */
export const DRAFT_KEYS = ['title', 'tagline', 'role', 'client', 'timeline', 'team', 'notes', 'problem', 'goals', 'research',
  'process', 'contribution', 'tradeoffs', 'solution', 'metrics', 'learned', 'next', 'skills'];
const PORTFOLIO_KEYS = ['role', 'tagline', 'notes', 'skills', 'projects', 'experience', 'certs'];
export const draftKeysFor = (kind) => (kind === 'portfolio' ? PORTFOLIO_KEYS : DRAFT_KEYS);
