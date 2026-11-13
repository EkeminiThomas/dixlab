/* ==========================================================================
   CV data: sample personas, blank rows, and the normaliser every CV
   template renders from. All templates share one shape, so a user can
   switch between them without retyping anything.
   ========================================================================== */
import { initials, loadUser } from '../ui.jsx';

const role = (r, company, from, to, loc, bullets) => ({ role: r, company, from, to, loc, desc: bullets.join('\n') });
const edu = (degree, school, from, to, desc = '') => ({ degree, school, from, to, desc });

export const CV_SAMPLES = {
  engineer: {
    name: 'Alex Morgan', role: 'Software engineer', location: 'London, UK',
    email: 'alex.morgan@email.com', phone: '+44 7700 900123', website: 'github.com/alexmorgan',
    summary: 'Software engineer with three years’ experience building accessible web products in React, TypeScript and Node.js. I care about clear code, fast interfaces and helping teams ship with confidence.',
    skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'AWS', 'Testing', 'Accessibility', 'CI/CD'],
    languages: ['English (native)', 'Spanish (conversational)'],
    certs: ['AWS Certified Developer – Associate'],
    experience: [
      role('Software engineer', 'Campus Collective', '2024', 'Present', 'London', [
        'Led the rebuild of the events platform in React and TypeScript, cutting page load time by 48%.',
        'Designed a REST API used by 40,000 students across 12 universities.',
        'Introduced automated accessibility checks, reaching WCAG 2.2 AA on every page.',
      ]),
      role('Front-end developer', 'Brightside Studio', '2022', '2024', 'Bristol', [
        'Built responsive sites for 15+ clients in retail, charity and education.',
        'Created a shared component library that halved build time for new projects.',
      ]),
      role('Teaching assistant', 'University of Bristol', '2021', '2022', 'Bristol', [
        'Ran weekly lab sessions for 60 first-year computer science students.',
      ]),
    ],
    education: [edu('BSc Computer Science, First Class', 'University of Bristol', '2018', '2021', 'Dissertation on accessible route planning.')],
    projects: [
      { title: 'Route Planner', desc: 'Open-source step-free route planner with 2,000 monthly users.', link: 'github.com/alexmorgan/route' },
      { title: 'Pocket Budget', desc: 'Offline-first budgeting PWA built with IndexedDB.', link: '' },
    ],
  },
  finance: {
    name: 'Daniel Hughes', role: 'Senior financial analyst', location: 'Manchester, UK',
    email: 'daniel.hughes@email.com', phone: '+44 7700 900456', website: 'linkedin.com/in/danielhughes',
    summary: 'Chartered financial analyst with seven years in corporate finance, FP&A and investment appraisal. Known for turning complex numbers into clear decisions for leadership teams.',
    skills: ['Financial modelling', 'FP&A', 'Forecasting', 'Excel & VBA', 'Power BI', 'SQL', 'IFRS', 'Stakeholder reporting'],
    languages: ['English (native)', 'French (professional)'],
    certs: ['CFA Charterholder', 'ACCA Affiliate'],
    experience: [
      role('Senior financial analyst', 'Harbour & Pine Group', '2021', 'Present', 'Manchester', [
        'Own the £180m annual budget and monthly reforecast for five business units.',
        'Built a driver-based forecasting model that improved accuracy from 82% to 96%.',
        'Advised the board on two acquisitions with a combined value of £42m.',
      ]),
      role('Financial analyst', 'Northgate Bank', '2018', '2021', 'Leeds', [
        'Produced weekly performance packs for the retail banking executive team.',
        'Automated month-end reporting, saving 30 analyst hours each month.',
      ]),
    ],
    education: [edu('MSc Finance', 'University of Manchester', '2017', '2018'), edu('BA Economics', 'University of Leeds', '2014', '2017')],
    projects: [],
  },
  exec: {
    name: 'Jordan Ellis', role: 'Chief Operating Officer', location: 'New York, NY',
    email: 'jordan.ellis@email.com', phone: '+1 (212) 555 0148', website: 'linkedin.com/in/jordanellis',
    summary: 'Operations executive with 15 years scaling consumer and logistics businesses from Series B to IPO. I build calm, accountable teams and the systems that let them grow without breaking.',
    skills: ['Operational strategy', 'P&L ownership', 'M&A integration', 'Supply chain', 'Board relations', 'Change leadership'],
    languages: ['English', 'Portuguese'],
    certs: ['Harvard Business School – Advanced Management Program'],
    experience: [
      role('Chief Operating Officer', 'Parcelwise', '2020', 'Present', 'New York', [
        'Scaled operations from 3 to 22 markets and revenue from $60m to $410m.',
        'Led the company through IPO readiness and a $1.2bn listing.',
        'Built a 900-person operations organisation with 94% engagement.',
      ]),
      role('VP Operations', 'Freshcart', '2015', '2020', 'Boston', [
        'Cut fulfilment cost per order by 31% through network redesign.',
        'Integrated two acquired businesses within nine months.',
      ]),
      role('Director, Strategy', 'Meridian Consulting', '2010', '2015', 'Chicago', [
        'Advised Fortune 500 retailers on operating model transformation.',
      ]),
    ],
    education: [edu('MBA', 'Wharton School, University of Pennsylvania', '2008', '2010'), edu('BS Industrial Engineering', 'Georgia Tech', '2004', '2008')],
    projects: [],
  },
  nurse: {
    name: 'Amara Okafor', role: 'Registered nurse, critical care', location: 'Birmingham, UK',
    email: 'amara.okafor@email.com', phone: '+44 7700 900789', website: '',
    summary: 'Compassionate critical care nurse with six years on adult ICU and high-dependency wards. Calm under pressure, a confident mentor and committed to evidence-based, patient-centred care.',
    skills: ['Critical care', 'Ventilator management', 'Patient assessment', 'Medication administration', 'Mentoring', 'Infection control'],
    languages: ['English (native)', 'Yoruba (fluent)'],
    certs: ['NMC Registered Nurse', 'Advanced Life Support (ALS)', 'Mentorship qualification'],
    experience: [
      role('Senior staff nurse, ICU', 'Queen Elizabeth Hospital', '2021', 'Present', 'Birmingham', [
        'Care for up to two level-3 patients per shift on a 30-bed adult ICU.',
        'Mentor eight student nurses a year; 100% passed their placement.',
        'Led a pressure-ulcer prevention project that cut incidents by 40%.',
      ]),
      role('Staff nurse, high dependency', 'City Hospital', '2018', '2021', 'Birmingham', [
        'Delivered post-operative care for surgical and medical patients.',
        'Trained the ward team on a new electronic observations system.',
      ]),
    ],
    education: [edu('BSc (Hons) Adult Nursing', 'Birmingham City University', '2015', '2018')],
    projects: [],
  },
  creative: {
    name: 'Noah Bennett', role: 'Brand & visual designer', location: 'Amsterdam, NL',
    email: 'hello@noahbennett.design', phone: '+31 6 1234 5678', website: 'noahbennett.design',
    summary: 'Brand designer who turns strategy into identities people remember. Eight years across studios and in-house teams, from naming workshops to full rollout.',
    skills: ['Brand identity', 'Art direction', 'Typography', 'Packaging', 'Motion basics', 'Figma', 'Adobe CC'],
    languages: ['English', 'Dutch'],
    certs: ['D&AD Wood Pencil 2024', 'Brand New – Noted 2023'],
    experience: [
      role('Senior brand designer', 'Studio Kade', '2021', 'Present', 'Amsterdam', [
        'Led identity projects for 20+ clients including two national museums.',
        'Grew the studio’s packaging practice into 30% of revenue.',
      ]),
      role('Designer', 'Fold & Ink', '2017', '2021', 'London', [
        'Designed campaigns, editorial and packaging for food and drink brands.',
        'Art-directed photo shoots and managed freelance illustrators.',
      ]),
    ],
    education: [edu('BA Graphic Communication', 'Central Saint Martins', '2014', '2017')],
    projects: [
      { title: 'Rijks Kids identity', desc: 'Playful identity system for a museum family programme.', link: '' },
      { title: 'Oat & Ember', desc: 'Packaging range for an independent bakery, now in 300 stores.', link: '' },
    ],
  },
  grad: {
    name: 'Maya Chen', role: 'Computer science graduate', location: 'Toronto, ON',
    email: 'maya.chen@email.com', phone: '+1 (416) 555 0192', website: 'mayachen.dev',
    summary: 'Recent computer science graduate looking for a junior data or software role. Hands-on experience from two internships, a research project and hackathon wins.',
    skills: ['Python', 'SQL', 'JavaScript', 'React', 'Pandas', 'Git', 'Data visualisation'],
    languages: ['English', 'Mandarin'],
    certs: ['Dean’s List 2023 & 2024', 'Winner, HackToronto 2024'],
    experience: [
      role('Data intern', 'Maple Analytics', 'May 2024', 'Aug 2024', 'Toronto', [
        'Built dashboards tracking 2m monthly transactions for the finance team.',
        'Cleaned and merged four legacy datasets, removing 12% duplicate records.',
      ]),
      role('Software intern', 'Northbridge Labs', 'May 2023', 'Aug 2023', 'Remote', [
        'Shipped three features to a React app used by 5,000 customers.',
      ]),
    ],
    education: [edu('BSc Computer Science', 'University of Toronto', '2021', '2025', 'GPA 3.8 / 4.0. Modules: machine learning, databases, HCI.')],
    projects: [
      { title: 'Transit delay predictor', desc: 'Machine learning model forecasting subway delays with 87% accuracy.', link: 'github.com/mayachen/transit' },
      { title: 'StudySpace', desc: 'Hackathon-winning app that finds quiet study rooms on campus.', link: '' },
    ],
  },
  marketing: {
    name: 'Sofia Laurent', role: 'Marketing manager', location: 'Paris, France',
    email: 'sofia.laurent@email.com', phone: '+33 6 12 34 56 78', website: 'linkedin.com/in/sofialaurent',
    summary: 'Marketing manager with a decade in luxury and lifestyle brands. I combine brand storytelling with performance data to grow loyal audiences across Europe.',
    skills: ['Brand strategy', 'Campaign management', 'CRM', 'Social media', 'Partnerships', 'Budget management'],
    languages: ['French (native)', 'English (fluent)', 'Italian (professional)'],
    certs: ['Google Analytics certification'],
    experience: [
      role('Marketing manager', 'Maison Verre', '2020', 'Present', 'Paris', [
        'Lead a team of six across brand, CRM and social for 14 markets.',
        'Launched a loyalty programme that lifted repeat purchase by 27%.',
      ]),
      role('Brand executive', 'Lumière Cosmetics', '2015', '2020', 'Paris', [
        'Managed product launches with budgets up to €2m.',
        'Grew Instagram audience from 40k to 600k.',
      ]),
    ],
    education: [edu('MSc Marketing', 'ESSEC Business School', '2013', '2015')],
    projects: [],
  },
};

export const blankCvRole = () => ({ role: '', company: '', from: '', to: '', loc: '', desc: '' });
export const blankCvEdu = () => ({ degree: '', school: '', from: '', to: '', desc: '' });

const list = (s) => (Array.isArray(s) ? s : (s || '').split(',')).map((x) => String(x).trim()).filter(Boolean);
const filled = (rows = [], keys) => rows.filter((r) => keys.some((k) => r[k]?.trim?.()));

/** Map a saved Dixlab project to CV data. */
export function projectToCv(p) {
  return {
    name: p.name ?? loadUser().name,
    role: p.role, summary: p.notes,
    email: p.email, phone: p.phone, location: p.location, website: p.website,
    skills: list(p.skills), languages: list(p.languages), certs: list(p.certs),
    experience: p.experience || [], education: p.education || [], projects: p.projects || [],
    brand: p.brand || {},
    ghost: true, // fill empty sections with faded sample content while editing
  };
}

/**
 * Normalise CV data for rendering. With `ghost`, empty sections borrow faded
 * sample content so a fresh CV still shows its layout (never printed).
 */
export function cv(data = {}) {
  const S = CV_SAMPLES.engineer;
  const ghosts = {};
  const pick = (key, value, empty) => {
    if (!empty) return value;
    if (data.ghost) { ghosts[key] = true; return S[key]; }
    return value;
  };

  const name = data.name?.trim() || 'Your name';
  const parts = name.split(/\s+/);
  const experience = filled(data.experience, ['role', 'company']).map((x) => ({
    ...x, bullets: (x.desc || '').split('\n').map((b) => b.replace(/^[-•*]\s*/, '').trim()).filter(Boolean),
  }));
  const education = filled(data.education, ['degree', 'school']);
  const projects = filled(data.projects, ['title', 'desc']);
  const skills = list(data.skills);
  const summary = data.summary?.trim() || '';

  const out = {
    name, first: parts[0], last: parts.slice(1).join(' '), mono: initials(name),
    role: data.role?.trim() || 'Your headline',
    email: data.email || '', phone: data.phone || '', location: data.location || '', website: data.website || '',
    summary: pick('summary', summary, !summary),
    skills: pick('skills', skills, !skills.length),
    languages: list(data.languages),
    certs: list(data.certs),
    experience: pick('experience', experience, !experience.length),
    education: pick('education', education, !education.length),
    projects,
  };
  if (ghosts.experience) out.experience = S.experience.map((x) => ({ ...x, bullets: x.desc.split('\n') }));
  out.ghost = ghosts;
  out.contacts = [
    ['mail', out.email], ['phone', out.phone], ['pin', out.location], ['web', out.website],
  ].filter(([, v]) => v);
  return out;
}

export const range = (from, to) => [from, to].filter(Boolean).join(' – ');
