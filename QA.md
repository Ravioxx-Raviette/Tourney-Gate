# Verification record

Verified locally on November 20, 2026 (Asia/Manila).

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

- `python -m pytest -q`: **38 passed** (the original 28 plus 10 atlas cases).
- `node --check` passed for the changed `atlas.js`, `app.js`, and `motion.js`. The earlier booking/admin checks remain recorded below.
- PowerShell AST parsing of `start.ps1` reported no syntax errors.
- Public page smoke checks returned HTTP 200 for Home, Events, Event Detail, Seat Selection, Participant Registration, My Bookings, and Organizer Login. Checkout, Ticket, and the protected Admin page were verified during the browser journey.

The booking tests use isolated temporary SQLite databases. Concurrent tests use independent clients/connections competing at a barrier. They verify that only one client obtains the last seat or last counted ticket and that repeated concurrent confirmation only subtracts once.

## Browser checks

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

