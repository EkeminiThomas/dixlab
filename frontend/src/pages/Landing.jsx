import { useState } from 'react';
import { Link } from 'react-router-dom';
import { img } from '../assets.js';
import { Logo, Icon, SectionLabel, PortfolioPreview, CVPreview, useAmbient } from '../components/ui.jsx';
import { ScaledSite } from '../components/sites/index.jsx';

const FAQS = [
  ['What can I create with Dixlab?', 'Dixlab helps turn your skills, experience, and projects into professional portfolios, CVs, and case studies. Think of it as a way to shape your professional story—not simply generate another document.'],
  ['Do I need design or writing experience?', 'Not at all. Start with rough notes in your own words. Guided questions help you find the story, and templates take care of the presentation.'],
  ['Can I use it if I’m just starting my career?', 'Yes. Coursework, side projects, volunteering and part-time roles all count. Dixlab helps you connect them to the skills you bring to your next opportunity.'],
  ['Will AI-generated content still sound like me?', 'Your experience is always the source of truth. Suggestions are a starting point—you refine the language until it sounds like you on your best day.'],
  ['Is Dixlab only for designers and developers?', 'No. Freelancers, graduates, career changers and anyone growing in their field can use Dixlab to show what they’re capable of.'],
];

const TEMPLATE_TABS = ['All templates', 'Portfolios', 'CVs', 'Case studies'];

function CtaButton({ to, children, variant = 'primary', arrow = true }) {
  const arrowSrc = { primary: img.arrowUpRightWhite18, outline: img.arrowUpRightInk18, light: img.arrowUpRightAccent18 }[variant];
  return (
    <Link to={to} className={`cta-btn cta-btn--${variant}`}>
      <span>{children}</span>
      {arrow && <Icon src={arrowSrc} size={18} />}
    </Link>
  );
}

function Heading({ lines, className = 'h-section' }) {
  return (
    <h2 className={className}>
      {lines.map((l, i) => <span key={i} className="line">{l}</span>)}
    </h2>
  );
}

export default function Landing() {
  const [open, setOpen] = useState(0);
  const [tab, setTab] = useState(TEMPLATE_TABS[0]);
  useAmbient();

  const templates = [
    { key: 'Portfolios', name: 'Folio', desc: 'Portfolio · Personal & minimal' },
    { key: 'Portfolios', name: 'Studio', desc: 'Portfolio · Bold & considered' },
    { key: 'CVs', name: 'Outline', desc: 'CV · Focused & professional' },
    { key: 'Case studies', name: 'Narrative', desc: 'Case study · Editorial & expressive' },
  ].filter((t) => tab === 'All templates' || t.key === tab);

  return (
    <div className="landing">
      {/* NAVIGATION */}
      <header className="lnav">
        <Logo />
        <nav className="lnav__links">
          <a href="#why">Why Dixlab</a>
          <a href="#how">How it works</a>
          <a href="#templates">Templates</a>
        </nav>
        <div className="lnav__actions">
          <Link to="/login" className="lnav__login">Log in</Link>
          <CtaButton to="/signup">Get started</CtaButton>
        </div>
      </header>

      {/* HERO */}
      <section className="hero">
        <div className="hero__message">
          <p className="pill">
            <Icon src={img.sparkles14} size={14} />
            YOUR EXPERIENCE. A NEW PERSPECTIVE.
          </p>
          <h1 className="hero__title"><span className="line">Turn your</span><span className="line">work into</span><span className="line line--grad">opportunities.</span></h1>
          <p className="hero__lead">Tell Dixlab about your work in a ten-minute conversation. It writes the case study in your own words, and gives you a link worth sending.</p>
          <div className="hero__actions">
            <CtaButton to="/signup">Start building your story</CtaButton>
            <a href="#templates" className="cta-btn cta-btn--outline"><span>Explore templates</span></a>
          </div>
          <p className="hero__note"><Icon src={img.check14} size={14} />No perfect starting point needed. Just you and your work.</p>
        </div>

        <div className="hero__art-wrap">
          <div className="hero__art" aria-hidden>
            <img className="hero__backdrop" src={img.heroBackdrop} width="590" height="560" alt="" />
            <p className="hero__tab"><Icon src={img.marker} size={6} />A professional presence, made personal</p>
            <div className="hero__portfolio"><PortfolioPreview width={520} photo={img.photoChairHero} /></div>
            <div className="hero__cv"><CVPreview width={230} /></div>
            <div className="hero__ai">
              <span className="hero__ai-icon"><Icon src={img.sparkles18} size={18} /></span>
              <span>
                <strong>Your experience, clearly expressed.</strong>
                <small>AI-assisted. Always your story.</small>
              </span>
            </div>
            <p className="hero__caption">Illustrative professional assets</p>
          </div>
        </div>
      </section>

      <section className="audience" id="why">
        <p className="audience__lead">Good work deserves to be seen.<br />Whatever your starting point.</p>
        {['Designers', 'Developers', 'Freelancers', 'Graduates', 'Career changers'].map((a) => <p key={a}>{a}</p>)}
      </section>

      {/* HOW IT WORKS */}
      <section className="sec sec--sand" id="how">
        <div className="sec__intro sec__intro--narrow">
          <SectionLabel>From experience to expression</SectionLabel>
          <Heading lines={['You don’t need a finished story.', 'Just a place to start.']} />
        </div>
        <div className="flow">
          <div className="flow__card flow__card--raw">
            <p className="flow__label"><Icon src={img.stickyNote15} size={15} />MY PROJECT NOTES</p>
            <p className="flow__quote">“Built a campus events app. Worked on the API. Made it easier to find things.”</p>
          </div>
          <Icon src={img.arrowRight} size={20} className="flow__arrow" />
          <div className="flow__card flow__card--ai">
            <p className="flow__label flow__label--accent"><Icon src={img.sparkles15} size={15} />A LITTLE HELP FINDING THE WORDS</p>
            <p className="flow__questions">What problem did you solve?<br />What part did you own?<br />What did you learn?</p>
          </div>
          <Icon src={img.arrowRight} size={20} className="flow__arrow" />
          <div className="flow__card flow__card--out">
            <p className="flow__label flow__label--accent"><Icon src={img.fileCheck15} size={15} />A STORY WORTH SHARING</p>
            <p className="flow__story">Connecting a campus,<br />one event at a time.</p>
            <p className="flow__link">Project case study ↗</p>
          </div>
        </div>
        <div className="steps">
          {[
            ['01 —', 'Start with what you have.', 'A project, a role, a course, or a few rough notes. Your everyday experience is a meaningful place to begin.'],
            ['02 —', 'Find the story in your work.', 'Let AI help you connect the dots, find the right words, and bring your contribution into focus.'],
            ['03 —', 'Make it yours. Put it to work.', 'Refine your story and choose a professional format for your next application, conversation, or opportunity.'],
          ].map(([n, t, d]) => (
            <div key={n} className="step">
              <p className="step__n">{n}</p>
              <h3 className="step__t">{t}</h3>
              <p className="step__d">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* PROFESSIONAL ASSETS */}
      <section className="sec sec--tall">
        <div className="sec__head">
          <div className="sec__intro">
            <SectionLabel>One story. More ways to tell it.</SectionLabel>
            <Heading lines={['Make your experience', 'work harder for you.']} />
          </div>
          <p className="sec__aside">Not another blank document. A clearer, more connected way to build your professional identity.</p>
        </div>
        <div className="caps">
          <div className="cap">
            <div className="cap__show cap__show--portfolio"><PortfolioPreview width={356} /></div>
            <CapText n="01 / PORTFOLIOS" t="A home for your best work." d="Connect your projects, skills, and perspective in a portfolio that feels like you—not just a collection of links." />
          </div>
          <div className="cap">
            <div className="cap__show cap__show--cv"><CVPreview width={270} /></div>
            <CapText n="02 / CVs" t="More than a list of roles." d="Turn experience into a clear, purposeful CV that communicates your strengths and where you want to go next." />
          </div>
          <div className="cap">
            <div className="cap__show cap__show--case"><CaseStudyPreview /></div>
            <CapText n="03 / CASE STUDIES" t="Show the thinking behind it." d="Give your projects context. Tell the story of the challenge, your contribution, and what you learned along the way." />
          </div>
        </div>
      </section>

      {/* AI + IDENTITY */}
      <section className="sec voice">
        <div className="voice__demo">
          <div className="voice__head">
            <span className="voice__dots" aria-hidden><i /><i /><i /></span>
            <p>YOUR STORY, COMING INTO FOCUS</p>
            <Icon src={img.sparkles18} size={18} />
          </div>
          <div className="voice__orig">
            <p className="voice__k">YOUR STARTING POINT</p>
            <p className="voice__q">“I redesigned the sign-up flow for a student project. I did interviews and made prototypes.”</p>
          </div>
          <div className="voice__draft">
            <p className="voice__k voice__k--accent"><Icon src={img.sparkles13} size={13} />A CLEARER WAY TO SAY IT</p>
            <p className="voice__text">I explored where students struggled with sign-up, then translated interview insights into a simpler, more considered onboarding experience.</p>
            <div className="chips"><span>User research</span><span>Interaction design</span></div>
          </div>
          <p className="voice__note">Illustrative rewrite. Your experience remains the source of truth.</p>
        </div>
        <div className="voice__copy">
          <div className="sec__intro">
            <SectionLabel>AI support. Human substance.</SectionLabel>
            <Heading lines={['Sound like you.', 'On your best day.']} />
            <p className="sec__lead">You know your work. Finding the words is a different skill. Dixlab helps turn what you’ve done into a clear professional narrative.</p>
          </div>
          <ul className="benefits">
            {[
              ['Find the value in the details', 'Bring your skills, decisions, and contributions out of the background.'],
              ['Build a consistent professional identity', 'Carry the same clear story across your portfolio, CV, and case studies.'],
              ['Keep the story honest—and yours', 'Use AI as a starting point. Refine the language and stay true to your experience.'],
            ].map(([t, d]) => (
              <li key={t}>
                <Icon src={img.check19} size={19} />
                <div><p className="benefits__t">{t}</p><p className="benefits__d">{d}</p></div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="sec sec--white">
        <div className="sec__head">
          <div className="sec__intro">
            <SectionLabel>Different paths. Shared potential.</SectionLabel>
            <Heading lines={['Wherever you’re starting,', 'start with your strengths.']} />
          </div>
          <p className="sec__aside">For your first role, your next client, or a new direction. You don’t have to have it all figured out.</p>
        </div>
        <div className="uses">
          {[
            [img.penTool, 'FOR DESIGNERS & CREATIVES', ['“My work is ready.', 'My portfolio isn’t.”'], 'Give scattered projects a cohesive home. Bring your process, visual work, and point of view together in a portfolio you feel ready to share.', 'From project folders to a professional portfolio ↗', ['Portfolio', 'Personal brand']],
            [img.code, 'FOR DEVELOPERS & BUILDERS', ['“There’s more to my', 'work than the code.”'], 'Make your contribution visible beyond the repository. Explain the problem, the technical choices, and the thinking that went into building it.', 'From a repository to a compelling case study ↗', ['Case studies', 'Technical storytelling']],
            [img.graduationCap, 'FOR GRADUATES & JOB SEEKERS', ['“I have potential.', 'How do I show it?”'], 'Coursework, side projects, volunteering—it all counts. Connect your experience to the skills you can bring to your next opportunity.', 'From everyday experience to a purposeful CV ↗', ['CV', 'Career direction']],
          ].map(([icon, label, quote, body, outcome, tags]) => (
            <div key={label} className="use">
              <p className="use__label"><Icon src={icon} size={18} />{label}</p>
              <p className="use__quote">{quote[0]}<br />{quote[1]}</p>
              <p className="use__body">{body}</p>
              <div className="use__out">
                <Link to="/signup" className="use__link">{outcome}</Link>
                <div className="chips chips--white">{tags.map((t) => <span key={t}>{t}</span>)}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="uses__more">
          <p>Freelancing, changing careers, or growing in your field? Your experience belongs here, too.</p>
          <Link to="/signup">Find your starting point ↗</Link>
        </div>
      </section>

      {/* TEMPLATES */}
      <section className="sec sec--tall" id="templates">
        <div className="sec__head">
          <div className="sec__intro sec__intro--wide">
            <SectionLabel>A stronger first impression</SectionLabel>
            <Heading lines={['Your work has character.', 'Your presentation should, too.']} />
            <p className="sec__lead">Start with a thoughtful structure. Let your experience make it personal.</p>
          </div>
          <CtaButton to="/signup" variant="outline">Explore templates</CtaButton>
        </div>
        <div className="tabs" role="tablist">
          {TEMPLATE_TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'is-active' : ''}`} onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
        <div className={`gallery ${templates.length % 2 === 0 ? 'gallery--pairs' : ''}`}>
          {templates.map((t) => (
            <div key={t.name} className="tpl">
              <div className="tpl__canvas" data-tpl={t.name}>
                {t.name === 'Folio' && <ScaledSite template="folio" base={620} height={392} className="tpl__site" />}
                {t.name === 'Studio' && <PortfolioPreview width={356} theme="dark" />}
                {t.name === 'Outline' && <CVPreview width={276} />}
                {t.name === 'Narrative' && <EditorialPreview />}
              </div>
              <div className="tpl__info">
                <div>
                  <p className="tpl__name">{t.name}</p>
                  <p className="tpl__desc">{t.desc}</p>
                </div>
                <Link to="/signup" className="tpl__go" aria-label={`Use the ${t.name} template`}><Icon src={img.arrowUpRightAccent16} size={16} /></Link>
              </div>
            </div>
          ))}
        </div>
        <p className="gallery__note">Illustrative template directions. A starting point for your own story.</p>
      </section>

      {/* BELIEF */}
      <section className="sec belief">
        <div className="belief__copy">
          <SectionLabel light>A little perspective changes everything</SectionLabel>
          <Heading className="belief__title" lines={['Everyone has value', 'worth showcasing.']} />
          <p className="belief__body">Not everyone has the words, the design skills, or the confidence to show it. We believe professional presentation should be more accessible—not another barrier between you and what comes next.</p>
          <p className="belief__tag">Less second-guessing. More possibility.</p>
        </div>
        <div className="lens" aria-hidden>
          <img className="lens__outer" src={img.lensOuter} width="300" height="300" alt="" />
          <img className="lens__middle" src={img.lensMiddle} width="230" height="230" alt="" />
          <img className="lens__focus" src={img.lensFocus} width="160" height="160" alt="" />
          <span className="lens__core"><img src={img.asterisk} width="60" height="60" alt="" /></span>
          <span className="lens__label lens__label--a">Your experience</span>
          <span className="lens__label lens__label--b">New possibilities ↗</span>
        </div>
      </section>

      {/* FAQ */}
      <section className="sec faq" id="faq">
        <div className="faq__intro">
          <div className="sec__intro">
            <SectionLabel>A little more clarity</SectionLabel>
            <Heading lines={['Good questions.', 'Clear answers.']} />
            <p className="sec__lead">A few things you might be wondering before you get started.</p>
          </div>
          <a href="mailto:hello@dixlab.app" className="faq__contact">Have another question? Get in touch <Icon src={img.arrowUpRightAccent16} size={16} /></a>
        </div>
        <div className="faq__list">
          {FAQS.map(([q, a], i) => (
            <div key={q} className={`faq__item ${open === i ? 'is-open' : ''}`}>
              <button aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
                <span>{q}</span>
                <Icon src={open === i ? img.minus : img.plus} size={18} />
              </button>
              {open === i && <p>{a}</p>}
            </div>
          ))}
        </div>
      </section>

      {/* FINAL INVITATION */}
      <section className="invite">
        <div className="invite__copy">
          <SectionLabel light>Your next chapter starts here</SectionLabel>
          <Heading className="invite__title" lines={['You’ve done the work.', 'Now let it open doors.']} />
        </div>
        <div className="invite__go">
          <p>Turn what you know, what you’ve made, and what you’ve learned into a professional story worth sharing.</p>
          <CtaButton to="/signup" variant="light">Start building your story</CtaButton>
          <small>Your experience is enough to begin.</small>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="footer">
        <div className="footer__top">
          <div className="footer__brand">
            <Logo />
            <p>A clearer view of your potential.<br />A stronger way to show it.</p>
            <p className="footer__tagline">Turn Your Work Into Opportunities.</p>
          </div>
          <div className="footer__links">
            <div><p>Explore</p><a href="#why">Why Dixlab</a><a href="#how">How it works</a><a href="#templates">Templates</a></div>
            <div><p>Create</p><Link to="/signup">Portfolios</Link><Link to="/signup">CVs</Link><Link to="/signup">Case studies</Link></div>
            <div><p>Connect</p><a href="mailto:hello@dixlab.app">Get in touch</a><a href="https://www.linkedin.com" target="_blank" rel="noreferrer">LinkedIn ↗</a><a href="https://www.instagram.com" target="_blank" rel="noreferrer">Instagram ↗</a></div>
          </div>
        </div>
        <div className="footer__legal">
          <p>© 2026 Dixlab. Everyone has value worth showcasing.</p>
          <div>
            <a href="#">Privacy policy</a>
            <a href="#">Terms of use</a>
            <span className="footer__lang"><Icon src={img.globe} size={13} />English</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function CapText({ n, t, d }) {
  return (
    <div className="cap__text">
      <p className="cap__n"><span>{n}</span><Icon src={img.arrowUpRightAccent20} size={20} /></p>
      <h3 className="cap__t">{t}</h3>
      <p className="cap__d">{d}</p>
    </div>
  );
}

function CaseStudyPreview() {
  return (
    <div className="csp">
      <p className="csp__k">ENGINEERING CASE STUDY</p>
      <p className="csp__title">Connecting a campus,<br />one event at a time.</p>
      <div className="csp__art">
        <div className="csp__code">
          <p className="csp__path">src / api / routes.ts</p>
          <p className="csp__mono">{'async function projects() {'}</p>
          <p className="csp__mono">{'  return await db.list()'}</p>
          <p className="csp__mono">{'}'}</p>
        </div>
        <div className="csp__status">
          <p>API overview</p>
          <p className="csp__ok">Healthy</p>
          <p className="csp__stack">TypeScript · Node.js</p>
        </div>
      </div>
      <div className="csp__meta">
        <div><p>MY ROLE</p><p>Full-stack developer</p></div>
        <div><p>BUILT WITH</p><p>React · Node.js</p></div>
      </div>
      <p className="csp__h">The challenge</p>
      <p className="csp__body">Campus events lived across scattered group chats. I helped build a single place to discover what’s happening and find your community.</p>
    </div>
  );
}

function EditorialPreview() {
  return (
    <div className="edp">
      <div className="edp__nav"><p>JORDAN LEE</p><p>Selected work ↗</p></div>
      <p className="edp__title">Small objects.<br />A different perspective.</p>
      <img className="edp__photo" src={img.photoObjects} alt="" />
      <div className="edp__meta">
        <p>ART DIRECTION<br />Brand &amp; visual identity</p>
        <p>2026<br />Independent project</p>
      </div>
      <p className="edp__body">Exploring the everyday through form, colour, and a new visual language.</p>
    </div>
  );
}
