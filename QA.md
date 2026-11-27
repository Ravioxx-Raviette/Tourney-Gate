# Verification record

Latest verification: November 27, 2026 (Asia/Manila). Older entries remain below.

## Fullscreen cursor and invasion controls — November 27, 2026

- [x] Keep the selected cursor visible over fullscreen atlas controls. Cursor overlays now follow native fullscreen, CSS fullscreen, and modal hosts; CSS fallback controls outside the map's stacking context retain a body overlay. Fullscreen/dialog changes rehost the effects even without pointer movement. The native cursor is hidden only after the drawn shield is connected and visible; system cursors, all five weapons, large cursors, sparkles off, and reduced motion remain supported.
- [x] Fix invasion fast-forward freezes. The active-wave HUD referenced an undefined `isBoss`, reproduced as a browser `ReferenceError` when entering Wave 1. Boss styling now derives from the current wave. One command controller handles toolbar/banner clicks, U/N shortcuts, and debug actions; it paints “Advancing…” feedback, ignores extra input while busy, and restores controls after rendering the new state. Mode/pause/disposal changes cancel pending commands. Reduced-motion skips update the static scene without advancing simulation time.
- Conquest and reclamation mark territory textures dirty and flush the final state once, avoiding redundant immediate paints. The existing troop pools, geometry, shadow cadence, camera controls, normal phase timers, and benchmark setup are retained. Unexpected frame/transition failures clear busy state and use the existing illustrated-map/“Try 3D again” recovery; no Restart Invasion control was added.
- Validation: **118 JavaScript tests passed**, including the real army/territory state machine through three cycles each in normal and reduced motion, with 27 accepted transitions and 540 duplicate requests rejected per run. Isolated transition work peaked at approximately 2.7ms; the concurrently executed full suite recorded up to 4.6ms. Dirty conquest/neutralization/reclamation produced one texture paint. **33 focused pytest checks passed** for discovery/campaign integration, static assets, and venue regressions.
- **Five real WebGL browser scenarios passed:** native fullscreen cursors; CSS fallback cursors (including sticky-header controls); three invasion cycles using debug actions, actual button handlers, and U/N keyboard events with rapid repeated input; reduced-motion skipping and pending-command cancellation on WebGL context loss; and injected render failure followed by a successful Retry in the same document. No uncaught JavaScript exceptions remained. Across the 27 accepted browser transitions, measured request-to-render/control-ready latency was 110–678ms (about 242ms average) on this host. The dense WebGL scene still produced ordinary rendering long tasks, peaking at 120ms; these measurements are not cross-device FPS guarantees.
- Native/CSS fullscreen screenshots were visually inspected with the replacement shield and large hover ring visible above the toolbar. Raw transition timings and screenshots are written under ignored `test-results/atlas-interactions/`. The legacy CPU hash-parity script also fails when comparing unchanged HEAD with itself, so deterministic phase/state invariants are used for this fix instead of its identity-sensitive digests.
- Reproduce with `node --test tests/atlas-runtime.test.mjs tests/atlas-invasion.test.mjs`, `node --test tests/atlas-interactions.browser.cjs` (Playwright/Python dependencies required), and `python -m pytest tests/test_campaign_merge.py tests/test_atlas.py tests/test_static_assets.py tests/test_venue_people.py -q`. Browser tests accept optional `PYTHON` and `CHROMIUM_EXECUTABLE_PATH` and use temporary databases.

## Homepage, account, and history cleanup — November 27, 2026

- The main scrollbar thumb uses transparent borders and a clipped background, keeping its track separator visible. Herald's Desk content grows naturally without either nested scroll container. Atlas dates and schedule numerals use Cinzel 600 with lining/tabular numbers; their grid columns grow with enlarged text. Explore the Realm now uses one offset based on sticky-header height plus 12px.
- New passwords require 12–64 characters in registration/provisioning/reset, while existing passwords up to 128 characters remain valid for login. The account itinerary previews three chronological saved events, identifies ended/cancelled entries, skips deleted records, and links to Plan My Day. My Bookings has consistent empty-state/action spacing and account-owned cancellation with a confirmation dialog, inline errors, duplicate-submit protection, and status updates.
- `/bookings` redirects through login to `/account#bookings`; the lookup template, handler, and email/reference endpoint are removed. Navbar/footer destinations and guest booking/login/register return paths are updated. Existing authorized legacy ticket access remains supported without automatic ownership reassignment. Availability polling retains guest authentication prompts.
- Back/Forward arrivals use navigation timing for fresh history loads and `pageshow.persisted` for actual cached restores. History arrivals avoid the old content translation, which shifted scroll anchoring by 6px. Cached pages refresh accessibility preferences, and reduced motion or Escape clears pending gate effects. Same-page atlas history remains free of gates.
- Validation: the full pytest suite passed **164 tests**, including new password boundaries, old long-password login, CLI limits, itinerary states, retired lookup, redirects, cancellation eligibility/CSRF/ownership, and checked-in restrictions. **20** gate-controller tests passed. **13 browser scenarios** passed across the full and focused runs: the earlier 400 header-layout combinations, 30 homepage theme/font/viewport combinations, normal/reduced-motion anchor scrolling, date/title separation, long Herald lists, scrollbar painting, guest polling/authentication return paths, cancellation failure/keep/repeated-submit/success, fresh history traversal, and a real cached restore verified through `pageshow.persisted` and preserved document identity. No uncaught browser JavaScript errors were observed.
- Visual review covered the scrollbar at the top/middle/bottom, mobile cancellation and account spacing, and an atlas with long lists and enlarged readable text in dark mode. Browser-UI keyboard accelerators are not generated by headless Chromium; native Back/Forward traversal and the shared history events they produce were exercised. Tests use temporary databases and preserve the working instance data.
- Reproduce with `python -m pytest -q`, `node --test tests/motion.test.cjs`, and `node --test tests/navigation.browser.cjs` (Playwright and the configured Python dependencies required; see the runtime options below). Preview PNGs are under ignored `test-results/navigation/`.

### Completed UI checklist

- [x] Combine Log In/Register under one profile control and remove Home.
- [x] Fix Readable Font clipping in Plan My Day.
- [x] Keep Plan My Day's width stable when switching fonts.
- [x] Underline text links without underlining buttons, icons, or plus signs.
- [x] Replace double-line navbar hover effects with color/background feedback.
- [x] Keep the main scrollbar separator visible beside the thumb.
- [x] Replay gate arrivals on browser Back/Forward navigation.
- [x] Improve Herald's Desk and Upcoming Gatherings numerals.
- [x] Scroll Explore the Realm fully to the Festival Atlas section.
- [x] Remove nested Herald's Desk scrollbars.
- [x] Shorten new-password limits to 12–64 characters.
- [x] Use separate account/logout icons with consistent alignment.
- [x] Replace the account itinerary count with a saved-event preview.
- [x] Fix My Bookings empty-state and action spacing.
- [x] Retire Find Your Booking and prompt guests to authenticate before booking.

## Navigation and accessibility — November 27, 2026

- Removed the Home navigation item; the labeled brand still returns home. Guests use one profile disclosure for Log in/Register. Signed-in visitors use separate account and POST/CSRF-protected logout icons; owner navigation retains its management destinations.
- Header sizing lives in `navigation.css`. The existing 1320px compact cutoff remains, with earlier collapse when the natural desktop controls exceed the available width. Fonts, preference changes, resizing, and saved-count updates trigger a fit check. Plan my day reserves the same width across font choices and grows with enlarged text.
- Underline Links decorates text labels, including newly rendered atlas links, while excluding button controls and decorative symbols. Navigation hover/current state uses a background and color change without the second underline.
- Validation: 32 account/navigation/static-asset pytest cases and 18 gate-motion JavaScript cases passed. Chromium browser checks cover guest/customer/staff/admin/owner navigation, 0/20 saved events, eight viewport widths (320–1920px), and five accessibility combinations (400 layout cases), plus disclosure keyboard/touch behavior, preference persistence, light/dark link decoration, and live atlas replacements. Screenshots of Home, Events, Itinerary, Account, and the guest disclosure were visually inspected, including 320px with the largest readable text and comfortable spacing. Browser pages produced no uncaught JavaScript errors.
- Reproduce server checks with `python -m pytest tests/test_owner_navigation.py tests/test_accounts.py tests/test_static_assets.py -q` and `node --test tests/motion.test.cjs`. Run browser checks with `node --test tests/navigation.browser.cjs` using Playwright available to Node and Flask/pytest available to Python; optional `PYTHON` and `CHROMIUM_EXECUTABLE_PATH` select installed binaries. The browser harness starts its own temporary database/server and saves previews under ignored `test-results/navigation/`.

## Balanced atlas performance pass — November 25, 2026

- Baseline `9345fcc`, with the same expanded diagnostics and seeded trial-reset harness. The read-only baseline preview served the instrumented original renderer and its original optimization helpers through a separate local port; the existing application server/database were preserved. [Baseline instrumentation patch](docs/atlas-performance-pass2/baseline-instrumentation.patch) records the renderer instrumentation separately from optimization changes (zero-context format; apply with `git apply --unidiff-zero` on the baseline).
- Each case runs three fresh campaign instances, each with five seconds warm-up and twenty seconds sampling, at 1440 × 1000 and DPR 1 in the same in-app Chromium browser. Diagnostic seed: `20261125`. Each sample records start/end populations, scene-object counts, draw/triangle totals, instance uploads, and detailed CPU sections. Tests and CPU profilers were stopped during all timed browser runs. Existing variable timestep/capping remains, so live states can evolve differently despite matching seeds and fresh starts.
- Initial hidden-preview measurements were throttled to roughly one FPS; those and a mixed-visibility overview run were excluded and retained only in ignored `test-results/`. Valid comparisons used a visible preview. The first orbit comparison indicated a regression; a close paired baseline/optimized repeat was used to investigate, and both sets are retained in the raw record. Fullscreen was also checked with a close paired comparison. Its third control sample was interrupted before completion and restarted from a fresh scene; partial samples were not used.
- Dense spatial buckets preserve the original packed keys, insertion order, neighboring-cell order, and three collision passes, with overflow storage for out-of-range keys. Conservative passability bounds retain the original distance calculations near venue boundaries. Reusable movement outputs and cached flags do not change targeting, tie-breaking, collision resolution, random-number consumption, or update cadence. Dragon effects now upload active ranges only. Immutable faction colors and a lightweight YXZ pose replace redundant transform work for troop parts; projectile `lookAt` behavior remains unchanged.
- Explicit static bridge, dock and lair roots batch from **169 meshes to 51**, retaining **12,998 rendered triangles**, precise world bounds, material/shadow groups and animated exclusions. These roots freeze local matrices; transition and animated ancestors retain normal updates. The original venue/detail/seat-preview builders are not changed.
- **103 Python and 69 JavaScript tests passed.** Eight new checks cover indexed/overflow bucket reuse, 1,000 exact GPU Float32 transform comparisons, changed/reordered/shared poses, changing ancestors, seeded continuation/cleanup, fresh-trial reset requests, cancellation during asynchronous setup, and real architecture bounds/material/shadow/animation parity. Existing tests retain lifecycle, reduced-motion, retry, history, booking and security coverage.
- The expanded [simulation parity report](docs/atlas-performance-pass2/simulation-parity.json) matches all **2,073 allocated units** at **14 checkpoints** and **98 boundary cases** against `9345fcc`. It includes full unit/squad/target-reference state, structures, projectiles, effects, corpses, territory grids, cooldowns, team counts/power, spatial bucket order and RNG state; references use stable identifiers. Cases exercise coincident collisions, forced deaths/respawns, warning, all three waves, reign, heroes, rebuilding, peace, aftermath and return to idle. Numeric snapshots distinguish signed zero and non-finite values.

| Scenario | Median frame before / after | p95 before / after | Worst-trial p95 before / after | FPS before / after | Median-frame reduction |
| --- | --- | --- | --- | --- | --- |
| Overview | 37.2 / 30.8 ms | 62.6 / 57.3 ms | 64.2 / 58.9 ms | 24.63 / 29.56 | 17.2% |
| Orbit / zoom | 38.6 / 36.5 ms | 66.0 / 62.5 ms | 66.4 / 66.4 ms | 23.72 / 25.15 | 5.4% |
| Crowded invasion | 55.2 / 45.6 ms | 100.1 / 90.6 ms | 101.4 / 93.3 ms | 15.68 / 18.98 | 17.4% |
| Fullscreen orbit | 38.2 / 35.9 ms | 63.7 / 64.6 ms | 67.5 / 64.8 ms | 23.97 / 24.86 | 6.0% |

- **The additional 20% median-frame target was not met.** All four final case sets pass the 5% p95 tolerance using both median-of-trial and worst-trial p95. FPS is derived from the mean frame interval in each trial; it is not the reciprocal of the median interval. [Raw trials, source hashes and summary](docs/atlas-performance-pass2/measurements.json) retain start/end populations and every original/repeat set. The initial orbit set was 33.6 → 36.3 ms median with a p95 regression; its later control also slowed. The close paired repeat above showed a modest gain. The first optimized fullscreen set included an 83.6 ms p95 outlier; all three optimized trials were repeated, producing 64.8 / 64.2 / 64.6 ms p95. That earlier outlier remains recorded; its cause was not isolated and occasional timing variation remains a limitation.
- Overview collision CPU falls from 8.700 to 5.871 ms and unit transforms from 3.105 to 2.336 ms. Invasion targeting/movement falls from 14.299 to 11.225 ms, collision from 18.778 to 13.844 ms, and total simulation from 39.375 to 30.341 ms. Overview instance uploads fall from 432,707 to 417,491 bytes/frame, including removal of empty dragon-effect uploads. These are medians of per-trial CPU means, not GPU execution timings.
- Static visual comparisons use fresh initialized worlds and the existing reduced-motion preference to hold identical camera views; timed benchmarks use full motion. [Overview before](docs/atlas-performance-pass2/before-overview.jpg) / [after](docs/atlas-performance-pass2/after-overview.jpg), [close view before](docs/atlas-performance-pass2/before-close.jpg) / [after](docs/atlas-performance-pass2/after-close.jpg), and live [corruption before](docs/atlas-performance-pass2/before-corruption.jpg) / [after](docs/atlas-performance-pass2/after-corruption.jpg) retain architecture, troops, shadows, river effects and venue flags. Corruption captures are live frames rather than identical animation instants. Review was visual, not a pixel-diff proof. All four labels have [exactly matching DOM transforms and stacking](docs/atlas-performance-pass2/label-alignment.json) in the static comparison.
- Browser checks: initial normal Home had zero campaign canvases and no diagnostics; 3D loaded successfully, repeated toggles retained one campaign canvas, and explicitly resuming from 2D returned to active status. Back/Forward restored Royal Lists / Great Hall selection and URLs; some returns in this host started in 2D, so cache-preserved scene lifetime remains covered by automated tests rather than a claimed live cache hit. At 390 × 844, document width was 376px, keyboard venue selection worked, and labels updated after resize. [Mobile capture](docs/atlas-performance-pass2/after-mobile.jpg). Fullscreen used the CSS fallback in this browser; Escape cleared its pressed state and restored focus to its control. Reign and hero transitions worked. The Great Hall detail model rendered and its roof was switched off and back on after initialization. No console errors/warnings were observed in these checks. Retry/context-loss behavior is covered by automated tests; driver failure and physical mobile hardware were not injected/tested.
- Both accessibility motion preferences and the temporary viewport override were restored. The [final active preview](docs/atlas-performance-pass2/after-ui.jpg) has one campaign canvas and no diagnostics. Remaining dominant costs are army targeting/separation/terrain work and render submission: roughly 30.3 ms simulation plus 15.0 ms submission in invasion samples, and about 17.5 ms submission during camera movement. Geometry, troops, effects, antialiasing, DPR cap, lights, shadow resolution and shadow cadence remain unchanged. No workers, backend/API/database edits, dependency additions, push or deployment were introduced. Existing user preview files and the running local application server were preserved.

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
## Main integration — November 26, 2026

Merged main e93690e into the saved local feature state 028f216 in an isolated worktree. Resolved app imports, navigation/styles, theme ownership, hero artwork and atlas rendering/lifecycle conflicts. Kept database-backed roles and retired legacy password-only admin setup. The new hero retains sun/moon animation hooks; the single theme controller also respects the accessibility motion preference. Atlas night fixtures and theme observers now participate in main's centralized cleanup and motion subscriptions. The local Groundling capacity expansion command writes atomic tier audit entries and does not duplicate no-op entries.

Verification: 135 Python tests and 92 JavaScript tests passed, including updated upstream bridge tests, preserved account/role/security tests, actual arena geometry/scenery checks, lifecycle/performance checks, and added combined-feature/CLI-audit regressions. Modified runtime files passed syntax checks and Python compilation; git diff --check passed. Browser access to the isolated preview was declined, so no visual or live WebGL verification is claimed for this merge. The existing instance database is not replaced by the bundled demo snapshot or automatically expanded by this merge.

## All-venue seat tools — November 27, 2026

Extended numbered-seat view mapping and physical party segmentation to the Colosseum, King's Green and Great Hall. All 20 catalogue seat pages render both tools. Colosseum views map wedge/ring positions, archery views map all three gallery depths, banquet views map all 64 chairs and remove the roof. Parties stay within real segments or a single banquet table (up to eight); general admission explains that assigned/together seating is unavailable. Existing privacy, holds, budget, comparison and reservation behavior is unchanged.

136 Python tests and 98 JavaScript tests passed. Coverage includes full 20-event server rendering, all modeled venue/tier coordinates, unique seat positions, boundaries, physical grouping and existing booking/security regressions. Low-effort review found no concrete bugs. Browser/WebGL visual verification was not performed because browser permission was previously declined.

## Living venue crowds — November 27, 2026

- Added shared instanced miniature people to detailed showcases/modal viewers only. Seated spectators use existing modeled seat anchors. Visitors stay on authored paved pedestrian strips; performers use arena-specific positions/loops, with Great Hall servers in table-column aisles. Horse riders, swords, archery bows and a musician distinguish event activity.
- People On/Off persists locally and updates both open viewers; modal toolbar listeners are removed on disposal. Site and OS reduced-motion settings freeze people. Offscreen/hidden viewers and disabled crowds do not advance animation. Mobile populations halve spectator/visitor counts and rebuild when crossing the breakpoint. Existing lighting affects people; no added lights/shadow passes.
- Final verification: 138 Python tests and 106 JavaScript tests passed. Crowd tests cover all five models, desktop/mobile count budgets, chair-relative scale, distinct seat anchors, sampled paved paths, finite instance transforms, draw budget, motion/visibility pause, blocked storage, cleanup idempotence and archer alignment. Toolbar rendering/lifecycle checks cover each venue family. A low-effort review found an archer-lane mismatch; corrected to the model's ±6.6 shooting platforms, with regression coverage. No remaining important findings.
- Browser/WebGL visual and FPS verification was not performed because browser access was previously declined. No alternative browser or network workaround was attempted. No database or booking availability changes.

## Refined people and idle animation — November 27, 2026

Replaced block torsos/limbs with tapered tunics/armor and rounded two-segment limbs; added faces, hair/helmets, necks, hands, boots, belts, buckles and clothing trim. Shared instanced detail batches keep every venue at ten draws or fewer. Added staggered torso breathing/lean, head turning and arm gestures for stationary characters and paused visitors; banquet guests gesture or raise cups. Horse bodies now have rounded silhouettes, ears/muzzles/saddles and stop galloping when waiting. Bows grip the left hand and both string halves follow the drawing hand. Props use articulated hand endpoints.

Fresh verification: 138 Python tests and 109 JavaScript tests passed. New regression cases cover the shaped/articulated geometry, all stationary role animations without anchor drift, paused visitors, exact bow-grip attachment throughout motion, and the existing finite transforms/path/scale/density/reduced-motion/visibility/disposal budgets. Low-effort review found no remaining important issues after the bow alignment fix. Browser/WebGL visual verification remains unperformed following the prior origin denial; no visual quality or FPS result is claimed.

## Owner navigation — November 27, 2026

Owner header now contains four management links plus logout, without customer account/booking/house/itinerary links or the customer CTA. The brand opens the dashboard, active sections are marked, and default login lands on administration. Explicit next links and direct customer access remain intact. User, Staff, Admin and guest navigation is unchanged. Four regression tests cover menu contents, selected section, other-role menus and real password login/default versus explicit destinations. No role permissions or stored data were changed; existing uncommitted crowd work is preserved.

## Organizer dashboard hero and guidance — November 27, 2026

Moved Gatekeeper into a dedicated hero action group separated from the summary section by explicit spacing. Added a Start here guide, anchored event/ledger shortcuts, role-specific account guidance, metric definitions and inventory/ledger instructions. Kept all existing live-stat IDs and event/booking controls intact. Scoped dashboard CSS supplies desktop columns and narrow-screen stacking without changing other pages. Thirteen targeted dashboard, admin and Owner-navigation tests passed; new cases verify semantic separation, guide content, role copy, anchor targets and unique live control IDs. git diff --check passed. No new browser visual verification was attempted after the prior origin denial.
