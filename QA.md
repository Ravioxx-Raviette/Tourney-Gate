# Verification record

Latest verification: November 24, 2026 (Asia/Manila). Older entries remain below.

## Atlas performance — November 24, 2026

- Baseline: `0f5da1a` with the same opt-in diagnostics added before optimization. Both versions ran in the same in-app Chromium browser, viewport 1440 × 1000, DPR 1. Each scenario used three samples, each five seconds warm-up plus twenty seconds collection. Scenario order: overview, continuous orbit/zoom, crowded invasion, fullscreen orbit. The running local server and demo database were preserved.
- The table reports the median of each metric's three trial summaries; these are not pooled percentiles. [Raw measurements](docs/atlas-performance/measurements.json) retain every trial, population, draw/triangle count, upload volume, and CPU timing.

| Scenario | Median frame before / after | p95 before / after | FPS before / after | Median-frame reduction |
| --- | --- | --- | --- | --- |
| Overview | 71.0 / 39.5 ms | 103.7 / 64.6 ms | 13.43 / 23.91 | 44.4% |
| Orbit / zoom | 76.9 / 45.4 ms | 104.6 / 60.8 ms | 12.73 / 21.27 | 41.0% |
| Crowded invasion | 91.9 / 59.1 ms | 130.7 / 86.1 ms | 10.31 / 16.51 | 35.7% |
| Fullscreen orbit | 78.6 / 44.4 ms | 100.8 / 57.6 ms | 12.56 / 21.89 | 43.5% |

- Overview draw calls: 2,789 → 979; total buffer uploads: 1,548,891 → 446,526 bytes/frame (71.2% lower). Overview label CPU falls from 3.48 ms to below measurement rounding while stationary; moving-label CPU is about 0.09 ms. Orbit render-submission CPU falls from 45.99 to 19.62 ms. These are CPU timings, not GPU timer queries. Saved comparison trials count all `bufferSubData` traffic; the final diagnostics also identify instance matrix/color buffers separately as `meanInstanceUploadBytes`.
- A [final counter check](docs/atlas-performance/final-counter-check.json), after extending active ranges to naval effects, recorded 436,537 / 441,014 / 441,323 instance bytes per frame; all buffer traffic in these ordinary-view samples came from instance attributes. Its median-of-trials frame time was 42.9 ms and p95 62.2 ms (22.53 FPS). CPU parity/unit checks ran during this additional verification, so the original comparison set above remains the primary performance record.
- The ordinary overview/movement results exceed the 20% median-frame target, with lower p95 in all observed scenarios. Live simulation populations/effect counts evolve; this is a comparable phase/camera-path test rather than an identical-frame replay. Fullscreen followed invasion, with 1,157/976/840 living units in baseline samples and 842/841/841 after optimization, so its end-to-end gain cannot be attributed solely to renderer changes. Invasion's first samples were closer: 1,923 vs 1,904 living units, 84.3 → 54.7 ms median and 120.2 → 86.1 ms p95. These results describe this machine/browser session.
- A separate CPU parity check loaded baseline and optimized simulation functions in isolated modules, built the actual armies/territory, advanced 30 fixed 1/60-second idle frames, triggered/skipped to invasion wave 3, then advanced another 30 frames. All 2,073 allocated units matched exactly in type, team, life state, position, HP, and heading at both checkpoints. Grid pooling does not change insertion/neighbor order, random consumption, targeting, collision order, or simulation timestep.
- Actual venue census: Five Banners 950 → 131 meshes / 17,769 triangles; Colosseum 672 → 83 / 42,012; King's Mark 225 → 43 / 11,691; Feast 825 → 172 / 16,594. Total visible triangles stay **88,066**. Generic regressions compare transformed world bounds, positions, normals, UVs, normalized vertex colors, winding, material/shadow assignments and raycast hits. Actual-builder tests retain all four models' triangles, animated object references and controlled roofs. Custom shaders, transparent/reflected objects, unsupported attributes, and animated subtrees remain unbatched.
- **103 Python tests and 61 JavaScript tests passed** (the previous 47 JavaScript tests plus 14 new performance checks). New checks cover active matrix/color ranges, unchanged/reordered colors, growing/shrinking/empty pools, dynamic usage, bucket identity/order, label invalidation, shared-resource disposal, custom-shader exclusion, diagnostics being absent without the flag, and partial instance-byte accounting/hook cleanup. Existing lifecycle tests recheck pause/resume, excluded background time, history restoration, retry, context-loss cleanup, reduced motion, and repeated toggles. Reproduce the separate CPU parity comparison with `node scripts/check_atlas_simulation.mjs 0f5da1a`.
- Browser checks: normal browsing had zero diagnostics; `atlasPerf=1` survived venue selection; keyboard label selection synchronized preview/URL; Back/Forward restored venue selection. Repeated 2D/3D transitions retained one campaign canvas. Labels updated during the timed orbit/fullscreen runs, selection, desktop/390px resize and manual exploration with reduced motion. The reduced-motion status appeared immediately and returned to active after restoring the preference. At 390px the page had no horizontal overflow. Wave 3 and undead-reign corruption controls still worked. No browser console errors/warnings were observed in these checks.
- Visual review captures retain venue architecture, seats, flags, shadows, river texture/effects, troops, and corruption. [Overview before](docs/atlas-performance/before-overview.png) / [after](docs/atlas-performance/after-overview.png), [Royal Lists close view before](docs/atlas-performance/before-close.png) / [after](docs/atlas-performance/after-close.png), [corruption](docs/atlas-performance/after-corruption.png), and [mobile](docs/atlas-performance/after-mobile.png). Camera presets match; moving troops, cloud/dragon positions and animation phases differ. These are visual inspections, not pixel-diff proofs. Browser fullscreen used its available native/CSS paths; OS/browser-specific fullscreen composition and physical mobile hardware are not exhaustively covered.
- Remaining bottlenecks: army simulation averages about 16.6 ms during ordinary movement and 35.1 ms during the invasion samples; render submission is still roughly 17–20 ms. Terrain, effects and dynamic shadows retain substantial vertex/draw cost. No adaptive quality, lower resolution, reduced geometry, troop reduction, lighting/shadow change, or animation-rate change was introduced. Detail/seat-preview builders, backend APIs and database code were not modified. Existing user preview files were left untouched. Work remains a local commit, with no push or deployment.

## UI_Ver-03 and Ver_03_03 consolidation — November 24, 2026

- Combined UI_Ver-03 `b39a9b0` and Ver_03_03 `079a403` on `codex/tourney-gate`. Resolved the helper conflict by retaining both `standard_flutter` and `asset_v`; retained the current hero, Rules, accessibility/armory, cursor effects, participant details and booking controls. Added the campaign and Great Hall roof controls. Booking rules, schema, database snapshots, credentials, and Groundling capacity logic were not replaced.
- **103 Python tests and 47 JavaScript tests passed.** Coverage includes the original booking, inventory, privacy, CSRF, administration, house, itinerary, gatekeeper, camera, and party regressions; five consolidation checks; transform-aware central and side bridge geometry; eleven campaign/runtime checks. A working bundled Python repaired the obsolete virtual-environment path and installed the existing declared qrcode dependency.
- Loader/runtime tests cover opt-in loading, shared imports, cancelled/late mounts, retry after import/mount failure, pause/resume, no accumulated background time, context-loss disposal/remount, combined live motion preferences, shortcut scope, idempotent real venue startup, and real campaign cleanup when WebGL creation fails.
- Live browser checks at 1440×1000 and 390×844: detailed UI retained; initial 2D had zero campaign canvases; repeated 2D/3D toggles retained exactly one campaign canvas; selected Great Hall synchronized its event list and URL; Back/Forward restored selection; event-detail navigation and return remained usable. The tested return performed a full navigation, starting fresh in 2D; history-cache lifecycle is covered by controller tests rather than a claimed browser cache hit.
- Territory overlay and invasion controls worked. Existing skip controls exercised warning, waves 1–3, undead reign, Radiant Heroes, rebuilding, and peace without waiting for real timers. Reduced motion immediately froze the campaign and displayed a clear status. Manual venue exploration and fullscreen remained available; Escape restored normal view/focus. Great Hall roof switched On/Off alongside its existing lighting, stories, and ambience controls. No browser console errors were observed during these flows.
- Mobile page had no horizontal overflow. Moved the 2D activation button away from landmark labels and placed non-fullscreen mobile campaign controls below the scene. Desktop and mobile rendering were inspected. Booking mutations were tested against isolated fixture databases; browser campaign checks did not place orders or alter event capacity.
- Physical printing, camera scanning, extended real-time invasion balancing, and hardware GPU-loss injection were not exercised. Existing print/QR regressions passed; fallback and cleanup are covered by automated tests. No deployment or push is part of this consolidation.

## UI refresh merge verification — November 20, 2026

- Merged UI_Ver-01 commit `59e3da7` into the current 3D branch. Resolved the shared shell conflict by retaining `venue3d.css` and adopting the new transition bootstrap; combined current feature documentation with the incoming Node test instructions.
- The actual merged checkout passed **92 Python tests and 33 JavaScript tests**, including booking/security, all new features, SVG bridge geometry, and transition interruptions. JavaScript syntax and staged whitespace checks passed.
- Live browser used a disposable seeded database: refreshed atlas displayed all four landmarks; selecting King’s Green updated the event list and focus; following King’s Mark opened its detail page; the real 3D model rendered and responded to Top-Down Plan and Torchlight controls. No existing bookings were modified.
- Current 3D, house, party assistant, seat preview, itinerary, and gatekeeper implementation files were preserved. Backup branch: `backup/before-ui-refresh-20261120-9b84d7b`. No push performed.
- Direct merge and self-review without subagents. This run checked desktop visuals; incoming mobile artwork and responsive rules were inspected but not re-tested in a mobile browser.

## Herald’s Gatekeeper verification — November 20, 2026

- Confirmed tickets receive private, stable SVG QR passes. The organizer reviews a group and explicitly records one admission for the entire booking. Repeated scans cannot admit twice; checked-in guests cannot cancel and restore inventory.
- **83 Python tests and 18 JavaScript tests passed**. New coverage includes QR privacy/stability, token and reference lookup, organizer authentication, CSRF, pending/expired/cancelled bookings, event mismatches/closure, revalidation after cancellation, and simultaneous admission from two organizer sessions. JavaScript syntax and patch whitespace checks passed.
- Live browser verification used a disposable seeded database with fictional guest details: review showed two Royal Box seats, explicit check-in succeeded, repeated review showed the duplicate warning, and the ticket displayed its QR and checked-in state.
- Camera access, physical QR scanners, and physical printing were not exercised. Native camera QR support is browser-dependent; manual entry remains available. The camera lifecycle and responsive/print rules were inspected in source.
- Implemented and reviewed directly without subagents. Existing local data is upgraded through an additive table; no database reset is required.

## Festival-day planner verification — November 20, 2026

- Added private browser-session plans, chronological Manila date groups, pairwise overlap/break checks, per-event links, removal/clear, and print styling. No booking or inventory mutations.
- Live browser added The King’s Mark and The Victor’s Feast, retained both in time order, displayed the PHP 1,500 starting-price total and the 30-minute break warning for their back-to-back times.
- Automated cases cover nested overlaps, break boundaries, idempotent adds, session isolation, CSRF, invalid/missing events, clearing, cancellation visibility, and unchanged bookings. Print styling was inspected; a physical print run was not performed.
- Direct implementation/self-review, without subagents.

## Living festival venues verification — November 20, 2026

- Added daylight/torchlight, visible-geometry story picking and accessible landmark buttons, and opt-in synthesized ambience with volume. No reservation or inventory changes.
- Live checks confirmed controls and three stories on all five models; Royal Lists torchlight/stable story/sound on-off state, and expanded Feast torchlight/story at a 390px viewport. Audio UI and lifecycle were checked; no subjective audio-quality assessment was performed.
- Automated checks cover real Three.js light changes, all venue story definitions, exclusive opt-in audio and cancelling pending audio startup, alongside the existing camera/party/booking regressions.
- Direct implementation and self-review; no subagents used for this feature.

## Create Your House verification — November 20, 2026

- Optional name/motto, four fixed SVG crests and four coordinated palettes; live preview and browser-session save/clear. Desktop and 390px editor verified; saved crest appears in header and festival atlas.
- Confirmed ticket snapshots persist through authorized lookup and later profile edits. Guests can omit personalization. Existing databases gain an additive snapshot table; inventory and historical rows are preserved.
- Regression cases cover CSRF, invalid colors/length/control characters, escaped user text, optional checkout, cross-tab stale profile review, ticket privacy, and repeated confirmation preserving the original snapshot.
- **71 Python tests and 13 JavaScript tests passed**. Print styles preserve crest colors; a physical print run was not performed.

## Seat Our Party verification — November 20, 2026

- Royal Lists only: current-tier contiguous runs, no across-aisle or split-row suggestions; size 1–8, optional total budget, explicit selection replacement.
- Browser verified a three-seat Royal Box suggestion (A4–A6) for PHP 4,500, group overview, and applying exactly those three seats. No hold is made by search, preview, or apply.
- Reviewed stale-price invalidation, preserving highlights on map/list changes, and clearing group markers after invalidation. Shared inventory mutations remain unchanged.
- Added pure adjacency, budget, unavailable-gap, order-limit, venue, and own-hold expiry cases, plus supported-page coverage.

## See My View verification — November 20, 2026

- **64 Python tests and 7 JavaScript layout/camera tests passed**; all application JavaScript syntax checks passed.
- Added shared Royal Lists geometry, independent A/B comparison, anchored camera controls and overview marker, unsupported-seat/loading fallbacks, and disposal on close.
- Live browser checks: jousting and grand melee seat-level rendering; cross-tier A/B comparison; look/overview controls; focus restoration; desktop and 390 × 844 full-screen mobile dialog.
- Comparing a Noble seat left the original single Royal Box selection unchanged. Continued to checkout and confirmed a disposable demo ticket containing only the original seat.
- A competing visitor held the original selected seat in the disposable preview: polling labeled it unavailable, removed it from the booking selection, and closing the dialog focused the active tier control.
- Automated layout/camera tests cover all 300 positions, north/south boundaries, unsupported layouts, valid own-held comparison, expired ownership, and resetting after overview drag. No live database was modified.
- Seat camera changes are immediate, including for reduced-motion preferences. OS-level reduced-motion and physical mobile hardware were not exercised.

## Windows script-loading fix — November 20, 2026

- Fixed JavaScript served as text/plain by Windows MIME registrations. Static scripts now use text/javascript while retaining nosniff.
- 61 tests passed, including eight incorrect-MIME regression cases and non-script/404 preservation.
- Live browser verified the Silver Lance 3D model rendering, camera and auto-rotate controls, and expanded viewer. This resolves the earlier runtime verification limitation below.
- Restart the server and hard-refresh existing browser tabs to discard cached plain-text responses.

## UI/3D merge verification — November 20, 2026

- Before merging: 25 tests passed and 3 failed because legacy cases assumed five-event seed IDs.
- Legacy fixtures now copy the bundled five-event snapshot into isolated temporary databases. Fresh-catalogue integration tests independently seed all 20 events.
- Restored UI atlas/filter regression tests; added combined atlas/3D, expanded schedule, empty realm, category model mapping, and fresh-catalogue spectator/count/participant booking checks.
- Full merged suite: **52 passed**. All local JavaScript files pass `node --check`.
- In-app browser visual checks confirmed the navy/gold theme, cards, venue-linked atlas preview, and detail page layout. The 3D viewer did not render in this browser session; runtime 3D rendering, interactive filters and live updates could not be verified there. Server-rendered fallback links and venue previews worked.
- Existing seed, schema, inventory transactions, admin mutations, and seat-map renderer are preserved from `3D_Ver_02`. No live bookings were used for verification.

## Earlier UI branch verification (historical)

The records below predate the merge and are retained as historical evidence.

### Automated checks

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
