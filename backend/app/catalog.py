"""What the AI is allowed to choose from. Keep in sync with
frontend/src/components/sites/catalog.js and sites/brand.js."""

SITE_TEMPLATES = {
    "folio": "light, calm, minimal single page; good for developers, students, general use",
    "bento": "light grid of rounded tiles, modern; developers, product, marketing",
    "terminal": "dark, monospace shell session; developers and engineers",
    "journal": "warm cream editorial magazine with serif type; writers, journalists, creative directors",
    "grid": "Swiss minimal, huge bold type, strict grid, red accent; architects, graphic designers",
    "exhibit": "quiet gallery wall of big images; photographers, artists, fashion, illustrators",
    "punch": "bold playful neo-brutalist, chunky borders, loud colour; creatives, social media, students",
    "casebook": "light, case-study-led with device frames and design process; UI/UX and product designers",
    "sentinel": "dark navy security dashboard with radar and certifications; cyber security professionals",
    "reel": "dark cinematic showreel player hero; motion designers, animators, filmmakers, video editors",
    "blocks": "light, playful 3D: extruded name, floating skill cubes, flip cards; developers, students, creatives",
}

CV_TEMPLATES = {
    "classic": "centred serif masthead, ruled sections, traditional; finance, law, healthcare",
    "meridian": "modern two-column with a tinted sidebar for contact and skills; tech, business",
    "executive": "dark navy header band, core competencies grid; senior leaders and executives",
    "margin": "minimal and airy, section labels in a left margin; creative, marketing",
    "timeline": "experience and education on a vertical timeline; healthcare, career progression",
    "plain": "single column, no graphics, ATS-safe and simple; any field",
    "canvas": "bold colour-block header with huge name, skill pills; designers and creatives",
    "stack": "technical, monospace accents, skills and projects up front; engineers and developers",
    "graduate": "education and projects first; students, graduates, first jobs",
    "atelier": "refined cream paper, monogram, elegant serif; premium client-facing roles",
}

CASE_TEMPLATES = {
    "chronicle": "editorial long-read, warm paper, serif headings, wide cover; design, brand, research",
    "snapshot": "scannable one-pager: facts card, results and problem/approach/outcome up top; recruiters",
    "blueprint": "technical, blueprint grid background, numbered sections, process flow; engineering",
    "spotlight": "dark and cinematic, full-bleed cover, huge numbers; brand and marketing launches",
    "framework": "structured situation/challenge/objectives cards then recommendation; consulting, business",
    "lab": "research report with question, method, findings and recommendations; UX research",
    "showcase": "visuals first with a big cover and image wall; architecture, illustration, visual design",
    "impact": "numbers first with a big headline result and before/after; growth, product, ops",
    "deck": "scrolling slides, each section a numbered slide; presentations and pitches",
    "brief": "Swiss minimal, six numbered sections on a strict grid, red accent; compact",
    "depth": "dark 3D: layered hero, curved panels, process as cube towers, cover-flow gallery; product, engineering, brand",
    "mockup": "launch-style: centred hero, work in a browser frame on a gradient stage, steps beside screens; product and UI",
    "styleguide": "brand identity sheet: huge uppercase type, colour and type system tiles, moodboard grid; branding",
    "chapters": "numbered chapters with huge serif numerals, one idea per chapter; storytelling, research",
    "pocket": "mobile app: phone frames for the screens on a colour band; app designers and mobile engineers",
    "collage": "masonry image wall first, words as captions, italic serif; illustration, photography, interiors",
    "split": "sticky left column with facts and section index beside the story; recruiters, consulting",
    "tiles": "bento grid summary up top (cover, problem, metrics, role, solution), then details; product",
    "devlog": "dark monospace engineering log: commands as headings, process as a git log, results as a benchmark; developers",
    "poster": "Swiss poster: huge tight type, full-width colour block with the headline number, strict grid; brand, marketing",
    "aurora": "soft gradient glows and frosted glass cards, centred hero; SaaS and product",
}

# The 3D templates, and their extra settings (see frontend sites/brand.js).
THREE_D_TEMPLATES = {"blocks", "depth"}
DEPTHS = ["flat", "subtle", "normal", "deep"]
TILTS = ["pointer", "off"]
FLOATS = ["on", "off"]

# key -> (label, heading font or None)
FONT_PAIRS = {
    "default": ("Template default", None),
    "modern": ("Modern", "Instrument Sans"),
    "grotesk": ("Grotesk", "Space Grotesk"),
    "editorial": ("Editorial", "Playfair Display"),
    "elegant": ("Elegant", "Instrument Serif"),
    "expressive": ("Expressive", "Syne"),
    "friendly": ("Friendly", "Bricolage Grotesque"),
    "technical": ("Technical", "Roboto Mono"),
}

MOTIONS = ["none", "up", "down", "left", "right", "zoom"]
SPEEDS = ["calm", "normal", "snappy"]
CV_SIZES = ["compact", "normal", "roomy"]


def font_lines() -> str:
    return "\n".join(f"- {k}: {label}" + (f" (headings {head})" if head else "") for k, (label, head) in FONT_PAIRS.items())


def template_lines(catalog: dict[str, str]) -> str:
    return "\n".join(f"- {k}: {look}" for k, look in catalog.items())
