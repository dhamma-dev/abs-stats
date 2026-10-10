# Shelf Stats

A deep-dive stats dashboard and a Wrapped-style year in review for your [Audiobookshelf](https://www.audiobookshelf.org/) server. It's built for a household: everyone signs in with their own ABS account and sees their own listening, and there's a Family page that compares everyone.

**What's in it**

- **Overview**: hours listened, books finished, listening days, streaks, speed and time saved, month-by-month totals, a calendar of every day you listened, records, and milestones.
- **Habits**: a 24-hour listening clock, an hour × weekday heatmap, session lengths, day-of-week patterns, and devices.
- **Taste**: top authors, narrators, series, and genres; publication decades; the book lengths you choose; books you started but left behind.
- **Books**: a timeline of when you listened to each book, a wall of finished books (sort by fastest, most binged, or longest), and a table of every book you played.
- **Family**: household totals, a leaderboard with awards, monthly listening per person, "taste twins" (how alike two people's listening is), shared books, and picks from what the rest of the family has finished.
- **Wrapped**: an animated, tap-through story of your year that ends in a summary card you can save as an image.

## How it works

- **Read-only.** Every `SNAPSHOT_MINUTES`, the app copies `absdatabase.sqlite` into its own data folder using SQLite's online backup, and every query runs against that copy. ABS is never written to and never kept waiting.
- **Login goes through ABS.** The username and password go to your ABS server's `/login`. The app never sees or stores password hashes. It just keeps a signed session cookie that says who you are. Admins can switch between users; everyone else sees only themselves (plus the Family page, if `FAMILY_VISIBLE=true`).
- **Covers** come from ABS's cover endpoint, using an optional API key. Without one, the app draws typographic covers.
- **Speed** is measured, not taken from a setting: for each session it compares how far you moved through the book with how long you actually listened.

## Run it next to Audiobookshelf (Docker)

1. Copy `docker-compose.example.yml` into your compose setup. Point the `/abs-config` volume at the **same host folder** your audiobookshelf container mounts as `/config`.
2. Set `ABS_URL` to an address this container can use to reach ABS (on the same compose network, `http://audiobookshelf:80` works).
3. Optional: in ABS go to Settings → API Keys, create a key, and set `ABS_API_KEY` to get real covers.
4. Set `TZ` to the same timezone as your ABS container, so "7am" means 7am for you.
5. `docker compose up -d shelf-stats`, then open `http://<server>:8787`.

Images are built by GitHub Actions for `linux/amd64` and `linux/arm64` and published to `ghcr.io/dhamma-dev/abs-stats`. `:latest` tracks `main`, and pushing a tag like `v1.2.0` also publishes `:1.2.0` and `:1.2`. To build it yourself instead, replace `image:` with `build: .` in the compose file.

## Develop locally

```bash
npm install
```

```bash
npm run seed:demo
```

```bash
cp .env.example .env
```

In `.env`, set `ABS_DB_PATH=./data/demo-absdatabase.sqlite` and `AUTH_MODE=demo`. Then:

```bash
npm run dev
```

Open http://localhost:5173. The demo database is a fake family of four with about three years of listening. In demo mode you pick a user and there's no password.

To use your real data on your laptop instead, copy `absdatabase.sqlite` off the server (any copy works, since the app only reads it), point `ABS_DB_PATH` at it, and use `AUTH_MODE=abs` with `ABS_URL` pointing at your server.

## Configuration

| Variable | Default | |
|---|---|---|
| `ABS_DB_PATH` | `/abs-config/absdatabase.sqlite` (Docker) | Path to ABS's database |
| `ABS_URL` | — | ABS base URL, used for login and covers |
| `ABS_API_KEY` | — | Optional, for cover art |
| `AUTH_MODE` | `abs` | `abs` or `demo` |
| `FAMILY_VISIBLE` | `true` | Whether non-admins can see the Family page |
| `TZ` | system | Timezone used to bucket listening by day and hour |
| `SNAPSHOT_MINUTES` | `10` | How often to refresh the snapshot |
| `DATA_DIR` | `/data` (Docker) | Where the snapshot and session secret live |
| `SESSION_SECRET` | auto-generated | Override the cookie signing secret |
| `PORT` | `8787` | |

## Notes

- If your ABS `/config` folder lives on a network share (NFS/SMB), SQLite locking can be unreliable. Mounting a local copy is safer.
- Listening time is split across the actual hours a session ran, so a 2-hour session that starts at 11pm counts toward both days.
- A year still in progress is compared with the same dates last year, not with the whole of last year.
