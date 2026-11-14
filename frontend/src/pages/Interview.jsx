import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AppArrow, AppSparkles13, loadProjects, saveProjects } from '../components/ui.jsx';
import { pushProject, fetchProject, isSignedIn } from '../api.js';
import { topicsFor, askNext, writeDraft, draftKeysFor } from '../components/case/interview.js';

const MIN_ANSWERS = 3;

/** Browser speech recognition, if available (Chrome, Edge, Safari). */
const Speech = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);

/**
 * The case study interview: one question at a time, follow-ups when an answer
 * is thin, then a draft in the person's own words.
 */
export default function Interview() {
  const { id } = useParams();
  const nav = useNavigate();
  const [project, setProject] = useState(() => loadProjects().find((p) => p.id === id) || null);
  const kind = project?.type === 'portfolio' ? 'portfolio' : 'case';
  const TOPICS = topicsFor(kind);
  const home = kind === 'portfolio' ? '/portfolio' : '/case';
  const [transcript, setTranscript] = useState(() => project?.interview?.transcript || []);
  const [pending, setPending] = useState(null); // { topic, question, done, source }
  const [answer, setAnswer] = useState('');
  const [thinking, setThinking] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState('');
  const [local, setLocal] = useState(false); // fell back to the guided version
  const [listening, setListening] = useState(false);
  const recog = useRef(null);
  const endRef = useRef(null);
  const inputRef = useRef(null);

  // Open on a device that hasn't cached this project yet.
  useEffect(() => {
    if (project || !isSignedIn()) return;
    fetchProject(id).then((p) => {
      if (!p) return;
      saveProjects([p, ...loadProjects().filter((x) => x.id !== p.id)]);
      setProject(p);
      setTranscript(p.interview?.transcript || []);
    });
  }, [id, project]);

  const save = (patch) => {
    const next = { ...project, ...patch, sample: false, updatedAt: Date.now() };
    saveProjects(loadProjects().map((p) => (p.id === next.id ? next : p)));
    pushProject(next);
    setProject(next);
    return next;
  };

  const ask = async (t = transcript, forceLocal = local) => {
    setThinking(true);
    setError('');
    try {
      const next = await askNext(t, project?.title || '', forceLocal, kind);
      if (next.source === 'local') setLocal(true);
      setPending(next);
    } catch (e) {
      setError(e.message || 'Couldn’t get the next question.');
    } finally {
      setThinking(false);
    }
  };

  // First question (or resume where we left off).
  useEffect(() => { if (project && !pending && !thinking) ask(); }, [project?.id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [transcript.length, pending, thinking]);
  useEffect(() => { if (pending && !pending.done) inputRef.current?.focus(); }, [pending]);
  useEffect(() => () => recog.current?.stop(), []);

  const reply = (text) => {
    if (!pending || thinking) return;
    stopListening();
    const t = [...transcript, { topic: pending.topic, q: pending.question, a: text.trim(), ...(pending.part ? { part: pending.part } : {}) }];
    setTranscript(t);
    setAnswer('');
    save({ interview: { ...(project.interview || {}), transcript: t } });
    if (pending.done) { setPending(null); return; }
    ask(t);
  };

  const answered = transcript.filter((t) => t.a).length;
  const covered = useMemo(() => new Set(transcript.filter((t) => t.a).map((t) => t.topic)), [transcript]);
  const finished = pending?.done || covered.size === TOPICS.length;

  const write = async () => {
    setWriting(true);
    setError('');
    try {
      const { draft, source } = await writeDraft(transcript, project, local, kind);
      const backup = Object.fromEntries(draftKeysFor(kind).map((k) => [k, project[k] ?? '']));
      const filled = Object.fromEntries(Object.entries(draft).filter(([, v]) => (Array.isArray(v) ? v.length : String(v ?? '').trim())));
      if (filled.projects) {
        // Keep media already uploaded to a project with the same name, and any project that has media.
        const existing = (project.projects || []).filter((p) => p.title || p.desc || p.media?.length);
        const key = (s = '') => s.trim().toLowerCase();
        filled.projects = filled.projects.map((p) => {
          const match = existing.find((e) => key(e.title) && key(e.title) === key(p.title));
          if (!match) return p;
          // Keep anything the user already wrote for this project that the draft leaves blank.
          const fresh = Object.fromEntries(Object.entries(p).filter(([, v]) => String(v ?? '').trim()));
          return { ...match, ...fresh, media: match.media };
        });
        const used = new Set(filled.projects.map((p) => key(p.title)));
        filled.projects.push(...existing.filter((e) => e.media?.length && !used.has(key(e.title))));
      }
      save({
        ...filled,
        draftBackup: backup,
        interview: { transcript, drafted: true, reviewed: false, source, at: Date.now() },
      });
      nav(`/editor/${project.id}`);
    } catch (e) {
      setError(e.message || 'Couldn’t write the draft. Your answers are saved; try again.');
      setWriting(false);
    }
  };

  /* Voice answers */
  const startListening = () => {
    if (!Speech) return;
    const r = new Speech();
    r.lang = navigator.language || 'en-GB';
    r.continuous = true;
    r.interimResults = true;
    const base = answer ? `${answer.trim()} ` : '';
    r.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      setAnswer(base + text.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    recog.current = r;
    r.start();
    setListening(true);
  };
  const stopListening = () => { recog.current?.stop(); recog.current = null; setListening(false); };

  if (!project) {
    return (
      <div className="intv intv--empty">
        <p>We couldn’t find that project.</p>
        <Link to="/dashboard" className="app-btn app-btn--primary">Back to your work</Link>
      </div>
    );
  }

  return (
    <div className="intv">
      <header className="intv__bar">
        <Link to={home} className="ed__back">← {kind === 'portfolio' ? 'Portfolios' : 'Case studies'}</Link>
        <p className="intv__title">{kind === 'portfolio' ? 'Portfolio interview' : 'Case study interview'}</p>
        <span className={`intv__mode ${local ? '' : 'is-ai'}`} title={local ? 'Guided questions, written in your browser' : 'Questions and draft by AI'}>
          {local ? 'Guided' : <><AppSparkles13 /> AI interviewer</>}
        </span>
        <Link to={`/editor/${project.id}`} className="app-btn app-btn--ghost">Fill in the form instead</Link>
      </header>

      <div className="intv__body">
        <aside className="intv__side" aria-label="Interview progress">
          <p className="intv__k">About 10 minutes</p>
          <ol className="intv__topics">
            {TOPICS.map((t) => (
              <li key={t.key} className={`${covered.has(t.key) ? 'is-done' : ''} ${pending?.topic === t.key && !finished ? 'is-now' : ''}`}>
                <span aria-hidden>{covered.has(t.key) ? '✓' : ''}</span>{t.label}
              </li>
            ))}
          </ol>
          <div className="intv__tip">
            <p><b>Talk like you would to a friend.</b> {kind === 'portfolio' ? 'Name real projects and what came of them. You can add images and videos to each one afterwards.' : 'Specifics beat polish: the moment it went wrong, the thing you cut, the number that moved.'}</p>
            <p>Your answers stay in your account. Nothing is published until you choose to.</p>
          </div>
        </aside>

        <main className="intv__main">
          <ol className="intv__chat" aria-live="polite">
            {transcript.length === 0 && !thinking && (
              <li className="intv__intro">
                <h1>{kind === 'portfolio' ? 'Let’s build your portfolio together.' : 'Tell me about a project you’re proud of.'}</h1>
                <p>{kind === 'portfolio'
                  ? 'I’ll ask what you do, then about a few projects you’re proud of, your skills and experience. Then I’ll write your portfolio in your own words. Skip anything you’d rather not answer.'
                  : 'I’ll ask a few questions, one at a time, and dig in where it matters. Then I’ll draft your case study using your own words. Skip anything you’d rather not answer.'}</p>
              </li>
            )}
            {transcript.map((t, i) => (
              <li key={i} className="intv__turn">
                <p className="intv__q">{t.q}</p>
                {t.a ? <p className="intv__a">{t.a}</p> : <p className="intv__a is-skip">Skipped</p>}
              </li>
            ))}
            {pending && (
              <li className="intv__turn is-current">
                <p className="intv__q">{pending.question}</p>
              </li>
            )}
            {thinking && <li className="intv__thinking" aria-label="Thinking"><i /><i /><i /></li>}
            <li ref={endRef} aria-hidden />
          </ol>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="intv__compose">
            {pending && !pending.done ? (
              <form onSubmit={(e) => { e.preventDefault(); if (answer.trim()) reply(answer); }}>
                <textarea
                  ref={inputRef}
                  className="field__input intv__input"
                  rows={4}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); if (answer.trim()) reply(answer); } }}
                  placeholder={listening ? 'Listening… speak naturally, then press Send.' : 'Type your answer, or use the microphone to talk it through.'}
                  aria-label="Your answer"
                  maxLength={6000}
                  disabled={thinking || writing}
                />
                <div className="intv__actions">
                  {Speech && (
                    <button type="button" className={`app-btn app-btn--ghost intv__mic ${listening ? 'is-on' : ''}`} onClick={listening ? stopListening : startListening} aria-pressed={listening} title="Uses your browser’s speech recognition">
                      <span className="intv__dot" aria-hidden />{listening ? 'Stop' : 'Speak'}
                    </button>
                  )}
                  <button type="button" className="ed__browse intv__skip" onClick={() => reply('')} disabled={thinking}>Skip this question</button>
                  <span className="intv__hint">Ctrl+Enter to send</span>
                  <button type="submit" className="app-btn app-btn--primary" disabled={!answer.trim() || thinking}><span>Send</span><AppArrow /></button>
                </div>
              </form>
            ) : null}

            <div className={`intv__finish ${finished ? 'is-ready' : ''}`}>
              <p>
                {finished ? 'That’s everything. Let’s see it written up.'
                  : answered < MIN_ANSWERS ? `Answer ${MIN_ANSWERS - answered} more question${MIN_ANSWERS - answered === 1 ? '' : 's'} and I can write a first draft.`
                  : 'Enough for a first draft. Keep going for a stronger one.'}
              </p>
              <button className={`app-btn ${finished ? 'app-btn--primary' : 'app-btn--ghost'}`} onClick={write} disabled={answered < MIN_ANSWERS || writing || thinking}>
                <span>{writing ? `Writing your ${kind === 'portfolio' ? 'portfolio' : 'case study'}…` : `Write my ${kind === 'portfolio' ? 'portfolio' : 'case study'}`}</span>{!writing && <AppArrow />}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
