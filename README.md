# Tourney Gate

A local medieval event ticketing demo with an interactive festival atlas, interactive 3D venue previews, accessible seat maps, server-enforced inventory, and simulated checkout.

Home retains the detailed UI_Ver-03 faire hero and opens the festival atlas in illustrated 2D, followed by the upcoming schedule, story, Rules of the Realm, and FAQ. Four illustrated landmarks connect through paths, terrain, banners, and a river. Selecting a venue reveals compact chronological event rows beside the map on desktop and below it on phones. Event links open conventional full detail pages. The landscape is imagined; details state actual venue locations.

Events retains its filterable card grid, and Event Detail retains its description, schedule, location, ticket tiers, and booking panel. All pages share the existing header, footer, typography, colors, and controls. Landmark selections use brief highlights and preview transitions; ordinary page navigation uses the existing gate transition. Reduced-motion preferences suppress decorative motion. The UI uses the navy-and-gold Lapis Night Faire theme. Local Three.js and OrbitControls power five 3D venue variants with camera presets, orbit/pan/zoom, guides, section highlights, auto-rotation, and an expanded viewer. Booking continues to use the accessible 2D seat maps. Home also retains the expandable upcoming schedule and Grand Melee filter.

Share a Home venue with `/?venue=<id>#atlas`. Back/Forward restores selections without a map reload. `/events?venue=<id>` filters the catalogue and combines with `search`, `category`, `date`, and `price`; returning from a detail page restores that URL and its filters. Standard links and GET forms remain usable without JavaScript. Sold-out and cancelled events remain discoverable, with seat booking disabled. Home and Events use one five-second poll per page; Home updates both its cards and atlas preview from that response.

The illuminated atlas uses original storybook miniatures: timber grandstands and a royal pavilion, a layered stone Colosseum, an archery pavilion with three targets, and a gabled Great Hall. Curated tent clusters, courtyards, mixed woodland, gardens, riverbanks, and a stone bridge connect the venues. Fine drawing details simplify below 620px, and secondary props simplify below 380px. Venue positions, labels, routes, manual zoom, selection, and live availability retain their existing behavior.

The shared page transition uses the existing TG crest between lapis-and-gold gates: a 160ms close and 320ms opening, with a 220ms content settle. Rapid repeated navigation commits once. Escape, interrupted arrivals, stopped loads, blocked storage, and unavailable animations have cleanup paths. Reduced motion bypasses the gates. Same-page anchors, atlas selections, downloads, modified clicks, and external links retain native behavior.

## Consolidated campaign atlas

This version combines UI_Ver-03 (`b39a9b0`) with Ver_03_03 (`079a403`). The detailed faire hero, accessibility and armory panel, custom cursors, Rules section, participant details, and expanded Groundling capacity are retained. The application remains Flask/Jinja, vanilla JavaScript, and SQLite.

Choose **Explore in 3D** to download and initialize the campaign. Initial 2D browsing creates no campaign canvas. Repeated switches reuse one scene. The illustrated and 3D maps share venue selection, URL history, and the existing five-second availability feed. Campaign factions do not change event availability, reservations, or bookings.

The full incoming simulation is available: faction armies, territory control, naval battles, dragon, builders, undead invasion, Skarbrand, four Radiant Heroes, rebuilding, and peace. **Undead Invasion** starts a demonstration; the banner's skip button advances phases without waiting through their timers. These are client-side fictional scenes. A full page reload resets the campaign; switching to 2D pauses and retains it.

Use **Fullscreen**, drag to orbit, and scroll to zoom. In fullscreen, WASD moves the camera and Q/E rotates it; Shift boosts movement. T toggles territory, U starts/advances the invasion, N skips a phase, and H hides the fullscreen interface. Shortcuts require map focus or fullscreen and do not intercept typing fields or modified shortcuts. Escape exits fullscreen. On phones, controls sit below the scene to leave the map clear.

The campaign pauses in 2D, off-screen, or while the page is hidden. History-cache restoration resumes the same scene; ordinary full navigation starts fresh in 2D while retaining the venue in the URL. Both OS reduced motion and the accessibility panel's Reduce motion switch freeze the simulation and decorative animation, with direct manual exploration still available. WebGL failure or context loss returns to 2D with an explicit retry. Camera and simulation clocks exclude paused time.

The Great Hall's inline and expanded venue viewers include **Roof: On/Off** alongside existing lighting, stories, and optional ambience. Shared venue modules have one canonical URL and idempotent startup, avoiding duplicate renderers.

Campaign and existing JavaScript regressions (no additional Node packages required):

```powershell
node --test tests/atlas-runtime.test.mjs tests/motion.test.cjs tests/seat-layout.test.mjs tests/party-seats.test.mjs tests/living-venues.test.mjs
```

## Campaign rendering performance

Campaign venue copies batch compatible static opaque geometry; animated flags, embers, transparent pieces, controlled roofs, and unsupported geometry stay separate. The four labels render in a small independent scene when camera, viewport, selection, or event content changes. Instance buffers, including naval and dragon effects, use dynamic usage, active matrix ranges, and changed colors. Spatial buckets use reusable indexed storage with an overflow fallback. Movement helpers reuse caller-owned outputs, and conservative bounds reject unnecessary venue-distance calculations. Troop parts use an exact Float32-compatible YXZ transform path and cached faction colors; projectiles keep their original `lookAt` path. Detail-page and seat-preview models retain their original builders and behavior.

No quality settings were lowered: pixel-ratio cap, antialiasing, geometry, troop populations, lights, effects, shadow resolution and every-second-frame shadow updates are retained. All 88,066 visible venue triangles remain; venue meshes fall from 2,672 to 429.

Open `http://127.0.0.1:5055/?atlasPerf=1#atlas`, choose **Explore in 3D**, select a diagnostic scenario, then **Measure 3 × 20 seconds**. Each trial reloads a fresh campaign with the same diagnostic seed, waits five seconds, then measures twenty seconds. The page resumes measurement automatically after each reload; **Stop measurement** clears that continuation. Keep the preview visible and avoid other tests/profilers while measuring: hidden in-app previews can throttle to one FPS. Orbit/zoom follows the same timed camera path on each run. Crowded invasion advances to wave 3. Benchmark fullscreen uses the CSS path consistently across automatic reloads; ordinary fullscreen retains its native/CSS behavior. The flag survives venue selection; ordinary browsing creates no diagnostic panel or WebGL timing hook.

The panel records FPS, median/p95 frame intervals, CPU sections for targeting/movement, collision, projectiles, unit transforms, territory/corruption, countryside/naval updates, dragon updates, rendering and labels. Reports include draw calls, triangles, actual `bufferSubData` bytes (instance buffers and total traffic separately), viewport, DPR, seed, and start/end populations and scene counts. CPU submission times are not GPU execution times. The older first-pass trials below predate the separate instance counter and report total buffer traffic.

### Second pass — November 25, 2026

Compared with `9345fcc` using fresh campaigns in the same visible browser at 1440 × 1000, DPR 1. Values are medians of three trial summaries; movement/fullscreen use paired repeats:

| Scenario | Frame time before → after | Reduction | p95 before → after | FPS before → after |
| --- | --- | --- | --- | --- |
| Overview | 37.2 → 30.8 ms | 17.2% | 62.6 → 57.3 ms | 24.63 → 29.56 |
| Orbit / zoom | 38.6 → 36.5 ms | 5.4% | 66.0 → 62.5 ms | 23.72 → 25.15 |
| Crowded invasion | 55.2 → 45.6 ms | 17.4% | 100.1 → 90.6 ms | 15.68 → 18.98 |
| Fullscreen orbit | 38.2 → 35.9 ms | 6.0% | 63.7 → 64.6 ms | 23.97 → 24.86 |

The additional 20% median-frame target was **not reached**. Final comparisons pass the 5% p95 tolerance, checking both median-of-trial and worst-trial p95. Earlier movement/fullscreen runs varied, including one 83.6 ms fullscreen p95; original and repeat sets remain in the [raw record](docs/atlas-performance-pass2/measurements.json). These are local observations, not an FPS guarantee. FPS uses each trial's mean interval, so it is not the reciprocal of the median frame-time column. See [matching-camera captures](docs/atlas-performance-pass2/after-overview.jpg) and [QA](QA.md) for validation and remaining costs.

### Earlier measurements — November 24, 2026

First-pass measurements in the same in-app Chromium session at 1440 × 1000, DPR 1; values are medians of three trial summaries:

| Scenario | Frame time before → after | Reduction | p95 before → after | FPS before → after |
| --- | --- | --- | --- | --- |
| Overview | 71.0 → 39.5 ms | 44.4% | 103.7 → 64.6 ms | 13.43 → 23.91 |
| Orbit / zoom | 76.9 → 45.4 ms | 41.0% | 104.6 → 60.8 ms | 12.73 → 21.27 |
| Crowded invasion | 91.9 → 59.1 ms | 35.7% | 130.7 → 86.1 ms | 10.31 → 16.51 |
| Fullscreen orbit | 78.6 → 44.4 ms | 43.5% | 100.8 → 57.6 ms | 12.56 → 21.89 |

These are observed results on this computer. Campaign phases and camera paths match, but live battles evolve between trials; surviving populations differ, especially in fullscreen after invasion. They are not identical-frame replays or hardware-independent FPS guarantees. A separate fixed-step check produced identical baseline/optimized states for all 2,073 allocated units in ordinary and invasion phases. Remaining costs include army targeting/collision simulation and detailed terrain, effects, and dynamic shadow rendering.

See [QA](QA.md), [first-pass trials](docs/atlas-performance/measurements.json), and [second-pass trials](docs/atlas-performance-pass2/measurements.json). The second pass also batches explicitly static bridge, dock and dragon-lair architecture: 169 meshes become 51, with all 12,998 rendered triangles retained. Animated descendants and changing transition ancestors stay active. Run the complete 69-test JavaScript suite, including 22 performance regressions:

```powershell
node --test tests/atlas-runtime.test.mjs tests/atlas-optimize.test.mjs tests/atlas-pass2.test.mjs tests/motion.test.cjs tests/seat-layout.test.mjs tests/party-seats.test.mjs tests/living-venues.test.mjs
node scripts/check_atlas_simulation.mjs 9345fcc
node scripts/summarize_atlas_benchmarks.mjs
```

## Run on Windows

The workspace already has its Python environment and a seeded database. From this folder:

```powershell
.\.venv\Scripts\python.exe app.py
```

Open **http://127.0.0.1:5055**. Leave the terminal running; press Ctrl+C to stop. No internet connection is needed once dependencies are installed: all fonts and artwork are local.

For a fresh checkout, install Python 3.11 or newer and run:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m flask --app app init-db
.\.venv\Scripts\python.exe -m flask --app app seed-demo
.\.venv\Scripts\python.exe app.py
```

If an existing virtual environment points to an uninstalled Python, run `python -m venv --upgrade .venv` using a working Python installation, then reinstall the requirements. This repairs the environment without resetting the database.

Alternatively, `./start.ps1` creates the environment if needed, installs missing runtime dependencies, seeds demo events, and runs the app. `./start.ps1 -SetAdminPassword` also prompts for an organizer password. Set `TOURNEY_PYTHON` to a full Python executable path when Python is not on PATH.

## Included database

The repository includes a consistent SQLite snapshot at `database/tourney-gate.sqlite` and a readable SQL export at `database/tourney-gate.sql`, containing the five fictional events, ticket tiers, numbered seats, and seeded sold-out booking. See [database restore instructions](database/README.md) to use the snapshot in a fresh clone. The live local database, session secret, and organizer credentials stay in the ignored `instance/` folder.

The original [project brief](docs/Tourney%20Gate%20Project%20Brief.docx) is included for reference.

## Organizer access

There is no shared default password. Configure your own (at least 10 characters):

```powershell
.\.venv\Scripts\python.exe -m flask --app app set-admin
```

Then visit `/admin`. The password is stored as a Werkzeug scrypt hash, never as plain text. The dashboard can create/edit/cancel events, add/edit tiers, adjust capacity and prices, and inspect bookings and participant details. An event with no ticket tiers does not accept bookings; add a tier to open it. Venue selection uses four seeded venues. A ticket tier’s kind stays fixed after creation; create another tier to use a different kind.

## Guest journey

1. Discover an event, then choose spectator seats or enter as a participant.
2. Choose labeled seats, use the keyboard-friendly seat list, or select a counted ticket quantity. Spectator orders allow up to eight tickets across all tiers. Participant registration reserves one slot and requires the demo waiver.
3. Continue to checkout to start a ten-minute reservation. Other visitors cannot reserve those tickets. An edited reservation retains its original expiry; an unsuccessful edit preserves the previous selection.
4. Enter fictional buyer details and confirm the simulated payment. No card information is collected or money transferred.
5. Save the `TG-XXXXXX` reference and print the ticket. Use email plus reference under My Bookings to retrieve or cancel it. Cancellation closes 24 hours before the start.

Fresh seeding creates 20 sample events across five categories, from February through June 2027. The bundled database snapshot is the older five-event dataset and includes a sold-out Five Banners group booking; fresh seeding does not create that sold-out booking. Re-running `seed-demo` preserves existing events and orders. Use only fictional details for this demo.

## The Herald’s Gatekeeper

Confirmed tickets include a private, printable QR entry pass. Older confirmed bookings receive one automatically when their ticket is opened. Each pass covers the **entire booking once**; all members of the group should arrive together. The printed booking reference is the fallback when scanning is unavailable.

Sign in at `/admin`, then choose **Open the Herald’s Gatekeeper**. Select the event, scan a pass or type its reference, and choose **Review pass**. Check the guest count and seats before pressing **Confirm group check-in**. Review alone never admits anyone. Duplicate admission, wrong-event passes, unconfirmed/cancelled/expired bookings, and cancelled or ended events are blocked. Checked-in bookings cannot be cancelled by guests. Local demo mode allows admission to future events for testing.

Camera scanning requires a supported browser with native QR detection and a secure context (localhost or HTTPS). If unavailable, use manual reference entry or a USB scanner that types the QR payload into the input. Camera access begins only after choosing **Scan with camera** and granting permission. The camera stops after a scan, on navigation, or when the page is hidden. No camera images are uploaded or stored.

The `qrcode` runtime dependency generates SVG passes locally. `start.ps1` installs it if missing. An additive `gate_passes` table upgrades existing local databases automatically. Admission uses the same serialized transactions as inventory, so simultaneous check-ins admit a booking only once. Passes are protected by the existing ticket authorization; keep printed passes private.

## Build My Festival Day

Use **Add to my day** on an event card or detail page, or open **Plan my day** in the header/mobile menu. The planner stores up to 20 unique event IDs in the current browser session for up to eight hours. Events are grouped by Philippine date and ordered by start time. Remove events, clear the plan, follow event links to book separately, or print the schedule.

Time warnings compare actual stored start/end times, including overlapping events nested within longer events. Suggested breaks are 15 minutes at the same venue and 30 minutes between venues; they are planning estimates, not calculated travel times. Listed ticket totals are starting-price estimates for one spectator per event. Cancelled or ended saved events remain visible; deleted records are reported and can be cleared. Refresh the planner for current schedules, prices, and availability.

The planner works through CSRF-protected forms without JavaScript. Adding or removing an event never creates, changes, or cancels a booking or reservation.

## Living festival venues

On an event detail page or expanded 3D viewer, scroll below the model to the **Daylight / Torchlight** controls. Each of the five venue models has three story landmarks, accessible through buttons or by clicking the corresponding visible model geometry. Landmark buttons also move the camera to that location. These are fictional stories and illustrative lighting, not live performances or actual event conditions.

**Ambient sound** starts off and requires a click. It uses locally synthesized atmosphere, with a volume control; no external audio files or services are needed. Only one viewer plays at once. Sound stops when another viewer opens, the page is hidden, the viewer closes, or navigation occurs. Motion respects reduced-motion settings. Booking seat previews retain their existing lighting and controls.

## Create Your House

Open **Create Your House** in the navigation or home page. Choose a name (2–40 characters), optional motto (up to 80), one of four original crests (stag, raven, sun, tower), and one of four coordinated palettes. The editor previews your banner as you type. Save to carry it through the site header and festival atlas. It is an optional browser-session profile, remembered for up to eight hours; no account is required.

Checkout lets you include or omit the current house. Confirmed tickets store a snapshot of that heraldry, including on printed tickets and authorized booking lookup. Editing or clearing the browser profile never rewrites older tickets. If the house changes in another tab while checkout is open, refresh checkout to review the new banner before confirming.

An additive `booking_houses` table is initialized automatically on connection for existing local databases. It preserves all existing events, inventory, bookings, and credentials; the older bundled snapshot needs no manual replacement.

## Seat Our Party — Royal Lists

Above the Royal Lists seat map, enter a party size (1–8) and optional total budget, then choose **Find seats together**. Search uses the current tier, one row, and one uninterrupted seating wing. Noble and Commoner wings have five seats each; Royal Box rows have ten. Suggestions favor front rows and central positions. No split-row or across-aisle groups are advertised as together.

Review the seats and total, or choose **Preview group in 3D** for gold seat markers. **Use these seats** replaces the entire current selection; it does not create a hold. Continue to checkout to reserve. Changed availability, tier, budget, or prices invalidate the suggestion. Editing an existing reservation uses current prices at checkout.

## See My View — Royal Lists

On a Royal Lists jousting or grand melee seat-selection page, choose a numbered seat, then click **See My View** in the order summary. Preview the approximate seated view, look left/right, reset, or open the stadium overview with a gold seat marker. Choose **Compare another seat** to switch between Seat A and Seat B at the same field of view. Comparison does not select tickets or start a hold; use the original seat map to change your order.

The standard Royal Box (20), Noble Stand (80), and Commoner’s Bench (200) seats share coordinates with the 3D stadium. Other venues, custom tier names, and added rows outside those modeled layouts do not have seat-level previews. Available seats and the visitor’s own unexpired held seats can be compared. Views are illustrative and do not guarantee actual sightlines. If 3D cannot load, return to the map to continue booking.

Seat-layout and camera regressions: `node --test tests/seat-layout.test.mjs`.

## How inventory works

`remaining` counts unsold tickets, including active holds. **Bookable availability = remaining − active reservations.** Confirmation subtracts purchased quantities exactly once. A pending reservation never subtracts from `remaining`; expiry or release makes its tickets bookable again. Cancellation restores confirmed quantities exactly once.

All reservation, confirmation, expiry, capacity, and cancellation changes use short SQLite `BEGIN IMMEDIATE` transactions. Confirmation also uses conditional decrements with `remaining >= quantity`. Numbered seats change from available to held to booked within those transactions. Constraints stop negative inventory. Capacity cannot fall below confirmed sales plus reservations. Removed seat positions are retired, preserving historical references.

Availability reads and writes clear expired holds using server UTC time. Public pages refresh counts every five seconds while visible. Fully held inventory shows temporary unavailability; sold-out status requires zero unsold inventory. Event cancellation cancels pending and confirmed bookings. Prices are copied onto booking items at reservation and retained on confirmation; editing a reservation recalculates its selection using current prices, shown at checkout.

## Architecture and API

- Flask/Jinja templates, modular CSS, and vanilla JavaScript; no front-end build required. `atlas.html`, `atlas.css`, and `atlas.js` implement the Home feature; the shared Home controller supplies availability updates. The atlas does not replace the site shell or booking styles and handlers.
- SQLite data and session secret live in ignored `instance/`; foreign keys and WAL mode are enabled.
- `db.py` owns connections and inventory transactions; `inventory.py` owns booking rules; `app.py` owns routes and validation; `seed.py` initializes fictional events.
- JSON mutation endpoints require the `X-CSRF-Token` from the page’s `csrf-token` meta tag plus its same-origin session cookie. HTML forms use a hidden CSRF token. Booking pages require the originating browser or a successful email/reference lookup.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/events` | Listings and per-tier availability |
| `GET /api/events/<id>/availability` | Event, inventory, and numbered seat state |
| `POST /api/events/<id>/reservations` | Create a hold with `items` and optional participant details |
| `GET/PUT/DELETE /api/reservations/<id>` | Read, edit, or release your reservation |
| `POST /api/reservations/<id>/confirm` | Validate buyer details and simulated payment, then confirm |
| `POST /api/bookings/lookup` | Authorize access using `email` and `reference` |
| `POST /api/bookings/<id>/cancel` | Cancel an authorized booking |
| `GET /api/admin/overview` | Protected inventory, purchase-price revenue, and recent bookings |
| `POST /api/admin/gate/inspect` | Review an event’s QR pass or reference without admission |
| `POST /api/admin/gate/check-in` | Atomically admit the entire booking once |
| `POST /api/admin/events` | Create an event |
| `PUT /api/admin/events/<id>` | Edit an event |
| `POST /api/admin/events/<id>/cancel` | Cancel an event and its bookings |
| `POST /api/admin/events/<id>/tiers` | Add a ticket tier |
| `PUT /api/admin/tiers/<id>` | Edit tier pricing, perks, limits, and capacity |

Reservation input examples:

```json
{"kind":"spectator","items":[{"tier_id":1,"seat_ids":[1,2]}]}
```

```json
{"kind":"spectator","items":[{"tier_id":7,"quantity":2}]}
```

Confirmation expects `name`, `email`, `phone`, and `simulated_payment: true`. Server prices use integer centavos; tier admin prices use decimal peso strings. Errors return `{ "error": "Plain-language message" }` with a relevant HTTP status. A reservation response includes server time, expiry, items, totals, and event state.

## Tests

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
```

The transition controller also has dependency-free Node tests:

```powershell
node --test tests/motion.test.cjs
```

These 15 checks exercise navigation deduplication, cancellation, history restoration, stopped loads, fallbacks, native-link bypasses, and reduced-motion changes using controlled animation completion and time.

Tests create isolated temporary databases, not the demo database. Legacy booking and atlas cases use copies of the bundled five-event snapshot; merge integration cases independently seed the current 20-event catalogue. The original 28 booking/security tests cover concurrent inventory, confirmation, cancellation, expiry, failed edits, pricing, limits, waivers, privacy, CSRF, administration, and seed idempotence. Additional discovery and merge cases cover the shared shell, Home-only atlas, direct details, venue grouping, sold-out and cancelled actions, combined server filters, empty results, unmapped venues, invalid input, and an empty realm.

Browser QA covers keyboard and mouse seat selection, checkout, ticket rendering, lookup/cancellation, organizer inventory and editor, and desktop/mobile layouts. See `QA.md` for the recorded checks.

## Configuration and limits

| Environment setting | Default |
| --- | --- |
| `PORT` | `5055` |
| `TOURNEY_CURRENCY` | `PHP` — change this single setting for another ISO currency; amounts are not converted |
| `TOURNEY_SECRET_KEY` | Random local secret persisted in `instance/session-key` |
| `TOURNEY_ADMIN_HASH` | Optional externally configured Werkzeug password hash |
| `TOURNEY_HTTPS` | `0`; set to `1` only when served through HTTPS, enabling Secure cookies |

Dates are stored in UTC and displayed in Asia/Manila. The Flask server binds only to the local computer. This is an assignment demo, not a public production service. Payment, accounts, email sending, waitlists, and public hosting are intentionally absent. The organizer login has a per-session attempt cooldown; public production use would require shared rate limits, HTTPS, deployment hardening, and a production WSGI server.

## Atlas artwork review

The standalone illustration studies in `docs/atlas-artwork/` are exported from the same Jinja SVG source used by Home. They are artwork studies, not browser screenshots or live availability displays:

- `atlas.svg` and `atlas.png`: complete illustrated landscape.
- `landmarks.svg` and `landmarks.png`: four detailed venue studies.
- `atlas-390.svg` / `.png` and `atlas-320.svg` / `.png`: simplified phone-sized artwork studies.

Regenerate the SVGs without starting Flask or changing the database:

```powershell
.\.venv\Scripts\python.exe scripts/export_atlas.py
```

The exporter validates XML, duplicate SVG IDs, and internal references. PNG review copies were rendered with the bundled Sharp library; the website does not load them or require that library.

## Artwork and fonts

The atlas and its four landmarks are original SVG/CSS, based on the existing venue sketches. The earlier `static/images/joust-hero.png` remains in the repository but is not used by atlas discovery routes; its provenance remains in `ASSETS.md`. Local Cinzel, Cormorant Garamond, and Manrope fonts are distributed under the SIL Open Font License; the license files are included beside the fonts.

