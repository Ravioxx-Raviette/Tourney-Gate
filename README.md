# Tourney Gate

A local medieval event ticketing demo with an interactive festival atlas, accessible seat maps, server-enforced inventory, and simulated checkout.

Home opens with a framed SVG festival atlas, then scrolls naturally into event cards, the story section, and FAQ. Four illustrated landmarks connect through paths, terrain, banners, and a river. Selecting a venue reveals compact chronological event rows beside the map on desktop and below it on phones. Event links open conventional full detail pages. The landscape is imagined; details state actual venue locations.

Events retains its filterable card grid, and Event Detail retains its description, schedule, location, ticket tiers, and booking panel. All pages share the existing header, footer, typography, colors, and controls. Landmark selections use brief highlights and preview transitions; ordinary page navigation uses the existing gate transition. Reduced-motion preferences suppress decorative motion. No new bitmap images, animation libraries, or WebGL are used.

Share a Home venue with `/?venue=<id>#atlas`. Back/Forward restores selections without a map reload. `/events?venue=<id>` filters the catalogue and combines with `search`, `category`, `date`, and `price`; returning from a detail page restores that URL and its filters. Standard links and GET forms remain usable without JavaScript. Sold-out and cancelled events remain discoverable, with seat booking disabled. Home and Events use one five-second poll per page; Home updates both its cards and atlas preview from that response.

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

The five sample events run in February and March 2027. Battle of the Five Banners begins sold out, backed by a fictional group booking. Re-running `seed-demo` preserves existing events and orders. Use only fictional details for this demo.

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

Tests create isolated temporary databases, not the demo database. The original 28 booking/security tests cover concurrent inventory, confirmation, cancellation, expiry, failed edits, pricing, limits, waivers, privacy, CSRF, administration, and seed idempotence. Ten additional discovery cases cover the shared shell, Home-only atlas, direct details, venue grouping, sold-out and cancelled actions, combined server filters, empty results, unmapped venues, invalid input, and an empty realm.

Browser QA covers keyboard and mouse seat selection, checkout, ticket rendering, lookup/cancellation, organizer inventory and editor, and desktop/mobile layouts. See `QA.md` for the recorded checks.

## Configuration and limits

| Environment setting | Default |
| --- | --- |
| `PORT` | `5055` |
| `TOURNEY_CURRENCY` | `PHP` — change this single setting for another ISO currency; amounts are not converted |
| `TOURNEY_SECRET_KEY` | Random local secret persisted in `instance/session-key` |
| `TOURNEY_ADMIN_HASH` | Optional externally configured Werkzeug password hash |
| `TOURNEY_HTTPS` | `0`; set to `1` only when served through HTTPS, enabling Secure cookies |

Dates are stored in UTC and displayed in Asia/Manila. The Flask server binds only to the local computer. This is an assignment demo, not a public production service. Payment, accounts, email sending, QR codes, waitlists, and public hosting are intentionally absent. The organizer login has a per-session attempt cooldown; public production use would require shared rate limits, HTTPS, deployment hardening, and a production WSGI server.

## Artwork and fonts

The atlas and its four landmarks are original SVG/CSS, based on the existing venue sketches. The earlier `static/images/joust-hero.png` remains in the repository but is not used by atlas discovery routes; its provenance remains in `ASSETS.md`. Local Cinzel, Cormorant Garamond, and Manrope fonts are distributed under the SIL Open Font License; the license files are included beside the fonts.

