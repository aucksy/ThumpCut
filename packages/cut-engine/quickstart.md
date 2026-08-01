# Phase 2 — Cut engine: quickstart

There is no screen to look at here. This is the part that decides *when the picture changes*.
You can still check it does the right thing by reading a table.

---

## 1. Run the automated checks

```bash
npm run test -w @thumpcut/cut-engine
```

✅ All checks pass. That includes thousands of generated combinations — every number of
pictures from 3 to 40, every style, random mixes of photos and clips of every length — proving
no edit ever breaks a rule.

---

## 2. Look at an actual edit

```bash
node --experimental-strip-types packages/cut-engine/scripts/preview-cutlist.ts beatmap-drive-124 night-drive 8
```

You get a table, one row per moment the picture changes. Check three things by eye:

**1. The lengths are not all the same.** Look at the `length` column. If every row is the same
number, the edit is a fixed-rate slideshow and the whole premise has failed.

**2. Short rows sit where the energy number is high.** Compare `length` against `energy`. The
picture should change faster where the music is louder. That is the thing that makes an edit
look professionally cut rather than assembled.

**3. Nothing is below 0.35.** The `Shortest` line at the bottom says so directly. Anything
below that flickers rather than cuts.

---

## 3. Try a slower style and see it change

```bash
node --experimental-strip-types packages/cut-engine/scripts/preview-cutlist.ts beatmap-drive-124 golden-hour 6
```

✅ The rows get about twice as long, and a long clip now runs across three rows in a row —
that is one video clip playing continuously while the cuts land on the beat around it, instead
of being chopped into a half-second fragment.

---

## 4. Prove it is repeatable

Run the same command twice. The two tables should be identical, character for character. The
same pictures and the same song must always produce the same reel, or the preview you watch
and the file you export could differ.
