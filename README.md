# ThumpCut

Turns a mix of photos and video clips into a short reel where every cut lands on the beat — and
where the cutting speeds up and slows down as the music does. Pick a style, pick your media,
export, share to Instagram, and pick the track there.

No accounts. No analytics. No ads. No watermark. No music hosted or licensed.

---

## What is here

| Folder | What it is |
|---|---|
| `factory/` | Python. Works out where the beats are in a song. Runs on a computer, never on a phone. |
| `packages/cut-engine/` | The part that decides when the picture changes. Pure TypeScript, no dependencies. |
| `packages/design-tokens/` | Every colour, size and spacing in the app, in one file. |
| `app/` | The phone app itself. |
| `tools/ui-verify/` | Renders every screen and checks it against the design system. |
| `specs/` | The specification. The source of truth for behaviour and for exact wording. |
| `docs/DESIGN-BRIEF.md` | The design brief. The source of truth for how it looks. |
| `design-system/` | The design system it was built from. |

---

## Check it works

Two commands. Neither needs a phone.

```bash
npm run verify
```

Typechecks everything, runs 323 checks, then renders every screen and measures it.

```bash
python -m pytest factory/tests -q
```

151 checks on the beat detection.

After the first command, open `artifacts/ui/index.html` to see a picture of every screen in
every state — including every error and empty state.

---

## Run it for real

```bash
npm install
python -m factory.run --no-upload
```

That builds beat maps for the three test songs, with no credentials and no internet.

For the phone app you need a **development build** — the Instagram handoff and the video
renderer are native code and do not work in Expo Go.

```bash
npx eas build --profile development --platform android
```

---

## Credentials

Everything above works without any. Copy `.env.example` to `.env` when you want real songs
instead of the three test ones. See `PROGRESS.md` for what still needs a real phone.

---

## The rules this was built to

`CLAUDE.md`. Read it before changing anything. The short version:

- Dark only. Two accents with separate jobs: amber means playing, teal means you chose this.
  Red means one thing only — you have gone too far.
- Every number is set in a monospaced face, with its unit.
- Every state gets designed and built, not just the happy path.
- The exact words in the specs are the exact words on screen. Paraphrasing is a defect.
- Nothing is ticked off as done that could not actually be checked.
