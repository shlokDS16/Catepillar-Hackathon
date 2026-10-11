# Aayush Visuals reference catalog: observed evidence and build translation

This catalog is a detailed research input for the Website Craft Director skill. It records what was read in the portfolio, what was directly observed in the live browser walkthrough, and how an agent should translate the principles into original work. It is not a specification to recreate this person's site or reuse their identity/assets. The source portfolio can change; re-open the URLs and check current behavior before using this as live truth for a future project.

## Evidence labels

- **Case-study evidence** means the project's own portfolio page stated or showed it. Metrics remain attributed claims unless independently verified.
- **Live observation** means a linked destination was opened and explored in the browser during the October 11, 2026 review.
- **Inferred build direction** means a design/build recommendation derived from the evidence, not a verified implementation detail.
- **Unavailable** means the browser could not inspect the relevant behavior. Never infer a hidden flow from a title or screenshot.

## Portfolio site: information architecture and interaction model

### Home

The home experience is a project-first introduction rather than a conventional services template. Its desktop hero uses a nearly black canvas with a fine grid, central serif/italic “aayush Visuals” lettering, small role/location labels, and floating project images. The artwork is mostly monochrome with selective red/purple/color accents. A persistent rounded navigation sits high on the page. “DRAG TO MOVE” teaches that the collage is interactive. The fixed lower-right purple “Ask Shotsu” orb is a separate assistant control.

**Directly tested:** dragged a laptop/project tile and observed its position change. Moved the pointer across the central title and floating artwork; the browser cursor displayed as an ordinary purple arrow and no separate cursor-follow interaction was observed on the portfolio hero. Hovering a project tile did not reveal an obvious alternate cursor-specific template in the captured state. Do not mistake the fixed Shotsu orb or its pause-like glyph for the cursor. A navigation overlay opens from the compact header and contains the site's main routes and contact action.

**Rest of homepage:** greeting/about transition and portrait; concise problem-solving statement; kinetic strip of capability words; credibility/experience and tool references; six selected work tiles with project type/year; “View all projects” with the 19-project total; seven-step process; horizontally arranged experiments; contact/availability, email-copy, external profiles and form. Typography is editorial and high contrast, with generous negative space, section numbering, compact metadata and candid explanatory writing.

**How to apply it:** use real work as the primary hero imagery; design a coherent spatial composition; give every movement a purpose and instruction; make drag optional, keyboard accessible and touch operable; keep the contact route obvious. Use exactly one persistent help affordance if it earns the space. Test the ordinary browser cursor as well as keyboard focus and touch. Do not add a custom cursor merely because the reference's project site has one.

### Supporting routes and project index

- **Projects `/work`:** searchable project index with categories including case studies, product design, UI/UX, posters, branding, social creatives, motion and video; 19 entries total and a case-study distinction. Cards identify project and discipline. Build it as a usable catalog: query, category, empty state, reset, deep link, responsive layout, meaningful card link and reduced-motion treatment. Filter controls need not use a server if all data is local.
- **About `/about`:** career timeline across 2020–26, education/certificates, key numbers, tappable wallet-style skills reveal, project/company proof and capability areas. If using a playful interaction, make content findable without it and provide keyboard/touch parity.
- **Contact `/contact`:** availability, copy-email action, location/social proof and form. A copied address needs confirmation. The contact form is only “working” when a backend/provider route handles validation, spam prevention and delivery; success copy must reflect actual delivery acceptance.
- **Playground `/playground`:** grouped experiments and tools, with five usable entries and one in-progress item. Treat experiments as real mini-products: clear instruction, operable controls, reset, result and appropriate disclosure of local/demo data.
- **Process section:** seven steps connect research, framing, flow, system, prototype/test, build/handoff and iteration. Use project-specific evidence and avoid claiming process steps that did not happen.

### Cursor, motion and thematic limits

- **Portfolio home:** draggable collage is confirmed; a dedicated home custom cursor effect is not confirmed. The floating assistant orb is independent. Exact timing/easing, breakpoints and reduced-motion details were not established; do not invent them.
- **Mike Tyson project:** orange outlined ring/crosshair with central dot/glow observed; CTA hover changes accent/outline. Motion and loader must not block navigation.
- **Riviera case study:** describes a motion-forward/atmosphere-first homepage, but exact motion mechanics should be re-observed before implementation.
- **Yantra case study:** describes an immersive 3D environment; live linked destination did not complete its initialization, so the actual 3D experience was not verifiable.
- **General rule:** translate the intent (attention, orientation, feedback), not guessed timing values. Provide `prefers-reduced-motion` behavior, interruption, touch/keyboard alternatives and performance fallback.

## The 19 project references

### 1. Mike Tyson Invitational — event, cause and multiple audiences

**Portfolio case study:** [aayushvisuals.com/work/mike-tyson-invitational](https://aayushvisuals.com/work/mike-tyson-invitational). It frames a first-edition amateur boxing event, four audiences (spectator, fighter, sponsor and donor), a roughly ten-page scope, and the tension between forge/boxing heat and technical precision. The proposed visual budget assigns most of the surface to dark foundation, a secondary share to ember, and a small cool-teal accent share. Treat those percentages as the design rationale in the case, not universal color values.

**Live destination:** [Webflow event site](https://mike-tyson-invitational-3821139c156afc7.webflow.io/). The loader/entry treatment gave way to a fighter-led hero, followed by a large March 12–14 / Las Vegas typographic section, the Invitational/fighter story, “why this matters,” donation and registration calls, event-day information, live-watch, gallery, standards, newsletter and footer. The fixed header opens a two-column “Navigation Portal” with Home, About, Buy tickets, Registration, Get involved, Merch Shop, Donate and Media Gallery, plus search/social areas. A fixed bottom CTA changes context while scrolling (including “Know more,” “Register now” and “Grab tickets”). Orange custom cursor and hover response on a CTA were observed. TicketTailor and Donorbox are external handoffs. The listed 2026 dates are past as of the review date; form was not submitted.

**Build translation:** map audience jobs first; create a route into the right task from each section; implement dates, sponsor tiers, donation/ticket and form handoffs as real components; use the visual mood budget to prevent competing graphic styles. Motion/cursor are polish after content hierarchy. Make event, registration and payment status expire or archive; the backend must confirm availability and ticket/payment state rather than trusting client copy.

**Agents and verification:** product researcher + event domain owner, UX architect, visual director, FE/BE pair, motion developer, QA/a11y and security/payment reviewer. Verify every audience path, menu keyboard trap/escape, sticky CTA at mobile safe areas, external handoff/return, event past state, reduced motion and newsletter error/success. Never submit a live donation, ticket or newsletter as research.

### 2. CPGRAMS — multilingual public grievance service

**Portfolio case study:** [aayushvisuals.com/work/cpgrams](https://aayushvisuals.com/work/cpgrams). The case identifies the burden of a 15-field grievance process and 90+ ministry taxonomy: users are asked to classify before they can explain. It proposes conversational, voice-first interaction across languages, while the government's underlying taxonomy remains fixed. It calls out editable transcript, user-confirmed summary/category, session recovery and escalation.

**Live destination:** [PG Portal sign-in](https://pgportal.gov.in/Signin). During review this route showed CPGRAMS and a “Samadhan Didi” chatbot announcement; it described support for 22 Eighth Schedule languages, plus user login/OTP, account recovery and sign-up. It did **not** expose the conversational grievance submission in the linked view. No authentication or grievance was attempted; the case-study flow remains unverified in live production.

**Build translation:** before interface work, map domain rules, allowed categories, privacy/retention, language coverage and human escalation with authoritative service owners. Model a state machine: consent/entry → language selection/detection → capture by speech or typing → transcript editing → clarifying question → category proposal with uncertainty → user review and confirmation → submit → receipt/status → recover/revise/escalate. Preserve the user's original words/audio according to policy; never silently file an AI-inferred complaint.

**Agents and verification:** domain/legal/privacy researcher, conversation UX writer, language/accessibility specialists, backend/security engineer and FE/BE pair, QA with diverse utterances. Contract API provenance, retries and duplicate submission/idempotency. Test accent/noise/language switches, wrong transcription, category correction, low bandwidth, missing microphone, denied permission, timeout and human fallback. Keep the sign-in path separate from the unverified assistant flow.

### 3. CAT Operator Assistant — safety-aware heavy-equipment dashboard

**Portfolio case study:** [aayushvisuals.com/work/cat-operator-assistant](https://aayushvisuals.com/work/cat-operator-assistant). A hackathon concept for excavator operators/fleet managers. It focuses on operators making many shift decisions with weak feedback and managers seeing safety/late-work patterns after the fact. Case says no new machine hardware; five operator views and read-only manager view; vanilla HTML/CSS/JS with procedural Three.js rather than downloaded model assets. Its estimator reports 2.4% versus 13.2% fixed-plan error on the same five tasks it learned from—a tiny, non-independent sample, which must remain caveated.

**Live demo:** [CAT Operator Assistant GitHub Pages](https://aayushvz.github.io/cat-operator-assistant/). A role/PIN entry offers operator profiles or fleet manager; demo PIN 1001 is disclosed. Startup sequence checks belt, walk-around, mirrors, oil/fluids and cameras before engine start. The dashboard has machine/weather/clock/status, SOS affordance, an interactive procedural excavator with component hotspots/faults, task and job-time views, Safety/Reports, Learn controls/videos/habits, and Machine condition with part states and service countdown. Task time view includes job/weather/operator/machine-age factors, range vs plan and a previous-job comparison. Safety view includes proximity, weather-based stop/slow thresholds and warning choices. SOS copy states a 1.5-second hold and describes stopping, calling a supervisor/medic and saving recent video; it was not activated. Reports were viewed but not filed. Demo values are simulated.

**Build translation:** start from the cab context, weak network and gloved touch. One screen answers one shift question. Large target sizing, short labels, clear urgency, consistent units, visible data freshness, status text plus color, direct report/recovery and local component list equivalent to 3D. Manager is read-only. Model operator/job/machine/fault/safety/report entities and permissions; mark simulation. Estimate must show its evidence range/limitations. A safety event needs real domain validation, offline dispatch semantics and an actual backend pathway; never use a decorative button as a real SOS.

**Agents and verification:** operator/domain safety reviewer, FE, backend/IoT-data engineer, accessibility, QA, security/privacy. Test gloves/touch/large targets, one-hand reach, weak/offline connectivity, stale telemetry, engine-check sequencing, weather alert, impossible estimate, role permissions, SOS cancellation/confirmation, queued report retry and screen-reader equivalent to 3D. Simulate dangerous actions only in a labeled sandbox.

### 4. Layover — airport meal-planning concept vs current payments platform

**Portfolio case study:** [aayushvisuals.com/work/layover](https://aayushvisuals.com/work/layover). The original case frames the traveler problem as unpredictability: time, open outlets and preparation time; vendors need demand/operations visibility. It describes traveler app, vendor portal, admin console and a multi-step order path. The intended planning system prioritizes airport/terminal/location, time, availability, preparation, order and fulfillment; guest browsing; warm dark consumer interface and brighter operational interface.

**Live destination:** [mylayover.in](https://mylayover.in/). The current site is materially different: B2B payments/operating layer for airport food courts and lounges, with “Every counter in the terminal. One checkout.” Page narrative describes the fragmented-counter problem; a browser checkout demo with four outlets, one basket, one payment, outlet-specific counter tickets/settlement allocation; terminal dining and lounge products; airport and operator value; three-step flow (onboard, order/pay, fulfill/split); retail/insights roadmap; launch-partner CTA and footer. Demo explicitly states simulated data, illustrative outlets/prices and no payment taken. Scrolling reached the end. No order placed.

**Build translation:** retain the case study for the original traveller concept; use live site for current B2B story. Do not silently merge them. For traveller product: separate traveler/vendor/admin journeys, model shared order truth, location pier, preparation time, inventory, fulfillment and payment state; guest browse before account; test stale stock, closed outlet, late order, refund and payment handoff. For current B2B: one basket has one source-of-truth order; each counter sees only its own ticket; settlement split totals must reconcile. Represent payment, ticket and settlement lifecycles consistently across traveler and operators. Label mock checkout; no simulated production charge.

**Agents and verification:** two-sided product analyst, UX for role journeys, FE/BE payment and settlement pair, security, QA, content writer. Test pricing/fees before payment, partial outlet failure, cancellation/refund, ticket visibility by outlet, duplicate payment idempotency, settlement rounding, time-to-flight, mobile order and simulated-to-live distinction.

### 5. Gravitas — large event catalog discovery and registration

**Portfolio case study:** [aayushvisuals.com/work/gravitas](https://aayushvisuals.com/work/gravitas). The case is about 200+ events presented as an unhelpful wall of content, with no durable “maybe”/return path. It recommends taxonomy, eligibility-aware entry, filters/search, event facts surfaced on cards, open events by default, wishlist continuity and useful full/empty/error results. Retro-tech art direction should be applied only after data structure works.

**Live destination:** [graVITas'25](https://gravitas25-frontend.vercel.app/). The 2025 VIT technical fest site has Home, Events, Team, Merch, Souvenirs, Sponsors, Get Started/Register; event-at-a-glance, repeated animated “Sustainable Tomorrow, Shaped Today” strip, event content and convenor/social/footer. Scrolled to footer. This is a prior edition, not verification of the catalog UX in the case study.

**Build translation:** use a normalized event model (date/time, category, fee, team size, eligibility, capacity, location, status); persistent query/filter; default sensible status; wishlist/resume; guest/student/member branches only where policies need them. Keep visual styling downstream of search and registration flows. For a time-bound festival, support open/closed/archive editions and content refresh.

**Agents and verification:** data editor/domain owner, UX, visual director, FE/BE, QA. Verify filter combinations, no results, full/cancelled event, registration branches, wishlist persistence, sort by date, timezone, direct links and stale/closed event state. Do not infer these working interactions from the current promotional event page.

### 6. Elevation Capital — editorial report/data narrative

**Portfolio case study:** [aayushvisuals.com/work/elevation-capital](https://aayushvisuals.com/work/elevation-capital). The design problem is a report trapped in PDF while readers browse on phones in short sessions. Narrative unit: finding → visualization → interpretation → transition. The case prescribes mobile-first chart prototyping and editable modules.

**Live destination:** [State of AI Adoption in Indian Startups](https://stateofaiadoption.elevationcapital.com/). Long-form report labeled 2026 with role sections (CEO, CTO, rest of C-suite, CPO, CMO, Operations), numbered highlights, chart/quote sequences, download/share controls and “Explore by roles.” Scrolled through its content. The download/share actions were not activated.

**Build translation:** source report extraction → claim/denominator/date/method audit → story map → accessible chart model → mobile-first components → editable source/content → download/share artifacts. Every value needs source, unit, population, time period and caveat; pair chart with text explanation and data table. Sticky role navigation cannot obscure reading. Downloads need an actual accessible document; share needs status feedback.

**Agents and verification:** research analyst/data editor, UX narrative designer, chart/accessibility expert, FE/BE/CMS, performance and QA. Validate report figures against source, chart keyboard/reader access, mobile labels, sticky offsets, editable content, downloadable asset and stale report indicator.

### 7. Riviera — multi-day festival, brand and event navigation

**Portfolio case study:** [aayushvisuals.com/work/riviera](https://aayushvisuals.com/work/riviera). The page asks for both atmosphere for newcomers and fast direct access for returning attendees. It proposes an animated mood-led home, event taxonomy/search underneath, dates/prices/registration reachable without spectacle blocking task completion, identity across sub-brands and reduced-motion fallback.

**Live destination:** [Riviera 2026 at VIT](https://riviera-lol.vercel.app/). Long page with “Rise Rush Revel” brand repetition, VIT/about, partner strip, inauguration (Mithali Raj), proshows and day-based performer information, event categories and prior proshows, convenor/footer. Scrolled to the end. The live edition itself may be outdated.

**Build translation:** separate atmosphere/home and purposeful event finder; searchable category, event details, dates, price, venue and signup. A shared event model supports home feature, taxonomy pages and schedule. Limit marquee repetition and provide pause/skip/reduced-motion. Multi-day schedule must surface timezone and sold-out/ended statuses.

**Agents and verification:** event content manager, UX and visual identity, FE/BE/CMS, motion specialist, QA/accessibility/performance. Test newcomer browse, known-event lookup, categories, schedule, mobile menu, motion off, past edition, signup state and page load with large hero media.

### 8. Yantra — immersive 3D technical fest

**Portfolio case study:** [aayushvisuals.com/work/yantra](https://aayushvisuals.com/work/yantra). The case uses an immersive technical environment as a front door while keeping workshops, hackathons and signup discoverable. It explicitly needs lower-end/mobile fallback, short route from arrival to event list and performance/reduced-motion testing.

**Live destination:** [Yantra: A Week of Innovation](https://yantra-xi.vercel.app/). Header exposes Home, Events, Team and FAQs. The body stayed on an “INITIALIZING” loading state during repeat waits; progress advanced from 0% to 50% and then 92%. No 3D scene or loaded route was accessible, so interactions and actual experience remain unknown. This is a failed verification, not evidence that the 3D design works.

**Build translation:** treat immersive WebGL as optional, lazy-loaded enhancement. Define a fast semantic 2D route as baseline; event cards, schedule and CTA should work before the 3D canvas loads. Have visible loading progress, timeout/error fallback, static poster, keyboard/touch controls, `prefers-reduced-motion`, context-loss recovery and GPU/device budget.

**Agents and verification:** 3D/creative developer, frontend performance, event UX, backend only for signup/schedule data, accessibility and QA. Test first visit/slow network, timeout, WebGL unavailable, low-end mobile, orientation, keyboard, touch, reduced-motion, deep link into Events and registration completion. Never infer unobserved scene details from a case page.

### 9. DropBy — identity for in-person presence

**Portfolio case study:** [aayushvisuals.com/work/dropby](https://aayushvisuals.com/work/dropby). The product rewards showing up in person; the identity should communicate invitation/energy rather than social posting. A radar ping is a repeatable motif. This is principally a brand system, not a separately observed live website.

**Build translation:** establish strategy and behavior first, make radar motif ownable and repeatable, define wordmark/type/color and application rules, test on app icon/social/outdoor and small size. For any app component, define location/privacy/attendance permission and data retention rather than treating “presence” as decorative.

**Agents and verification:** brand strategist, visual identity designer, product/privacy engineer if location behavior is built, QA for scale/contrast and legibility. Don't invent attendance or location features from the identity case alone.

### 10. Posterfolio — 41 posters in 4:5 format

**Portfolio case study:** [aayushvisuals.com/work/posterfolio](https://aayushvisuals.com/work/posterfolio). A broad subject range (product launches, editorial, merch/title cards) shares a fixed 4:5 format. This is visual work rather than an independent product website.

**Build translation:** model each piece with title, category, year, role, asset, alt text and credit; build an image-index/gallery page with fixed aspect-ratio thumbnails, responsive high-resolution detail, meaningful ordering/filtering and optional accessible lightbox. Use AI for research/concept variants, never unchecked final copy or unlicensed assets. Check crop, legibility at feed size, print/retina export and loading.

**Agents and verification:** art director/asset producer, portfolio UX, frontend and QA; backend only if editing/uploads require durable CMS. Check original asset provenance, 41-item completeness, captions/credits, keyboard viewer, mobile grid and image performance.

### 11. Futurepreneurs — deadline-led event campaign

**Portfolio case study:** [aayushvisuals.com/work/futurepreneurs](https://aayushvisuals.com/work/futurepreneurs). Campaign content changes during a multi-week window; visitors scan on phones and primarily need to know whether registration is open. The team needs non-developer schedule updates.

**Live destination:** [Futurepreneurs 10.0](https://future-preneurs-24.vercel.app/). Hero says registration is closed and shows a zeroed countdown; page explains the business simulation game, event timeline, story, FAQ, E-Cell contacts/social. Scrolled through to the FAQ and footer; no login or registration was attempted.

**Build translation:** put open/closed status and time-zone-correct deadline prominently, keep timeline and eligibility easy to scan, provide closed state and next action, make copy/date updates editor-safe, avoid false countdown. Verify contact details and current edition every release.

**Agents and verification:** campaign strategist/editor, UX, frontend, optional CMS/backend, QA. Test before/open/closed/expired, timezone and daylight changes, mobile scan, contact links, FAQ keyboard, no stale registration CTA.

### 12. Association of Indian Universities — legacy mark redesign

**Portfolio case study:** [aayushvisuals.com/work/aiu](https://aayushvisuals.com/work/aiu). The cited challenge is fine detail in a legacy seal disappearing at favicon scale while core symbolism must survive. This is a mark/identity design, not a live website project.

**Build translation:** translate into an identity case-study page with constraint, legacy context, symbol inventory, mark construction, before/after sizes, monochrome and real-use examples. If reproducing the redesign brief, preserve stakeholder-approved symbols; adjust strokes/mass, then test at 100/50/30/25 px, small devices, one-color print, clear space and minimum size.

**Agents and verification:** identity designer and stakeholder/domain reviewer, art director, frontend only for portfolio presentation. Do not claim the proposal was adopted unless verified; include concept status and mark credits.

### 13. Moon Store — fashion commerce and product customization

**Portfolio case study:** [aayushvisuals.com/work/moon-store](https://aayushvisuals.com/work/moon-store). Luxury look for a younger audience on a small budget; factory-level production choices need to be inserted into a comprehensible product journey. Case describes seven routes, options including fabric/manufacture/quality/GSM/style, then artwork/color/size customization, bag and shipping/payment.

**Build translation:** product page → production choices → artwork/color/size customization → bag → shipping → payment. Show price, lead time, material description and option effect before adding. Share design tokens across web/mobile. Use a server source of truth for inventory, price, custom SKU validation, cart and payment; do not mock a confirmed order.

**Agents and verification:** commerce UX, product data owner, FE/BE payments/inventory, security, QA and asset producer. Test incompatible selections, price change, unavailable variant, cart restoration, shipping errors, payment declined/duplicate and accessible option selectors. Live link not listed in the reviewed case page; case-study mockups are not evidence of production checkout.

### 14. IP-TT Cell — institutional identity proposal

**Portfolio case study:** [aayushvisuals.com/work/ip-tt-cell](https://aayushvisuals.com/work/ip-tt-cell). The brief emphasizes a five-word name with poor recall, research/industry credibility, and a review deadline. Its proposed mark encodes the acronym/pillar metaphor and was a first-round selection-stage direction.

**Build translation:** a case page should state concept status; show brief, acronym/meaning matrix, symbol construction, lockup, clearspace, small-size, environmental, digital and monochrome applications. Test the metaphor without explanatory text and record stakeholder feedback rather than claiming adoption.

**Agents and verification:** brand strategist, visual identity designer, stakeholder reviewer, frontend for case page. Use vector assets and ensure small-screen SVG semantics and contrast.

### 15. Solo Leveling — fan hub and commerce concept

**Portfolio case study:** [aayushvisuals.com/work/solo-leveling](https://aayushvisuals.com/work/solo-leveling). The case unifies episodes, manga, news and merchandise, while key art competes with legibility. Navigation spans Store, Merch, Updates, News, Ongoing and Upcoming; case includes shop, wishlist/bag, shipping and payment routes. This was reviewed as a case study, not a live licensed product.

**Build translation:** content hub and commerce should clearly distinguish owned product info from links to external media. Use a tight dark-purple/light palette, reserve artwork for large accents and protect text contrast. Secure licensing before reproducing characters/art. Build real size/quantity/wishlist/cart states only when backed by catalog, stock and checkout contracts.

**Agents and verification:** licensed-content reviewer, commerce UX, FE/BE, security and QA. Test outbound links, mobile navigation, art overlay contrast, inventory, size, wishlist persistence, checkout state and copyright/brand permissions. Do not claim media is hosted if users are sent elsewhere.

### 16. Fuzion — vintage-modern streetwear identity

**Portfolio case study:** [aayushvisuals.com/work/fuzion](https://aayushvisuals.com/work/fuzion). The problem is balancing retro heritage with modern relevance. The case describes a roman/italic wordmark contrast, Zodiak/Switzer typography, a compact palette led by burnt sienna and “Wear The Legacy.” It is an identity system, not an independently visited commerce website.

**Build translation:** express the tension as a simple repeatable system; test the mark on garment, label, social and storefront; verify stitch/screen-print constraints and readable small type. A commerce website would require a separate product, inventory and checkout brief—do not infer it from apparel mockups.

**Agents and verification:** brand/art director, apparel production reviewer, frontend only for portfolio presentation. Verify vector/print files, contrast, garment feasibility, trademark availability and consistency across sizes.

### 17. Gravitas Identity — identity at campus-scale

**Portfolio case study:** [aayushvisuals.com/work/gravitas-showcase](https://aayushvisuals.com/work/gravitas-showcase). The identity has to survive 250+ events/contributors across badges, certificates, merchandise, gates, hoardings, print, brochures and web. The case proposes VIT in the wordmark, orbital element, near-black ground and electric cyan.

**Build translation:** define components/templates and usage rules before making mockups. Prove identity at 50m gate/sign distance and 25px small display; create role-based badge variants and controlled partner/event sub-brand system. Organize assets, naming and edition refresh so many contributors cannot introduce drift.

**Agents and verification:** identity designer, print/production, event owner, visual QA, frontend for responsive digital applications. Verify one-color, large-format proof, small-screen legibility, partner lockups and correct VIT/edition marks.

### 18. Posterfolio Vol 2 — six typographic/literary posters

**Portfolio case study:** [aayushvisuals.com/work/posterfolio-vol2](https://aayushvisuals.com/work/posterfolio-vol2). Six emotionally varied posters share a narrow red/near-black/grey palette; writing is part of composition. This is a visual series, not a product UI.

**Build translation:** treat copy and typography as content, edit only with author approval, map emotional tone to type hierarchy/negative space, create one series identity with composition variation, and inspect both thumbnail and print scale. The portfolio page needs accessible descriptions and authored captions rather than burying the work in decorative text.

**Agents and verification:** art director, editorial writer with approval, frontend gallery, QA. Verify exact text, reading order, image credits, mobile crop, contrast, print/social exports and series cohesion.

### 19. Meal Maestro — evidence-led meal planning

**Portfolio case study:** [aayushvisuals.com/work/meal-maestro](https://aayushvisuals.com/work/meal-maestro). The insight is reducing weekday decision burden rather than offering more recipes. The case reports 12 interviews, 140 survey responses and five weeks of research. Treat these numbers as case-study-reported, not independently audited. Concept flow gathers preferences/avoidances/ingredients, creates a weekly plan and shared grocery list, and supports progress/continuity.

**Build translation:** start from a real midweek use scenario. Capture preferences, dietary restrictions and pantry inputs progressively; produce a coherent week plus consolidated shopping list; allow swap/skip without creating a maze. Keep explanation for recommendations; don't imply health/nutrition claims without substantiation. Persist user choices only according to privacy expectations.

**Agents and verification:** product researcher, nutrition/domain reviewer if advice is made, UX, FE/BE data/privacy, content editor and QA. Test exclusion handling, duplicate ingredients, pantry quantity, substitutions, week rollover, grocery completion, empty pantry, offline use and deletion/export. Trace insight statements to research source.

## Live-site and project coverage matrix

| Portfolio project | Case-study page | Distinct live destination observed | Review status |
|---|---|---|---|
| Mike Tyson Invitational | `/work/mike-tyson-invitational` | [Webflow site](https://mike-tyson-invitational-3821139c156afc7.webflow.io/) | Full page/menus/CTA hover; no real signup/payment submission |
| CPGRAMS | `/work/cpgrams` | [PG Portal Signin](https://pgportal.gov.in/Signin) | Login landing only; chatbot flow not visible |
| CAT Operator Assistant | `/work/cat-operator-assistant` | [GitHub Pages demo](https://aayushvz.github.io/cat-operator-assistant/) | Demo login/checklist and major dashboard views explored; safety/report controls not activated |
| Layover | `/work/layover` | [mylayover.in](https://mylayover.in/) | Full current B2B site and demo details inspected; order not placed |
| Elevation Capital | `/work/elevation-capital` | [2026 AI adoption report](https://stateofaiadoption.elevationcapital.com/) | Long-form report sections inspected; download/share not activated |
| Gravitas | `/work/gravitas` | [graVITas'25](https://gravitas25-frontend.vercel.app/) | Event microsite to footer; 2025 edition |
| Riviera | `/work/riviera` | [Riviera 2026](https://riviera-lol.vercel.app/) | Event page to footer |
| Yantra | `/work/yantra` | [Yantra site](https://yantra-xi.vercel.app/) | Header/loading progress only; loader did not finish during review |
| Futurepreneurs | `/work/futurepreneurs` | [Futurepreneurs 10.0](https://future-preneurs-24.vercel.app/) | Page through FAQs/footer; registration closed |
| DropBy | `/work/dropby` | Not linked as separate live web product | Case/identity presentation only |
| Posterfolio | `/work/posterfolio` | Not linked as separate live web product | Poster work/case page |
| AIU | `/work/aiu` | Not linked as separate live web product | Identity proposal/case page |
| Moon Store | `/work/moon-store` | Not linked as separate live web product | Commerce design case/mockups; production checkout not verified |
| IP-TT Cell | `/work/ip-tt-cell` | Not linked as separate live web product | Identity proposal/case page |
| Solo Leveling | `/work/solo-leveling` | Not linked as separate live web product | Fan-hub/commerce concept; live licensed product not verified |
| Fuzion | `/work/fuzion` | Not linked as separate live web product | Apparel identity case page |
| Gravitas Identity | `/work/gravitas-showcase` | Not linked as distinct identity website | Identity applications/case page |
| Posterfolio Vol 2 | `/work/posterfolio-vol2` | Not linked as separate live web product | Poster series/case page |
| Meal Maestro | `/work/meal-maestro` | Not linked as separate live web product | Product concept/case page |

The nine distinct destinations above are the ones found linked from the case-study routes. The projects without live product links were still reviewed as case-study pages; their designs are not evidence of deployed working systems. Time-bound content can now be stale, and the current public live version can diverge from the original case. Revisit before relying on dates, pricing, identities or current integrations.

## Originality and evidence rules for future reference work

1. Extract the product problem, user job, constraint and interaction principle. Do not trace a screenshot into a clone.
2. Make a fresh visual thesis from the user's brand, audience and content. Use source references only to explain what works and why.
3. Attribute project facts and numbers to their case page; preserve reported-study limitations. Independently verify externally consequential facts.
4. Distinguish live observed, case-study described, inferred and inaccessible flows in the design notes.
5. Test current links anew. A production route, loading screen or poster is not evidence of every case-study interaction.
6. Use original licensed/generated assets; record provenance and avoid copying a portfolio's exact assets, fonts, compositions or text.
