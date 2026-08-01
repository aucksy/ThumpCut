# Phase 1 — Factory: quickstart

A plain-English test script. No coding. You need a computer with Python on it, not a phone.

---

## Setup, once

```bash
pip install numpy pytest
```

That is the whole install list. Nothing else is needed to run the Factory with no credentials.

---

## 1. Run it with no credentials at all

```bash
python -m factory.run --no-upload
```

**What you should see**

```
NO_CREDENTIALS: running in fixture mode. Set META_ACCESS_TOKEN for live data.
NEW Slow Tide: 96 BPM, 64 beats
NEW Night Meter: 124 BPM, 80 beats
NEW Redline: 150 BPM, 96 beats
PUBLISHED locally to .../factory/out. Set R2_* to upload.
DONE engine=spectral_dp published=3 unchanged=0 changed=0 retired=0 failed=0
```

✅ It ran without credentials, found three songs, and wrote them out.

---

## 2. Check no music was left lying around

```bash
ls factory/tmp
```

✅ Empty. The Factory downloads audio, measures it, and deletes it. It keeps numbers only.

---

## 3. Look at one song's timing file

Open `factory/out/beatmaps/fixture-drive-124.json`.

- `bpm` should read about `124`
- `beatsSec` is a list of times, each one bigger than the last
- every number in `downbeatsSec` should also appear in `beatsSec`
- `energyCurve` has exactly as many numbers as `beatsSec`

✅ That file is everything the app needs to cut on the beat. It contains no audio.

---

## 4. Run it a second time

```bash
python -m factory.run --no-upload
```

**What you should see**

```
DONE engine=spectral_dp published=3 unchanged=3 changed=0 retired=0 failed=0
```

✅ `unchanged=3`. It recognised the same three recordings and did not redo the work.

---

## 5. Swap a song and prove it notices

Instagram sometimes replaces a song with a different recording — a remaster, or a clean
version — without saying so. If that goes unnoticed, every cut in the app lands in the wrong
place and nothing errors. This step proves the Factory catches it.

Replace `factory/fixtures/drive-124.wav` with any other music file, renamed to that exact
name. Then run it again.

**What you should see**

```
CHANGED Night Meter: fingerprint differs, re-analysing
```

✅ It spotted the swap and recalculated the timings from the new recording.

(To undo: `python -m factory.fixtures.make_fixtures`)

---

## 6. Run the automated tests

```bash
python -m pytest factory/tests -q
```

✅ Everything passes. 151 checks, about 40 seconds.

---

## Going live later — what changes

Copy `.env.example` to `.env` and fill in your Meta credentials. Then the same command pulls
Instagram's real trending songs instead of the three test ones. Nothing else changes.
