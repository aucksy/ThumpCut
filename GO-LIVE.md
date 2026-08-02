# Getting to a full end-to-end test

Everything you need to do, in order. About **25 minutes** of your time in total, split into two
parts that are worth doing on different days if you like — Part 1 is useful on its own.

Nothing here needs a laptop with developer tools. Part 1 is entirely in a browser. Part 2 is a
browser plus two minutes on your phone.

---

## First — one thing that will never happen, so you are not waiting for it

**The video ThumpCut makes has no sound in it, on purpose, and always will.**

That is not a missing feature. Putting a commercial recording inside a video file we hand you is
unlicensed synchronisation, and it is the single largest legal risk this product could take. The
whole design avoids it: ThumpCut cuts the pictures to the beat, hands the silent video to
Instagram, and **Instagram** puts the licensed track on it. That last step is where the music
appears, and it is where you will hear whether we got the timing right.

So "preview an actual output with music" happens in two places, and neither is a file on your
phone:

- **Inside Instagram**, after you tap Share and pick the track. This is the real test.
- **On your laptop**, in the demo page I sent — which after Part 2 can be rebuilt against a real
  trending track, so you can hear the actual song against the actual cuts before posting.

Inside the ThumpCut app itself, the preview plays a click on each beat rather than the song.
Streaming Meta's audio into our own app is a separate question about their terms that has not
been answered, and the app ships without needing that answer.

---

## Part 1 — Turn on the Instagram Share button

**Time:** about 10 minutes. **Gets you:** the Share button appears, and you can post a reel to
Instagram end to end using the test tracks. This is most of the product.

### 1. Make a Meta app

1. Go to **<https://developers.facebook.com/apps>** and log in with your Facebook account.
   If it asks you to register as a developer, agree — it is free and instant.
2. Click **Create app**.
3. Where it asks what you want your app to do, choose **Other**, then **Next**.
4. For the type, choose **Business**, then **Next**.
5. Name it `ThumpCut`, check your email address is right, click **Create app**.
   It may ask for your password.

### 2. Copy the App ID

On the app's dashboard, the **App ID** is near the top — a long number, something like
`1234567890123456`. Copy it.

### 3. Give it to the build

1. Go to **<https://github.com/aucksy/ThumpCut/settings/secrets/actions>**
2. Click **New repository secret**
3. Name: `META_APP_ID` — exactly that, capitals and underscore
4. Secret: paste the number
5. **Add secret**

### 4. Rebuild

1. Go to **<https://github.com/aucksy/ThumpCut/actions/workflows/android.yml>**
2. Click **Run workflow** on the right, then the green **Run workflow** button
3. Wait about ten minutes for the green tick
4. Install the new build from
   **<https://github.com/aucksy/ThumpCut/releases/latest>** as usual

**You should now see a "Share to Instagram" button** on the last screen. If it is still missing,
the App ID did not reach the build — tell me and I will check.

---

## Part 2 — Real trending music

**Time:** about 15 minutes. **Gets you:** the actual songs trending on Instagram, in the app,
with their real beats.

### 1. Make your Instagram account Professional

Two minutes on your phone. A personal account cannot see the music list; a Professional one can,
and it is free, reversible, and changes nothing anyone else sees.

1. Instagram → your profile → the ☰ menu → **Settings and privacy**
2. **Account type and tools** → **Switch to professional account**
3. Pick any category → choose **Creator** → continue
4. **When it offers to connect a Facebook Page, say yes.** Let it create one for you if you do
   not have one. **This step is the one people skip, and nothing works without it.**

### 2. Get a token

1. On the laptop, go to **<https://developers.facebook.com/tools/explorer>**
2. Top right, in the **Meta App** dropdown, choose **ThumpCut**
3. Below that, in **Permissions**, add these three — type each into the box and pick it:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
4. Click the blue **Generate Access Token** button
5. Log in and click through the permission screens, saying yes to your Page and Instagram account
6. Copy the **Access Token** — a very long string

### 3. Give it to the build

1. Go to **<https://github.com/aucksy/ThumpCut/settings/secrets/actions>**
2. **New repository secret**
3. Name: `META_ACCESS_TOKEN`
4. Secret: paste the long string
5. **Add secret**

You do **not** need to find an Instagram account ID. The build works it out from the token.

### 4. Build the real song list

1. Go to **<https://github.com/aucksy/ThumpCut/actions/workflows/catalogue.yml>**
2. **Run workflow** → the green **Run workflow** button
3. About two minutes.
   - **Green tick:** it worked. Real tracks are in.
   - **Red cross:** click into it and read the last step. It is written in plain English and says
     exactly which of the above went wrong — almost always the Facebook Page in step 1.4.
4. Then rebuild the app: **<https://github.com/aucksy/ThumpCut/actions/workflows/android.yml>**
   → **Run workflow**, wait ten minutes, and install the new build.

---

## About that token expiring

The token from step 2.2 lasts about **an hour**. That is fine — it only has to survive the two
minutes the song list takes to build, and the result is saved permanently.

When you want to refresh the songs later, the workflow will fail with "the token has expired".
Generate a new one the same way and replace the secret. **The app keeps working from the last
good song list in the meantime** — nothing breaks while the token is stale.

If this becomes annoying we can swap it for a long-lived token that lasts two months. Say the
word.

---

## What you will be able to test once both parts are done

1. Open the app, see **real trending songs**, pick one.
2. Pick a style, pick your photos and clips.
3. Watch the preview — the beat ruler moves, a click marks each beat, the pictures cut on them.
4. Export. The reel saves to your gallery, silent.
5. Tap **Share to Instagram**. Instagram opens with your reel already loaded.
6. **Pick the same track in Instagram.** This is the moment of truth: the song plays and the
   pictures should change exactly on the beat.
7. Post it, or discard it — either way, step 6 is the answer to whether this product works.

If step 6 is off — cuts landing slightly early or late — tell me by how much and in which
direction, and that is a solvable, measurable problem.
