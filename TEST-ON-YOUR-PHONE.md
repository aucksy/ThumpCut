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

- **NEW: your own music works, start to finish.** On the screen where styles are suggested
  there is now a row of song choices, and the first chip is **Your music**. Tap it, pick any
  song saved on your phone, wait a few seconds while it says **Reading the beat** with a
  percentage — and from there everything works as normal, except the finished video **has the
  music inside it** and the last screen offers **Share to YouTube** and **Share anywhere**.
  This is the app's independent path: it needs no Meta anything.
- **NEW: the preview plays the song.** You hear the actual music while you watch the pictures
  cut to it. If the music cannot be fetched — no signal, say — you get the click instead and
  the screen tells you so in words.
- **NEW: the preview shows your pictures.** The panel above the beat ruler shows whichever of
  your photos belongs at that moment.
- **The built-in songs are fake.** Three test tracks by "ThumpCut Test Kit". Real Instagram
  songs and a royalty-free section each need one small thing from you (see the end).
- **The Instagram button will not appear.** Not a bug: sharing to Instagram needs an ID from
  Meta that is not set yet. Rather than show you a button that fails, the app hides it.
  **Save to gallery works, and so does the whole Your-music path above.**
- **NEW: the app opens instantly, even offline.** The song list is now built into the app
  itself. First open goes straight to the styles — no "Getting things ready" — and a fresh
  install works in airplane mode.
- **NEW: the style cards have artwork that moves.** Each card shows coloured bars — the
  rhythm of that style — with a thin amber line sweeping across. Fast styles sweep fast.
- **NEW: exports have the designed motion.** Photos drift and zoom gently; "Golden hour"
  softens each cut through a brief dip; "Heat" lands each cut with a small punch; a clip too
  short for its moment holds its last frame instead of failing the export.

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

### The new one — the preview plays the song

**3a. You can hear the music, and the pictures change on it.**
Pick a song, pick a style, pick nine or so photos, and watch the preview screen with the volume
up. You should hear the track playing and see the picture change in time with it. A click for
the first second or so while it loads is normal — the music should take over on its own without
jumping back to the start.
*Wrong if:* you hear nothing at all, or you get clicks the whole way through. If it clicks, the
screen will say **"We couldn't load the track, so you'll hear a click on each beat."** — tell me
you saw that line, and whether you were on wifi or mobile data. That message appearing is the
app working correctly and telling you the truth; it just means the music did not arrive.

**3b. Tapping through styles does not restart the music.**
Tap four or five different styles in a row. The cutting should change immediately and the song
should keep playing through it.
*Wrong if:* the music stops and restarts, or drops to clicks, each time you tap.

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

### The new path — your own music, and sharing it anywhere

**21. Your music appears and analyses.**
On the style-suggestions screen, tap the **Your music** chip. Allow music access when asked.
Pick any song. You should see **Reading the beat** with a percentage that climbs, for roughly
five to twenty seconds depending on the song — then you are back with that song selected.
*Wrong if:* it sits at 0%, the app closes, or a song you know has a clear beat is refused.

**22. Picking the same song again is instant.**
Go back into Your music and tap the same song. No reading step — it should select immediately.
The app remembers every song it has already read.

**23. The preview plays your song, and the export contains it.**
Carry on to the preview — your song should play, pictures cutting to it. Export, then play the
reel in your normal gallery app **with the volume up**.
*Right if:* the reel has the music in it, starting from the same part of the song the preview
played, and the cuts land on its beat.
*Wrong if:* the reel is silent, the music starts from a different place, or it drifts.

**24. Share to YouTube.**
On the last screen after exporting with your song, you should see **Share to YouTube** (if
YouTube is installed) and **Share anywhere** — and no Instagram button. Tap the YouTube one.
*Right if:* YouTube opens with your reel ready to post as a Short — the music already in it.
*Wrong if:* the button is missing with YouTube installed, or YouTube opens empty. This exact
handoff is the one step no Google document guarantees, so it is the most valuable test on
this page.

**25. Share anywhere.**
Same screen, tap **Share anywhere** and pick WhatsApp (or anything). Send it to yourself.
*Right if:* the received video plays with the music in it.

### This session's polish — the five quick ones

**26. The style cards move.**
Open the app and just look at the home screen. Every card should show coloured bars with a
thin amber line sweeping across, and each card's pattern should look different — the "Heat"
card spiky and fast, "Golden hour" soft and slow.
*Wrong if:* any card is a plain empty rectangle, or nothing moves.

**27. It works fresh out of the box with no internet.**
Uninstall ThumpCut, turn on airplane mode, reinstall from the file you downloaded earlier,
and open it. You should get the full styles screen instantly, and the whole Your-music path
(21–25) should work end to end — the preview will use the click sound, which is honest,
because streaming needs a connection.
*Wrong if:* it says you're offline and stops, or the styles screen is empty.

**28. Photos move in the finished video.**
Make a reel from photos only and play the export. Each photo should drift or zoom very
gently — barely noticeable, but not frozen.
*Wrong if:* photos are completely still, or the movement is violent.

**29. Each style cuts differently.**
Export the same photos with "Golden hour" and again with "Heat". Golden hour's cuts should
soften through a brief dip to dark; Heat's should land with a small zoom punch.
*Wrong if:* both look identical, or a dip lasts so long the reel goes black.

**30. A too-short clip no longer breaks the export.**
Record a one-second video clip. Make a reel with it and a slow style like Coastline.
*Right if:* the reel exports, and that clip plays then holds its last frame until the next
cut.
*Wrong if:* the export fails, or the clip's slot shows black.

**31. Settings tells the truth.**
Open Settings. The version line should show this build's number (not "(1)" for ever), and
tapping Privacy policy should open a readable page saying the app collects nothing.

### Not yet — here so they are not forgotten

**14–18. Everything to do with Instagram's own music.** The button is deliberately hidden
until the Meta app ID exists (see below). Once it does, these become: the button appears,
sharing opens Instagram with the reel loaded, cancelling inside Instagram and coming back
keeps everything, uninstalling Instagram makes the button vanish, and the cuts still land on
the beat once a real track is applied inside Instagram. That last one also needs real songs
rather than the three test tracks.

**19–20. The iPhone ones.** There is no iPhone build yet — this is Android only. Limited photo
access, and an iCloud photo that has not downloaded.

---

## Part 4 — What I need from you to finish this

Everything is written up properly, step by step, in **GO-LIVE.md** — that file is the single
place for every key and where it goes. The short version: a **Meta app ID** turns on the
Instagram button, a **Meta access token** turns on real trending songs, and a free **Jamendo
key** turns on a royalty-free section whose reels carry their music. The app already works
end to end today with none of them, through Your music.

One purely cosmetic item lives outside GO-LIVE.md: five short looping template preview
videos, one per style — or just say "ship the still panels". The app works either way, and
this one can wait indefinitely.
