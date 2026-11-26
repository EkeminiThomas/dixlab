import { useEffect } from 'react';
import { CONTACT_EMAIL } from '../contact.js';
import { Link, useLocation } from 'react-router-dom';
import { Logo, loadUser } from '../components/ui.jsx';
import { isSignedIn, homeFor } from '../api.js';

const UPDATED = '22 November 2026';
const CONTACT = CONTACT_EMAIL;
const Mail = () => <a href={`mailto:${CONTACT}`}>{CONTACT}</a>;

/* ---------------------------------------------------------------- Terms of use */
const TERMS = [
  ['Who we are', <>
    <p>Dixlab (“Dixlab”, “we”, “us”) lets you build portfolios, CVs and case studies, publish them as web pages, and use AI to help write them. These terms apply to everyone who uses dixlab.click, its published pages and its apps. By creating an account or using Dixlab, you agree to them. If you don’t agree, please don’t use Dixlab.</p>
    <p>Questions about these terms: <Mail />.</p>
  </>],
  ['Your account', <>
    <ul>
      <li>You must be at least 16 years old, or the age of digital consent where you live if that’s higher.</li>
      <li>Give us a real name and an email address you can receive mail at. We ask you to confirm it before you can publish or receive messages from visitors.</li>
      <li>Keep your password safe. We recommend turning on two-step login. You’re responsible for what happens in your account.</li>
      <li>One person per account. Don’t create accounts to get extra free credits.</li>
    </ul>
  </>],
  ['Your work belongs to you', <>
    <p>You own what you create on Dixlab: your text, images, videos, files and pages. You give us permission to store, process, display and send it only as needed to run Dixlab for you: showing your drafts, publishing the pages you choose to publish, making PDFs, sending your text to our AI providers when you ask for AI help, and keeping backups.</p>
    <p>If you ask to be featured in the Dixlab gallery and we accept, you also let us show your page’s title, name, role, summary and cover image in the gallery and link to it. You can leave the gallery at any time from Publish.</p>
    <p>You’re responsible for having the right to everything you upload, and for what you publish being true. Don’t claim work, employers, results or qualifications that aren’t yours.</p>
  </>],
  ['Published pages, links and other people’s contributions', <>
    <ul>
      <li>A published page can be seen by anyone with its link, including any contact details on it. Password-protected pages need the password, but the link itself (which includes your page’s title) is visible to anyone it’s shared with.</li>
      <li>Feedback links let anyone with the link read your current draft and comment. Testimonial links let people write a recommendation; nothing is shown until you approve it. Turn a link off at any time and it stops working.</li>
      <li>When someone writes you a testimonial or feedback, they confirm it’s their honest opinion and let you show it on your pages.</li>
    </ul>
  </>],
  ['Acceptable use', <>
    <p>Don’t use Dixlab to:</p>
    <ul>
      <li>publish anything illegal, hateful, harassing, sexually explicit, violent or deceptive, or that infringes someone else’s rights;</li>
      <li>impersonate someone, or present false credentials, references or testimonials;</li>
      <li>send spam, phishing or malware, or collect other people’s data without permission;</li>
      <li>probe, overload, scrape or get around the limits or security of Dixlab;</li>
      <li>resell Dixlab, or use the AI features to build a competing product.</li>
    </ul>
    <p>We may remove content, unpublish pages, or suspend accounts that break these rules, usually after telling you why. Serious or repeated abuse can lead to deletion.</p>
  </>],
  ['AI help', <>
    <p>AI features (tailoring a CV to a job, drafting from your profiles or project links, writing case studies, translating pages, suggested changes) send the text you provide, and the public pages you point us to, to our AI providers to produce a draft. AI can be wrong. Read and edit everything before you use it: you’re responsible for what you publish or send to employers. We don’t use your content to train AI models, and our providers process it only to answer your request.</p>
    <p>When you give us links (GitHub, Stack Overflow, a job advert, a website), we read only public pages. We never log in to LinkedIn, X or other sites on your behalf.</p>
  </>],
  ['Credits and paid features', <>
    <ul>
      <li>Dixlab has no subscription. You buy credit packs once, in naira (Nigeria) or US dollars (elsewhere), through our payment provider, Bachs.</li>
      <li>Credits never expire. They’re used for AI actions (the price of each is shown on the Pricing page and before you use it) and to unlock features.</li>
      <li>Credits are only taken when an AI action finishes. If it fails, nothing is taken.</li>
      <li>Unlocks (premium templates, visitor insights, your Dixlab address, password pages, removing the Dixlab footer, extra projects and storage) are paid once with credits and stay on your account for as long as it exists.</li>
      <li>Credits and unlocks have no cash value, can’t be transferred to another account, and end if your account is deleted.</li>
      <li>New accounts get a small number of free credits. We may change prices for future purchases; credits and unlocks you already have keep working.</li>
      <li>Accounts that paid for one of our earlier monthly plans keep its features until it runs out.</li>
    </ul>
    <p>Refunds are covered in our <Link to="/refunds">Refund policy</Link>.</p>
  </>],
  ['Addresses and domains', <>
    <ul>
      <li><b>Your Dixlab address</b> (yourname.dixlab.click) is a feature of Dixlab, not a domain you own. Names must not impersonate others or mislead; we can reclaim names that do, or that belong to a deleted account.</li>
      <li><b>Connecting your own domain</b> is free. You must own it or have permission to use it, and keep its DNS records in place for it to keep working.</li>
      <li><b>Buying a domain in Dixlab</b>, when available, is done through our registrar partner, pxxl.app. The domain is registered in your name, using the contact details you give us, and is subject to the registrar’s and the domain registry’s rules. Domain registrations are final once registered. If a registration fails after you pay, we refund you. Domains last for the period you paid for; renewing them is your responsibility unless we tell you otherwise.</li>
    </ul>
  </>],
  ['Availability and changes', <>
    <p>We work to keep Dixlab running and your work safe, but we can’t promise it will always be available or free of errors. Keep copies of anything important (you can export PDFs at any time). We may change, add or remove features; if a change takes away something you paid for, we’ll offer a fair alternative or refund.</p>
    <p>We may update these terms. If a change matters, we’ll tell you by email or in the app before it applies. Continuing to use Dixlab after that means you accept the new terms.</p>
  </>],
  ['Ending your account', <>
    <p>You can delete your account at any time from Profile → Delete account. This removes your projects, published pages, uploads, messages, credits and unlocks straight away; some records (like payments, for tax) are kept as our Privacy policy explains. We may close accounts that break these terms or stay inactive for a long time; for inactive accounts we’ll email you first.</p>
  </>],
  ['Liability', <>
    <p>Dixlab is provided “as is”. As far as the law allows, we aren’t liable for indirect losses such as lost opportunities, jobs, income or data, and our total liability to you is limited to what you paid us in the 12 months before the claim. Nothing in these terms limits liability that can’t be limited by law, or your rights as a consumer.</p>
  </>],
  ['Law', <>
    <p>These terms are governed by the laws of the Federal Republic of Nigeria. If you live elsewhere, you also keep the consumer protections of your own country. Please contact us first so we can try to sort out any problem: <Mail />.</p>
  </>],
];

/* ---------------------------------------------------------------- Privacy policy */
const PRIVACY = [
  ['In short', <>
    <ul>
      <li>We collect what we need to run your account, publish your pages and take payments. We don’t sell your data and we don’t show ads.</li>
      <li>Visitor numbers on your pages are counted without cookies, and we don’t store visitors’ IP addresses with them.</li>
      <li>You can see, export, change and delete your data. Write to <Mail /> for anything you can’t do in the app.</li>
    </ul>
    <p>Dixlab is the data controller for your account data. We follow the Nigeria Data Protection Act 2023 and, for people in the UK and EU, the GDPR.</p>
  </>],
  ['What we collect', <>
    <ul>
      <li><b>Account:</b> your name, email, password (stored only as a secure hash), two-step login settings, and when you last used Dixlab.</li>
      <li><b>Your work:</b> the projects you create, images, videos and files you upload, and the pages you publish. Some is kept in your browser too, so drafts survive going offline.</li>
      <li><b>Things you ask AI to read:</b> job adverts, public profile and project links, and text you paste. We fetch public pages only, at your request.</li>
      <li><b>Payments:</b> what you bought, the amount, currency and dates, and Bachs’s payment references. Bachs handles your card or bank details; we never see or store them.</li>
      <li><b>Domains you buy:</b> the registrant contact details you enter (name, email, phone, address), which domain registrations require.</li>
      <li><b>Messages and contributions:</b> messages visitors send you through Get in touch, and testimonials and feedback people leave through your links.</li>
      <li><b>Visitors to published pages:</b> daily counts only (views, where visitors came from as a site name like “LinkedIn”, which projects were opened, how far people scrolled, and clicks such as “Download CV”). No cookies, no visitor IDs, and no IP addresses or browser details are stored with them.</li>
      <li><b>Security logs:</b> IP addresses are used briefly to limit repeated attempts (log-in tries, page passwords, form spam) and expire within hours. An activity log of account events (sign-ups, publishing, payments) is kept for {180} days.</li>
    </ul>
  </>],
  ['Cookies and browser storage', <>
    <p>We use one essential cookie to keep you logged in (it lasts up to 30 days, and ends after 7 days without use). Your browser also keeps your drafts, your chosen currency and similar settings in local storage. We use no advertising or tracking cookies, so there’s no cookie banner.</p>
  </>],
  ['Why we use it', <>
    <ul>
      <li>To provide Dixlab: your account, editor, published pages, PDFs, AI help, credits and domains (to perform our contract with you).</li>
      <li>To keep Dixlab safe and working: preventing abuse, fixing problems, and backups (our legitimate interests).</li>
      <li>To take payments and keep tax records (legal obligations).</li>
      <li>To email you about your account: confirming your email, password resets, messages from visitors, testimonials and feedback, and receipts. We don’t send marketing without your permission.</li>
    </ul>
  </>],
  ['Who we share it with', <>
    <p>Only service providers who help us run Dixlab, under contracts that limit them to doing so:</p>
    <ul>
      <li><b>Hosting and storage:</b> Vercel (website), pxxl.app (application servers and files), Turso (database).</li>
      <li><b>AI:</b> Groq and/or Anthropic, which receive the text needed for the AI action you asked for. They don’t use it to train models.</li>
      <li><b>Payments:</b> Bachs.</li>
      <li><b>Email:</b> SendLiberty (or our mail server), to deliver account and notification emails.</li>
      <li><b>Domains:</b> pxxl.app as registrar partner when you buy a domain, and Cloudflare’s public DNS service to check domains you connect.</li>
      <li><b>Public data sources:</b> when you ask, we request public information from GitHub, Stack Exchange and other sites you link. We send them only the profile or page address.</li>
    </ul>
    <p>Some providers are outside Nigeria (for example in the US or EU). Where data leaves your country, we rely on the safeguards the law requires. We share data with authorities only when the law requires it.</p>
  </>],
  ['What’s public', <>
    <p>Anything on a page you publish is public to anyone with the link, including contact details you add. Published pages can be found by search engines and shared on social media, which shows their title, description and cover image. Unpublish a page at any time and it disappears from its link straight away (search engines may take longer to update).</p>
  </>],
  ['How long we keep it', <>
    <ul>
      <li>Your account and work: until you delete them or your account.</li>
      <li>Deleted accounts: removed straight away from our live systems, and from backups within 30 days.</li>
      <li>Payment records: kept as tax law requires (up to 6 years), even after your account is deleted.</li>
      <li>Activity logs: 180 days. Rate-limit records: hours.</li>
    </ul>
  </>],
  ['Your rights', <>
    <p>You can ask to see, correct, export or delete your data, object to or restrict how we use it, and withdraw consent where we rely on it. Most of this you can do in the app (Profile, the editor, Delete account); for anything else write to <Mail /> and we’ll reply within 30 days. You can also complain to the Nigeria Data Protection Commission, or the data protection authority where you live.</p>
  </>],
  ['Children', <>
    <p>Dixlab isn’t for children under 16, and we don’t knowingly collect their data. If you think a child has an account, tell us and we’ll delete it.</p>
  </>],
  ['Changes', <>
    <p>If we change this policy in a way that matters, we’ll tell you by email or in the app before it applies.</p>
  </>],
];

/* ---------------------------------------------------------------- Refund policy */
const REFUNDS = [
  ['Credit packs', <>
    <ul>
      <li>You can get a full refund of a credit pack within 14 days of buying it, as long as its credits haven’t been used. Request it from Profile → Credits & billing → Payments.</li>
      <li>The refund goes back to the card or account you paid with, usually within 5–10 working days. The pack’s credits are removed from your balance when you ask.</li>
      <li>Credits never expire, so there’s no refund for credits simply left unused after 14 days; they stay on your account for you to use.</li>
      <li>If something went wrong (an AI action failed but credits were taken, or you were charged twice), write to <Mail /> and we’ll put it right, whenever it happened.</li>
    </ul>
  </>],
  ['Unlocks', <>
    <p>Unlocks are paid with credits and are yours for good, so they aren’t refundable once used. If you unlocked something by mistake and haven’t used it, contact us within 14 days and we’ll return the credits.</p>
  </>],
  ['Domains', <>
    <p>Domain registrations are final: once a domain is registered in your name, the payment can’t be refunded, because the registration itself can’t be undone. If we can’t register the domain after you’ve paid (for example someone else registered it first), we refund you in full automatically.</p>
  </>],
  ['Older monthly plans', <>
    <p>Payments for our earlier monthly or yearly plans can be refunded within 14 days of the charge; the plan ends when the refund is made.</p>
  </>],
  ['Your legal rights', <>
    <p>This policy doesn’t affect your rights under consumer law where you live. Questions: <Mail />.</p>
  </>],
];

const DOCS = {
  terms: { title: 'Terms of use', lead: 'The rules for using Dixlab, in plain language.', sections: TERMS },
  privacy: { title: 'Privacy policy', lead: 'What we collect, why, who we share it with, and your rights.', sections: PRIVACY },
  refunds: { title: 'Refund policy', lead: 'When and how you can get your money back.', sections: REFUNDS },
};

/** /terms, /privacy and /refunds. */
export default function Legal() {
  const doc = DOCS[useLocation().pathname.replace(/^\//, '')] || DOCS.terms;
  useEffect(() => { const prev = document.title; document.title = `${doc.title} · Dixlab`; window.scrollTo({ top: 0 }); return () => { document.title = prev; }; }, [doc]);
  const signedIn = isSignedIn();
  return (
    <div className="prc legal">
      <header className="prc__nav">
        <Logo to="/" />
        <nav className="prc__links">
          <Link to="/terms">Terms</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/refunds">Refunds</Link>
        </nav>
        <div className="prc__actions">
          {signedIn ? <Link to={homeFor(loadUser())} className="prc__btn">Your work</Link> : <Link to="/signup" className="prc__btn">Start free</Link>}
        </div>
      </header>
      <main className="legal__main">
        <p className="prc__kicker">Legal</p>
        <h1 className="legal__h1">{doc.title}</h1>
        <p className="legal__lead">{doc.lead} Last updated {UPDATED}.</p>
        <nav className="legal__toc" aria-label="On this page">
          {doc.sections.map(([h], i) => <a key={h} href={`#s${i + 1}`}>{i + 1}. {h}</a>)}
        </nav>
        {doc.sections.map(([h, body], i) => (
          <section key={h} id={`s${i + 1}`} className="legal__sec">
            <h2>{i + 1}. {h}</h2>
            {body}
          </section>
        ))}
      </main>
      <footer className="prc__foot">
        <span>© {new Date().getFullYear()} Dixlab</span>
        <span><Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link> · <Link to="/refunds">Refunds</Link> · <Mail /></span>
      </footer>
    </div>
  );
}
