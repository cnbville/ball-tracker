# Gridiron Live

A Mac app for live college football and NFL: a "What's on" TV guide in Berlin time, and a live game screen with a 3D field that draws each play, a win-probability game flow, drive-by-drive play-by-play and a box score. Touchdowns flash in the game pane and send a Mac notification. The menu bar shows the score of the game you have open (or of a team you follow).

Data comes from ESPN's public scoreboard and summary feeds (unofficial, roughly 15 to 30 seconds behind TV). The Rust side makes the requests, so the app needs no API key.

## Get the .dmg

Every push to `main` builds the app on GitHub: open the repository's Actions tab, pick the latest "Build Mac app" run and download **Gridiron-Live-dmg** under Artifacts. It works on Apple silicon and Intel Macs.

## Build it yourself

You need, once:

1. Xcode command line tools: `xcode-select --install`
2. Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
3. Node.js 18 or newer (for example `brew install node`)

Then, in this folder:

```sh
npm install
npm run build
```

The disk image lands in `src-tauri/target/release/bundle/dmg/Gridiron Live_0.1.0_aarch64.dmg` (on an Intel Mac the name ends in `x64`). The first build takes a few minutes while Rust compiles.

The app isn't signed with an Apple developer certificate, so the first time you open it, right-click the app and choose Open, then confirm.

To run it without packaging, use `npm run dev`.

## How it's laid out

- `src/` is the interface (plain HTML, CSS and JavaScript modules, no build step).
  - `js/app.js` shell, sidebar, routing and polling (scoreboards every 30 s while games are live, the open game every 10 s).
  - `js/schedule.js` the "What's on" guide, one row per US network, in Berlin time.
  - `js/game.js` the live game screen; `js/field.js` draws the field and each play.
  - `js/alerts.js` touchdown notifications, follows, kickoff reminders and the menu bar score.
  - `js/api.js` turns ESPN's feeds into what the screens use.
  - `css/showtime.css` is the Showtime design system; `css/app.css` is the app layout.
- `src-tauri/` is the Tauri (Rust) side: the ESPN request command, the menu bar item and notifications.
- `tests/` has ESPN-shaped sample data (`npm run fixtures`) and a Playwright script that drives the screens with it and saves screenshots (`npm run test:ui`).

## Notes

- All times are Europe/Berlin. Game days are grouped by the US date, and the guide warns about the weeks when Europe and the US change clocks on different dates.
- Team logos load from ESPN's image CDN; if one can't load, a team-color badge stands in.
- Follows, reminders and the league filter are stored on your Mac only.
