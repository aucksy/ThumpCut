# Every key the app can use, what each one unlocks, and exactly where it goes

This is the only page you need. Three keys exist. **None of them is required for the app to
work** — Part 0 explains why — and each one can be added on its own, in any order, whenever
you are ready. Adding a key is always the same three steps: get the value, paste it into a
named box on GitHub, press one Run button.

**Where every key goes (all three use this):**

1. Open **<https://github.com/aucksy/ThumpCut/settings/secrets/actions>**
2. Click **New repository secret**
3. Type the NAME exactly as written below (capitals and underscores matter)
4. Paste the value into the Secret box → **Add secret**

---

## Part 0 — What already works with no keys at all

**The app is complete and self-sufficient today.** Install it from
<https://github.com/aucksy/ThumpCut/releases/latest> and you can:

1. Open it and pick a style.
2. On the style screen, tap the **Your music** chip and pick **any song saved on your
   phone** — a royalty-free download, for example.
3. The app reads the song's beat on the phone itself ("Reading the beat · 47%", a few
   seconds, once ever per song).
4. Preview with the music playing, pictures cutting on its beats.
5. Export — **the music is inside the finished video.**
6. **Share to YouTube** (it becomes a YouTube Short by itself), **Share anywhere**
   (WhatsApp, TikTok, anything), or save to your gallery.

This is the "if I can never finish the Meta setup" answer: it already works, end to end,
for ever, with nothing from anyone.

The three built-in songs are still the test kit ("ThumpCut Test Kit") until Part 2 or
Part 3 replaces or extends them.

---

## Part 1 — `META_APP_ID` — turns on the "Share to Instagram" button

**Time:** about 10 minutes. **Cost:** free, no review, no approval.
This is for reels made with **Instagram's own songs**: the app exports them silent, hands
them to Instagram, and Instagram adds the licensed track.

1. Go to **<https://developers.facebook.com/apps>**, log in with your Facebook account.
   If it asks you to register as a developer, agree — free and instant.
2. **Create app** → what do you want to do: **Other** → type: **Business** → name it
   `ThumpCut` → **Create app**.
3. On the dashboard, copy the **App ID** — a long number near the top.
4. Add it as a secret (the four steps at the top). NAME: `META_APP_ID`
5. Rebuild: **<https://github.com/aucksy/ThumpCut/actions/workflows/android.yml>** →
   **Run workflow** → wait for the green tick (~15 min) → install the new build from
   the releases page as usual.

**You should now see "Share to Instagram"** on the last screen after exporting with a
built-in song. If it is still missing, the ID did not reach the build — say so.

**One thing for later, before strangers use the app:** in the Meta dashboard there is an
**App Mode** switch (Development / Live). Your own phone works in Development. Before the
app goes public, flip it to **Live**, or sharing will only work for you. Nothing to decide
today — it is a one-tap switch whenever release day comes.

---

## Part 2 — `META_ACCESS_TOKEN` — turns on Instagram's real trending songs

**Time:** about 15 minutes. **Needs:** Part 1 done first, plus two minutes on your phone.

**First, on the phone (once):** Instagram → your profile → ☰ → **Settings and privacy** →
**Account type and tools** → **Switch to professional account** → pick any category →
**Creator**. **When it offers to connect a Facebook Page, say yes** — let it create one.
That connection is the step people skip, and nothing works without it.

**Then, on the laptop:**

1. Go to **<https://developers.facebook.com/tools/explorer>**
2. Top right, **Meta App** dropdown → choose **ThumpCut**
3. Under **Permissions**, add all three: `instagram_basic`,
   `instagram_content_publish`, `pages_show_list`
4. Click **Generate Access Token**, click through the approvals, say yes to your Page
   and Instagram account
5. Copy the long token
6. Add it as a secret. NAME: `META_ACCESS_TOKEN`
7. Build the song list: **<https://github.com/aucksy/ThumpCut/actions/workflows/catalogue.yml>**
   → **Run workflow** (~2 min). Green tick: real songs are in. Red cross: open it and read
   the last step — it says in plain words which step above went wrong, almost always the
   Facebook Page connection.
8. Rebuild the app (same as Part 1 step 5) and install it.

**About this token expiring:** it lives about an hour, which is fine — it only needs to
survive the two minutes the song list takes to build, and the result is saved. When you
want fresh songs weeks later, generate a new token the same way, replace the secret, run
the catalogue workflow again. **The app keeps working from the last good song list the
whole time.** If this ever gets annoying, say the word and it can be swapped for a
two-month token.

---

## Part 3 — `JAMENDO_CLIENT_ID` — turns on the royalty-free section

**Time:** about 10 minutes. **Cost:** free. **Needs:** nothing else — works without Parts 1–2.

This adds a **Royalty-free** section to the song row in the app: real music, legally clear
to embed, so those reels carry their music inside the file and share anywhere — same as
Your music, but the songs come with the app. Only tracks whose licence allows reuse and
editing are let in; the app shows the credit line to copy into a caption.

1. Go to **<https://devportal.jamendo.com>** and sign up (free).
2. Create an application — name it `ThumpCut`, any description.
3. Copy its **client id**.
4. Add it as a secret. NAME: `JAMENDO_CLIENT_ID`
5. Run the catalogue workflow (Part 2 step 7's link) → green tick.
6. Rebuild the app (Part 1 step 5) and install it.

**You should now see a ROYALTY-FREE group** in the song row, each song with its licence
(like "CC BY") on the chip.

**Two standing rules that came with this provider — they are the deal, not settings:**

- **If ThumpCut ever makes money — ads included — Jamendo's free tier no longer covers
  it.** Write to licensing@jamendo.com first. Today the app is free with no ads, so all is
  well.
- The app must never offer "download for offline listening" of these songs. It doesn't,
  and it shouldn't ever.

---

## After all three parts — the full test

1. Open the app: real trending songs, a royalty-free group, and Your music, all in one row.
2. An Instagram-song reel: exports silent → **Share to Instagram** → pick the same song
   inside Instagram → **the cuts land on the beat.** That is the whole product proved.
3. A royalty-free or Your-music reel: exports **with the music inside** → Share to
   YouTube / anywhere → plays with sound wherever it lands.

If a cut lands slightly early or late anywhere in step 2 or 3, tell me by how much and in
which direction — that is a solvable, measurable problem.
