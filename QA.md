# Verification record

Verified locally on November 20, 2026 (Asia/Manila).

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


## Practical night lighting — November 25, 2026

- Replaced two generic lights with eight practical fixtures per individual venue: four directed field lights and four access posts outdoors; four hanging lamps and four wall lamps in the Hall. Fixtures and light targets use model coordinates and remain fixed while the camera moves. Decorative flames remain in use.
- Daylight disables practical lights and bulb emission; Night lighting enables them. Two directed lights cast 512px shadows on desktop; narrow mobile viewers retain illumination without practical shadows. Existing moonlight fill remains unchanged.
- Browser checked night-mode selection on all five venues, Colosseum overhead coverage and Hall roof-off interior coverage. Mobile shadow budgets and repeated mode switching were checked automatically; a mobile performance benchmark and exhaustive orbit/glare study were not performed.
- All 39 JavaScript tests passed, including three new fixture-budget, anchoring, reversible-mode and disposal tests. Python: 86 passed, eight existing atlas-bridge geometry tests failed. The failing tests and atlas geometry are identical to HEAD and untouched by this change; no booking/database code changed.
- Committed locally only. Stashed panorama work was not applied.


## Rise-and-set theme transition — November 25, 2026

- Replaced instant symbol swapping and full-page screenshot crossfades with coordinated 900ms rise/set paths. The outgoing body descends right, the incoming body rises from the left, and the destination palette is committed after 300ms. Clouds and stars remain independently faded; there is no spinning celestial orbit or blocking overlay.
- Header symbols show the current theme; their accessible labels describe the next action. Shared intent handling queues the latest rapid-click choice, cancels stale timers on interruption, and switches immediately with reduced motion or unavailable animation support. Storage remains optional; pre-paint restoration is preserved.
- Browser verified both final homepage themes, retained focus, and a 390px phone layout. Timing, rapid clicks, interruption cleanup and reduced motion are covered by four deterministic tests. A slow-motion visual recording and browser-level reduced-motion/storage-failure emulation were not performed.
- 43 JavaScript tests passed. Python: 85 passed with the existing atlas-bridge test file excluded; the previously recorded eight failures in that file remain outside this change.
- Preserved the additional lighting work: each venue now has 12 practical fixtures, including extra stand/access lighting or hanging lamps; night hemisphere fill increased from 0.48 to 0.68. Three fixture lifecycle/budget tests pass. No booking rules or campaign scenes changed.


## Atlas theme lighting — November 25, 2026

- The campaign map follows `html[data-theme]` on initial load and subsequent header toggles. A single atmosphere composer combines day/night, invasion and strategic parchment blending, in that order. Reduced Motion applies immediately; otherwise lighting blends over 900ms. Camera, selection and armies are retained.
- Added 28 grounded lanterns at three bridge crossings, four venue entrances and eight road shoulders. Three instanced draws share geometry/materials; four non-shadow-casting lights illuminate venue approaches. Existing mill, village and castle windows brighten at night. Observer, preference listener and fixture GPU resources are cleaned up on teardown.
- Six controller/fixture tests cover initial night, reversals, Reduced Motion, invasion warning/reign/active/boss/recovery, parchment priority and resource/light budgets. Final verification: all 49 JavaScript tests and 87 Python tests passed, including both new executable module MIME cases. The known atlas-bridge suite remains excluded.
- Live browser checks: initial dark load, both theme directions, desktop (1366x900) and narrow viewport, fullscreen, venue selection, invasion warning, and return to 2D. No browser console errors observed. All invasion phases are covered deterministically; a full multi-minute campaign was not played through. OS Reduced Motion was not changed by this task.
- Same-device desktop timing spot check: original atlas mean 25.59ms / p95 38.20ms; night atlas mean 26.35ms / p95 49.70ms. Each sampled 60 rendered frame intervals after 30 warm-up frames, identical viewport and initial venue. Mean increased about 3%; p95 is noisier in this short sample. Render calls increased from 995 to 998; triangles from 945,732 to 947,524 (includes dynamic units). This is a spot check, not a cross-device benchmark. Temporary instrumentation was removed.


## Detailed festival surroundings — November 25, 2026

- Viewer-only scenery is created for showcase/modal instances after an untouched exported builder returns. Atlas source and the complete shared builder section match their pre-feature SHA-256 hashes, including the earlier uncommitted atlas night-mode work. Card/emblem instances do not create surroundings. Existing seat geometry and close-view presets are retained.
- Four physical venue layouts adapt to each actual model's bounds: 12 car bays (two marked accessible), six parked cars, six motorcycles, three food stalls and a drinks stall, picnic seating, bins, a planted rest garden, queue rails, directional parking signage, themed banners/displays and lanterns. Modern parking is outside the perimeter. These are illustrative layouts, not real capacities or compliance claims. No ordering/parking backend was added.
- Full Venue, Top-Down Plan, Arena, Parking and Food Court views use responsive framing. Parking and food shortcuts preserve the Hall roof state; original indoor table shortcuts still lift the roof. Exterior bulbs follow the existing viewer atmosphere and use two non-shadow-casting point lights maximum. Repeated scenery is instanced; each surroundings layer uses fewer than 85 mesh draws.
- Seven surroundings tests cover layout separation, projected-corner framing at narrow/wide aspects, all five actual builders, physical promenade clearance at pedestrian height, reversible lighting and light budgets, GPU resource cleanup, and sign-texture disposal. Final full JavaScript suite: 56 passing. Final Python application suite: 88 passing; known atlas-bridge failures remain excluded.
- Live browser: all five event showcases and expanded viewers expose the new shortcuts without console errors. Visually checked food court and night parking, top-down control, Hall roof preservation/toggle, 390x844 mobile layout, and three close/reopen cycles. The final modal has one canvas and one atmosphere panel. Cleanup is unit-tested; browser heap/GPU memory was not separately profiled.
- Same-device Five Banners daylight modal spot check before the final camera-framing refinement, 60 frame intervals after 30 warm-up frames: original default arena view mean 13.34ms / p95 14.70ms, expanded default site view mean 13.15ms / p95 14.90ms. Render calls 991 -> 1045, triangles 24,309 -> 29,348. Timing is comparable in this short sample, not evidence of a speed improvement or cross-device guarantee. Instrumentation was removed before final verification.

Final overview framing fits the arena and lower surrounding landscape separately, with projected-corner checks for every real venue at narrow and wide aspects. Final JS verification remained 56 passing after this refinement. Atlas and shared builder hashes were rechecked unchanged.


## Surroundings scale and layout correction — November 25, 2026

- Corrected the scale mismatch: prior exterior dimensions were approximately full-size units while the arena seat cushions are miniature (about 0.225 Royal Lists, 0.30 Colosseum, 0.152 King's Green, 0.40 Hall). Exterior meters now map to 0.45 / 0.55 / 0.32 / 0.75 model units respectively. Cars are about 3.4–3.9 cushion widths across, stalls about 6–7 cushion widths, and picnic seat height about one cushion width. Arena geometry and seat positions are unchanged.
- Four distinct physical layouts: Royal Lists west parking / east food row, Colosseum north parking / west vendor court, King's Green east parking / south staggered garden market, Hall south parking / north L-shaped courtyard. Royal Lists event variants intentionally share the same grounds. Food courts are much more compact and have different stall arrangements.
- Increased capacity from 12 spaces to 60 / 80 / 48 / 48 car bays, plus 20 / 24 / 16 / 16 motorcycle spaces. Large lots have four marked accessible bays; smaller lots have two. A deterministic mix of parked vehicles and empty spaces remains scenery rather than live availability. Repeated vehicles, painted markings and furniture remain instanced.
- Added three regression tests for distinct placement, capacity, seat-relative dimensions and rotated highlights/bounds. Updated existing real-builder, framing, pedestrian-clearance and cleanup checks for rotated, smaller scenery. Viewer shortcut camera directions rotate with each area; parking tooltips show its illustrative capacity. Atlas source and shared builder SHA-256 hashes remain identical to the pre-surroundings state.

Final scale-correction verification: 59 JavaScript tests and 88 Python tests passed (existing atlas-bridge suite excluded). Browser checks confirmed capacity labels for all four physical venues, rotated Food Court/Parking shortcuts, night lighting, a 390x844 mobile parking view and restored desktop framing, with no console errors observed. Atlas and shared builder hashes remain unchanged.


## Local user accounts and organizer roles — November 25, 2026

- Added local SQLite users, account profiles, database-backed failed-login counters, nullable booking user ownership and an additive migration. The real instance database upgraded with a SQLite backup under instance/backups; before/after counts for venues, events, tiers, bookings, seats and booking items matched, and foreign_key_check returned no errors. No browser-test accounts were added to this database.
- Public registration creates normal users only. CLI create-admin provisions organizers; reset-password invalidates prior account sessions. The old password-only admin path redirects to shared login; legacy cookie admin flags and TOURNEY_ADMIN_HASH cannot grant access. Roles, authentication versions and stable random owner-token identity are read from the database. Passwords use Werkzeug hashes; CSRF and cookie safeguards remain active. Five failed attempts per email/IP combination enforce a 15-minute cooldown across new cookies. A server-side authenticated_at check imposes an eight-hour maximum even with active polling.
- New bookings require login and attach user_id in the existing reservation transaction. Stable owner tokens permit the account's pending reservations to be updated, confirmed or released from another browser. Other accounts cannot read/cancel/lookup those bookings, even with buyer email/reference. Legacy user_id-null tickets preserve their original lookup flow and are never assigned automatically by email.
- Validated houses and itineraries persist per account. Registration imports a guest draft once; ordinary login loads the account profile without merging another draft. Logout clears personal cookie data and rotates CSRF/anonymous ownership. Signed-in My bookings links now open the account dashboard; legacy lookup remains separately available.
- Added 13 account/security tests, including role escalation rejection, CSRF/session rotation, safe redirects, cookie-resistant throttling, role reload, password-reset invalidation, expiry despite activity, cross-browser reads/mutations, profile isolation/import, migration idempotency/backups, legacy compatibility and rejection of a stale session if SQLite reuses a deleted user ID. Existing buyer/admin fixtures now represent real database accounts. Old anonymous-booking and cross-account lookup expectations were intentionally changed.
- Final verification: 101 Python tests passed with the pre-existing atlas-bridge suite excluded; all 59 JavaScript tests passed. Python compilation and git diff --check passed. A low-effort read-only account review found no remaining important findings; its two suggested coverage additions were implemented, along with the stale-identity regression.
- Live browser checks used a separate temporary SQLite snapshot on port 5058: registration, login-required seat selection, reserving a seat, simulated checkout, confirmed ticket in My Account, saving a house and itinerary, logout by mouse/keyboard, re-login restoring all three, 390x844 mobile login, desktop/dark dashboard and no console errors observed. The expanded navigation height/scrolling was corrected after browser testing exposed clipped logout. The temporary preview was stopped; the real website remains on port 5055 with registration open. No real administrator credentials were chosen or created by the assistant; setup is documented in README.


## Owner management, gate staff and activity history — November 25, 2026

- Added user, staff, admin and owner roles. Gate staff can inspect/admit bookings for all events, without event editing, inventory, ledger, user management or activity access. Admins manage regular users only; owners manage non-owner accounts and assign user/staff/admin roles. Web changes cannot target the current actor or any owner. Owner promotion is local CLI only.
- User management provides search, filters, 50-row pagination, confirmation and required reasons, plus explicit saved feedback. Activity history is read-only, has actor/action/target/Manila-date filters and 50-row pagination, and expands whitelisted before/after snapshots. No password hashes, session/owner tokens, houses or itineraries are included.
- Suspension invalidates sessions, prevents login and releases pending holds, preserving confirmed ticket validity and profiles. Restoration does not revive holds. Role changes revoke old sessions. Every signed-in transaction rechecks identity, active state and authentication version after obtaining the SQLite write lock; organizer/gate mutations also recheck permitted roles. Race tests inject suspension between the request guard and the transaction for event cancellation, gate admission and new reservation creation.
- Event/tier changes, account status/role changes, successful gate admissions and privileged CLI provisioning/reset actions are audited atomically. An injected audit failure rolls back both event and suspension changes; repeated admission and no-op cancellation do not duplicate entries.
- Migration regression uses a legacy constrained users table with linked profiles, bookings and gate passes; IDs, hashes, tokens, roles and links survive, foreign keys remain enforced, and repeated initialization creates one pre-role backup. The real instance upgrade preserved linked-table digests and existing user fields before explicit promotion of admin.test@tourneygate.local to Owner. Its password and owner identity were preserved; other users were unchanged. A pre-roles backup was created under instance/backups.
- Browser QA used disposable accounts in a separate temporary database on port 5058: owner navigation from account to box office/users, suspension/restoration dialogs, saved confirmations, protected owner rows, role choices, 390x844 mobile confirmation controls and contained table scrolling, action-filtered audit history and expanded snapshots. No browser console errors observed. Preview image: management-activity-preview.jpg in the helper workspace. No browser test users were created in the real database.
- Verification: 115 applicable Python tests passed (including 14 management tests), all 59 JavaScript tests passed and management.js syntax passed. The existing atlas bridge suite remains at 8 failures and 1 pass for outdated road/bridge geometry assertions; this feature does not modify that geometry. The low-effort review's revocation finding was fixed and covered by regression tests.
