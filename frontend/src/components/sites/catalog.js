/* Plain-JS description of the site templates, shared by the browser (local
   prompt parser) and the server (AI customise endpoint). Keep in sync with
   SITE_TEMPLATES in index.jsx. */
export const TEMPLATE_CATALOG = {
  folio:    { name: 'Folio',    look: 'light, calm, minimal single page; good for developers, students, general use' },
  bento:    { name: 'Bento',    look: 'light grid of rounded tiles, modern; developers, product, marketing' },
  terminal: { name: 'Terminal', look: 'dark, monospace shell session; developers and engineers' },
  journal:  { name: 'Journal',  look: 'warm cream editorial magazine with serif type; writers, journalists, creative directors' },
  grid:     { name: 'Grid',     look: 'Swiss minimal, huge bold type, strict grid, red accent; architects, graphic designers' },
  exhibit:  { name: 'Exhibit',  look: 'quiet gallery wall of big images; photographers, artists, fashion, illustrators' },
  punch:    { name: 'Punch',    look: 'bold playful neo-brutalist, chunky borders, loud colour; creatives, social media, students' },
  casebook: { name: 'Casebook', look: 'light, case-study-led with device frames and design process; UI/UX and product designers' },
  sentinel: { name: 'Sentinel', look: 'dark navy security dashboard with radar and certifications; cyber security professionals' },
  reel:     { name: 'Reel',     look: 'dark cinematic showreel player hero; motion designers, animators, filmmakers, video editors' },
};

export const TEMPLATE_KEYS = Object.keys(TEMPLATE_CATALOG);

/* CV templates (keep in sync with CV_TEMPLATES in components/cv/index.jsx). */
export const CV_CATALOG = {
  classic:   { name: 'Classic',   look: 'centred serif masthead, ruled sections, traditional; finance, law, healthcare' },
  meridian:  { name: 'Meridian',  look: 'modern two-column with a tinted sidebar for contact and skills; tech, business' },
  executive: { name: 'Executive', look: 'dark navy header band, core competencies grid; senior leaders and executives' },
  margin:    { name: 'Margin',    look: 'minimal and airy, section labels in a left margin; creative, marketing' },
  timeline:  { name: 'Timeline',  look: 'experience and education on a vertical timeline; healthcare, career progression' },
  plain:     { name: 'Plain',     look: 'single column, no graphics, ATS-safe and simple; any field' },
  canvas:    { name: 'Canvas',    look: 'bold colour-block header with huge name, skill pills; designers and creatives' },
  stack:     { name: 'Stack',     look: 'technical, monospace accents, skills and projects up front; engineers and developers' },
  graduate:  { name: 'Graduate',  look: 'education and projects first; students, graduates, first jobs' },
  atelier:   { name: 'Atelier',   look: 'refined cream paper, monogram, elegant serif; premium client-facing roles' },
};
export const CV_KEYS = Object.keys(CV_CATALOG);
export const CV_SIZE_KEYS = ['compact', 'normal', 'roomy'];

/* Case study templates (keep in sync with CASE_TEMPLATES in components/case/index.jsx). */
export const CASE_CATALOG = {
  chronicle: { name: 'Chronicle', look: 'editorial long-read, warm paper, serif headings, wide cover; design, brand, research' },
  snapshot:  { name: 'Snapshot',  look: 'scannable one-pager: facts card, results and problem/approach/outcome up top; recruiters' },
  blueprint: { name: 'Blueprint', look: 'technical, blueprint grid background, numbered sections, process flow; engineering' },
  spotlight: { name: 'Spotlight', look: 'dark and cinematic, full-bleed cover, huge numbers; brand and marketing launches' },
  framework: { name: 'Framework', look: 'structured situation/challenge/objectives cards then recommendation; consulting, business' },
  lab:       { name: 'Lab',       look: 'research report with question, method, findings and recommendations; UX research' },
  showcase:  { name: 'Showcase',  look: 'visuals first with a big cover and image wall; architecture, illustration, visual design' },
  impact:    { name: 'Impact',    look: 'numbers first with a big headline result and before/after; growth, product, ops' },
  deck:      { name: 'Deck',      look: 'scrolling slides, each section a numbered slide; presentations and pitches' },
  brief:     { name: 'Brief',     look: 'Swiss minimal, six numbered sections on a strict grid, red accent; compact' },
};
export const CASE_KEYS = Object.keys(CASE_CATALOG);
