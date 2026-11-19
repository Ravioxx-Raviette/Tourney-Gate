# Tourney Gate database

This folder contains the actual project database snapshot, alongside a readable SQL export of the same data.

- `tourney-gate.sqlite`: ready-to-use SQLite database.
- `tourney-gate.sql`: schema and data export, produced from the consistent SQLite snapshot.
- The root `schema.sql` and `seed.py` also recreate the original demonstration database.

The snapshot includes four venues, five fictional events, twelve ticket tiers, 784 numbered seats, and the fictional group booking that demonstrates a sold-out event. The settings table is empty; no organizer password or session secret is included. Prices are integer centavos, and date fields are UTC Unix timestamps.

## Restore the SQLite snapshot

For a fresh clone, after installing the project dependencies and before running the server, execute this from the project root:

```powershell
.\.venv\Scripts\python.exe -c "from pathlib import Path; import shutil; Path('instance').mkdir(exist_ok=True); shutil.copy2('database/tourney-gate.sqlite', 'instance/tourney.sqlite')"
.\.venv\Scripts\python.exe -m flask --app app set-admin
.\.venv\Scripts\python.exe app.py
```

The copy command replaces the local working database if one already exists. Stop the server and preserve any local bookings you want to keep before replacing an existing database.

## Restore the SQL export instead

For a fresh clone without an existing `instance/tourney.sqlite`:

```powershell
.\.venv\Scripts\python.exe -c "from pathlib import Path; import sqlite3; Path('instance').mkdir(exist_ok=True); db=sqlite3.connect('instance/tourney.sqlite'); db.executescript(Path('database/tourney-gate.sql').read_text(encoding='utf-8')); db.close()"
```

The application generates its own local session secret on first launch. Configure an organizer password with `flask --app app set-admin` when you need the organizer dashboard.

The committed snapshot is a point-in-time copy. Subsequent local bookings change `instance/tourney.sqlite`; they do not modify the committed snapshot automatically.
