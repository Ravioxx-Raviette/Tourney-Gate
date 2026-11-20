# Verification record

Verified locally on November 20, 2026 (Asia/Manila).

## Automated checks

- `python -m pytest -q`: **47 passed** (the original 28 plus 10 atlas cases and 9 bridge geometry/bank checks).
- `node --check` passed for `atlas.js` and `motion.js`.
- `node --test tests/motion.test.cjs`: **15 passed**. Tests exercise the actual controller with controlled animation promises, timers, and navigation; no browser or additional packages are required.
- PowerShell AST parsing of `start.ps1` reported no syntax errors.
- Public page smoke checks returned HTTP 200 for Home, Events, Event Detail, Seat Selection, Participant Registration, My Bookings, and Organizer Login. Checkout, Ticket, and the protected Admin page were verified during the browser journey.

The booking tests use isolated temporary SQLite databases. Concurrent tests use independent clients/connections competing at a barrier. They verify that only one client obtains the last seat or last counted ticket and that repeated concurrent confirmation only subtracts once.

## Storybook artwork refinement

- Dry-bank follow-up: preserved the symmetric X and reshaped the local river channel beneath it. All bank/water strokes share one centerline, water highlights are clipped to the channel, and four stone landings support the entrances on dry terrain. Four additional tests sample each full entrance width, every landing edge, and each full road approach against the outer bank boundary, requiring six SVG units of clearance after stroke widths. All nine bridge checks and the full 47-test Python suite passed. The close-up, desktop, 390px, and 320px illustration studies were regenerated, validated, and inspected.

- Bridge alignment revision: rebuilt a symmetric X at `(565, 431)` with four 64-unit arms, a 22-unit deck, and ±28° axes. Roads now end at entrance midpoints with collinear approach tangents. Road beds, surfaces, and highlights render from one shared path collection. A shallow underside replaces the offset duplicate silhouette. Desktop, 390px, 320px, and close-up SVG artwork studies were regenerated and visually inspected. Five focused geometry tests check actual deck edges, entrance widths, road endpoints, tangent alignment, and shared path geometry.

- Rebuilt all four landmark SVGs inside their existing 220 × 135 boxes. Added curated venue districts, mixed tree types, hills, gardens, reeds, stones, earth-toned roads, and a stone bridge. Existing link targets, coordinates, labels, event data, and interaction handlers were retained.
- Corrected a Jinja decimal-literal syntax error caught by the first test pass. The complete Python suite then passed: **38 passed**. The unchanged transition suite also passed: **15 passed**.
- Rendered full-map, four-landmark, 390px, and 320px SVG artwork studies with the bundled Sharp renderer. Inspected the rendered images for distinct silhouettes, simplified mobile detail, readable labels, and illustration overlap. These are static illustration studies, not browser layout verification.
- Parsed the combined live SVG sources and all four exported artboards as XML. No duplicate IDs or unresolved internal references were found. The combined source has 31 definitions/IDs and 22 distinct resolved references.
- Rasterized each landmark at 2× and checked all outer-edge alpha pixels. All four miniatures have clear canvas edges, with no clipped flags, roofs, or other visible artwork at the box boundaries.
- `scripts/export_atlas.py` regenerates the SVG studies and validates their references before writing them. PNGs are review artifacts only; no runtime dependencies or product bitmap assets were added.
- The local server was restarted for the new template artwork. Browser-based selection, history, live counts, keyboard navigation, and 390px/320px page layout checks remain unverified for this art-only revision because the supported browser automation remains unavailable. The prior source and route coverage are retained.
- Work remains local on `codex/faire-refinement`; nothing was committed, pushed, or deployed.

## Current faire refinement

- Based on `UI_Ver-01`, with work kept locally on `codex/faire-refinement`. No commit, push, deployment, database migration, or booking API change was made.
- Gate timings are 160ms close / 320ms open, with a 220ms, 6px content settle. The shared TG crest replaces the former generic gate mark. Lapis, gilt borders, and restrained damask use existing theme tokens.
- The atlas uses original SVG terrain and landmark refinements, warm parchment, gold ornament, readable venue plaques, and a lapis preview heading. Selection no longer zooms automatically. Manual zoom and reset remain available; selection and preview transitions are 200ms and 220ms respectively.
- Initial native-browser desktop inspection verified the atlas, Royal Lists selection, both event rows, and the sold-out label. Later small count-label contrast and focus edits were inspected in source.
- Browser automation then ended because URL policy enforcement is unsupported for the current Windows browser. No further browser input was attempted. Final fresh screenshots, 390px/320px browser checks, visual gate playback, live Back/Forward, live polling, and browser-emulated reduced-motion/no-JavaScript checks remain unverified for this refinement.
- Automated transition checks cover repeated clicks, cancelled and overlapping arrivals, Escape, blocked storage, failed animation APIs, stale records, stopped loads, restored history, reduced motion, and native-link bypasses. These checks do not substitute for visual browser verification.
- The browser checks and screenshot filenames below describe the previous baseline, before this refinement.

## Earlier browser checks

### Atlas Home feature and consistent pages

- Checked desktop 1440 × 1000, phone 390 × 844, and narrow phone 320 × 740. Home has the shared header/footer, atlas feature, event cards, story, and FAQ in normal document flow. No fixed sheet or discovery-only navigation remains.
- All four Home landmarks fit at the checked phone widths. At 320px, extra map height separates the venue labels and counts. Width checks found no page-wide horizontal overflow on Home, expanded catalogue filters, or sold-out event details.
- Keyboard Enter selects Royal Lists, reveals both chronological tournaments, and focuses the preview heading. `/?venue=1#atlas` supports direct refresh and Back/Forward. Internal selection does not activate the gate overlay; ordinary event links open the full detail page.
- A temporary Royal Lists reservation changed the preview and the Home card together from 300 to 299 seats through the shared poll. The fixture was released and removed. Home has one polling owner; the atlas consumes its event updates.
- Events uses the original card grid and filters, with an additional venue control. Combined search, experience, venue, date, and budget produced one King's Mark result. Back from that detail restored the complete filter URL and result count; Forward restored the detail.
- Empty search displays No events found. Clear filters restores all five events. The sold-out Five Banners page exposes a disabled Sold out button.
- Shared navigation was checked across Home, Events, Event Detail, Seat Selection, and Participant Registration. The phone menu opens and closes with Escape. The Home event-section link scrolls its heading below the sticky header.
- Seat selection and participant registration handoffs work. No participant waiver or payment was submitted during this verification.
- Review captures: `preview-consistent-home.jpg`, `preview-consistent-events.jpg`, `preview-consistent-detail.jpg`, `preview-consistent-booking.jpg`, and `preview-consistent-mobile.jpg`.
- Server-rendered venue selections, event links, full details, and GET filters are covered by the route tests. Reduced-motion CSS and controller guards were inspected. A JavaScript-disabled browser run and browser/OS reduced-motion emulation were unavailable in this session.
- Implementation and QA were completed locally on `codex/realm-atlas`. No migration or booking API change was required. The release branch is `Ver_01`.

### Earlier booking and catalogue checks

The following checks predate the Home feature revision. The conventional catalogue/detail layouts are now restored; booking screens remain unchanged.

- Desktop 1440 × 1000: home composition, event details, map, order summary, checkout, ticket, lookup, cancellation, organizer ledger, and tier editor.
- Mobile 390 × 844: menu expansion, event search and result filtering, and page width.
- Narrow mobile 320 × 740: event detail, scrollable map, accessible seat list, keyboard selection, fixed checkout bar, and home spacing.
- Read-only DOM width checks found no page-wide horizontal overflow at the checked widths. The venue map intentionally scrolls horizontally when it exceeds its viewport.
- Selected two Royal Box seats, using Space for the first and mouse for the second; reserved them, submitted fictional buyer details, and confirmed a simulated payment. The ticket showed both seats, the correct total, and a unique reference.
- Looked up that ticket by email and reference, cancelled it through the confirmation dialog, and observed the cancelled state and restored inventory in the organizer ledger.
- Signed into the organizer dashboard with a temporary test password and opened its capacity editor. Removed that temporary password and the cancelled smoke-test booking afterward; the demo database retains only the seed records. Configure your own organizer password with `flask --app app set-admin`.

## Motion and accessibility

- Seat selection responds to keyboard Space and exposes selected state and descriptive seat labels.
- An alternate seat list, zoom controls, form labels, validation messages, skip link, focus outlines, and live result messages are implemented.
- Native CSS/JavaScript provides hero entrances, staggered reveals, heraldic motion, card feedback, seat feedback, and ticket/seal entrance animations.
- The November 20 visual refresh adds the gate wipe, house-colored cards, dark crest section, sticky header/progress strip, ripple feedback, animated filter resizing, and cancellable FAQ expansion. Browser checks verified navigation clears its overlay, search/reset still works, repeated FAQ toggles settle correctly, and reservation creation/release reaches the correct pages with the new transitions enabled.
- Reduced-motion media rules remove animations, transitions, smooth scrolling, and hero parallax. These rules were inspected in source; an OS-level reduced-motion toggle was not exercised.
- Print styles are provided for the ticket; an actual printer/PDF print run was not performed.

## Local demo limits

Availability updates by five-second polling, not a push connection. The Flask development server is local-only. Payments are simulated and no email is sent. Public production deployment and production security hardening are outside this local class-project build.
