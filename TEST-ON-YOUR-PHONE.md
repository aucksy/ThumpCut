# Put ThumpCut on your phone and test it

Everything here happens on your phone. Your laptop is not involved at any point.

---

## Part 1 — Getting it onto the phone

### The first time

1. On your **Android phone**, open Chrome and go to:

   **https://github.com/aucksy/ThumpCut/releases/latest**

2. Scroll down to the grey **Assets** box and tap the file ending **`.apk`**. It is named with
   its version and build number — `ThumpCut-1.0.0-b17.apk` — so you can always tell which one
   you are holding. It downloads in a few seconds.

3. Tap the download when it finishes (or open Chrome's **Downloads** and tap it there).

4. Android will say something like *"For your security, your phone can't install unknown
   apps from this source."* Tap **Settings**, turn on **Allow from this source**, then tap
   the back arrow. The install screen comes back.

5. Tap **Install**. Then **Open**.

You should see a dark, almost-black screen with the word ThumpCut. The app's icon on your
home screen is five vertical bars — orange, blue and grey — on a dark square. **If you see a
plain white Android robot instead, tell me: the build picked up the wrong icon.**

### Every time after that

Same link, same three taps: **Assets → the `.apk` file → Install**. It installs straight over
the old one — you never need to uninstall, and nothing is lost. Every build is signed with the
same key, which is what makes that possible; if Android ever refuses an update, that is a bug
and I want to hear about it.

That link always points at the newest build. There is nothing to check or choose.

**To see which build you are running:** Settings → Apps → ThumpCut. The version there matches
the number in the file name.

### If the page says "Release not found"

The build has not finished yet. It takes about twenty minutes after a change. Go to
**https://github.com/aucksy/ThumpCut/actions**, and look at the top row: a spinning brown dot
means it is still building, a green tick means it is ready, a red cross means it failed — send
me a screenshot of the red one.

---

## Part 2 — What is and isn't in this build

**Read this before you start, or two of the tests below will look broken when they aren't.**

- **The songs are fake.** Three test tracks by "ThumpCut Test Kit" at three different speeds.
  They are real audio with real beats, so every timing test below is genuine — but they are
  not Instagram's music. Real songs need one thing from you (see the end of this page).
- **The Instagram button will not appear.** Not a bug, and not the app failing to find
  Instagram: sharing to Instagram needs an ID from Meta that we do not have yet. Rather than
  show you a button that fails, the app hides it. **Save to gallery works.**
- **Photos do not drift or zoom yet.** They hold still. The gentle zoom is designed but not
  built into the video yet.
- **Template cards do not move.** They show a still panel. That is the designed fallback, not
  a broken card.

---

## Part 3 — The checklist

Do them in order. For each one, all I need back is the number and either "fine" or what you
actually saw. A photo of the screen is worth more than a description.

### Getting in

**1. It opens.**
Tap the icon. You should reach a screen offering songs within a couple of seconds.
*Wrong if:* it closes immediately, or it says it cannot reach the song list. If it says the
latter, check the phone has internet and try the Retry button once.

**2. It asks for your photos properly.**
Pick a song, pick a style, then tap through to choose media. Android asks for permission.
Tap **Allow**.
*Wrong if:* the app asks for anything other than photos and videos, or shows a blank grid
after you allow it.

**3. Refusing works too.**
Force-stop the app (long-press the icon → App info → Force stop), open it again, get back to
the same screen, and this time tap **Don't allow**.
You should get a clear explanation and a button that takes you to the phone's settings — not
an empty grid and not a crash. Then allow it again and carry on.

### The big one

**4. A full-size reel exports without the app dying.**
This is the single biggest risk in the whole product, so do it early.
Choose **30 items**, and make sure **15 of them are videos** — the longer the better, aim for
around five minutes of video in total. Then export.
*Right if:* it finishes and saves.
*Wrong if:* the app vanishes, or you get a message about running out of memory.

**5. It finishes in under a minute and a half.**
Start a stopwatch when you tap Export. Anything past 90 seconds is a fail — tell me how long
it actually took.

**6. The progress number actually moves.**
While it exports, watch the percentage. It should climb steadily.
*Wrong if:* it sits at 0% the whole time and then jumps to done.

**7. Leaving the app mid-export doesn't kill it.**
Start another export. While it is running, press Home, wait twenty seconds, come back.
*Right if:* it is still going, or already finished.
*Wrong if:* it restarted from zero, or shows an error.

**8. Nothing broken is ever left in your gallery.**
Start an export and tap Cancel halfway. Then open your phone's Photos or Gallery app.
*Right if:* there is no half-finished ThumpCut video in there.

### Does the video actually look right

**9. A sideways video comes out the right way up.**
Record a short clip holding the phone **sideways** (landscape). Make a reel with it.
*Right if:* in the finished video, that clip is upright and fills the tall frame.
*Wrong if:* it is on its side, upside down, or has black bars above and below.

**10. Everything fills the frame.**
Look at the finished video for black bars anywhere.
*Right if:* every shot fills the whole tall screen, edge to edge.

**11. It plays properly in your normal gallery app.**
Open the finished reel in Photos or Gallery, not in ThumpCut.
*Right if:* it plays smoothly, and the picture changes at the same moments it did in
ThumpCut's preview.
*Wrong if:* it stutters, or the cuts feel like they land in different places than they did in
the preview.

**12. The cuts land on the beat.**
Play the finished reel and, at the same time, hum or tap along to the beat you heard in the
app's preview. The picture should change right on the beat, not slightly before or after.
This is the one that proves the product works. Trust your ears — if it feels late, it is late.

### The awkward one

**13. Your selection survives the phone clearing the app out.**
This one needs a setting turned on, and it is worth it.

- Open the phone's **Settings** → **About phone** → tap **Build number** seven times. It will
  say you are now a developer.
- Go back to **Settings** → **System** → **Developer options**.
- Find **Don't keep activities** and turn it **on**.

Now open ThumpCut, pick a song and select six photos, then press Home and come straight back.
*Right if:* your six photos are still selected, in the same order.
*Wrong if:* the selection is empty or the app restarts at the beginning.

Also try starting an export, then pressing Home and coming back.
*Right if:* either it is still exporting, or it tells you plainly that it stopped — and there
is no broken file in your gallery.

**Turn "Don't keep activities" back off when you are finished.** Leaving it on makes every app
on the phone behave badly.

### Not yet — here so they are not forgotten

**14–18. Everything to do with Instagram.** The button is deliberately hidden until I have the
Meta app ID from you (see below). Once I have it these become: the button appears, sharing
opens Instagram with the reel loaded, cancelling inside Instagram and coming back keeps
everything, uninstalling Instagram makes the button vanish, and the cuts still land on the beat
once a real track is applied. That last one is the one that proves the whole product works, and
it also needs real songs rather than the three test tracks.

**19–20. The iPhone ones.** There is no iPhone build yet — this is Android only. Limited photo
access, and an iCloud photo that has not downloaded.

---

## Part 4 — What I need from you to finish this

Three things, and only the first is urgent.

### 1. A Meta app ID — the one that matters

Without it the Instagram button cannot exist, and sharing to Reels is the whole point of the
product. It is free, there is no review and no approval.

- Go to **https://developers.facebook.com/apps** and sign in.
- **Create app** → give it any name → choose **Other** → **Business** → create.
- On the dashboard, copy the **App ID**. It is a long number.

Then put it into the build — you do not need to send it to me, and it is better if you don't:

- Go to **https://github.com/aucksy/ThumpCut/settings/secrets/actions**
- **New repository secret**
- Name: `META_APP_ID` (exactly that, capitals and underscore)
- Secret: paste the number → **Add secret**

The next build picks it up on its own. Nothing else changes.

### 2. Real songs, instead of the three test tracks

Same idea: a **Meta access token**, added as a secret named `META_ACCESS_TOKEN`. Once it is
there, the song list rebuilds itself from Instagram's real music library and the app starts
offering real tracks. Until then the test kit stands in and every timing test still counts.

### 3. Template preview videos

Five short looping clips, one per style — or just tell me to ship the still panels. Purely
cosmetic; the app works either way. This one can wait indefinitely.
