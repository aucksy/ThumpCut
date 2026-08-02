# Drop your own music here

Put audio files in this folder and ThumpCut will work out their beats and cut a demo to them.

**Nothing in here is ever uploaded, committed or published.** The folder is ignored by git, and
it does not exist on the machine that builds the app, so a track analysed here has no route to
anybody's phone. It is for watching the cuts against music you know.

## What to do

1. Put one or two tracks in this folder, beside this file.
   Name them `Artist - Title.mp3` and the demo will label them properly. Any name works.

2. Run these two, in order:

   ```
   python -m factory.run --no-upload --out artifacts/demo-catalogue
   npm run demo -- --catalogue artifacts/demo-catalogue
   npm run demo:serve
   ```

3. Open <http://localhost:4173> and press Play.

## File formats

**WAV works with nothing installed.** Everything else — MP3, M4A, AAC, FLAC — needs `ffmpeg`,
which is a single program you download and unzip; there is nothing to compile and no developer
tools involved. Get it from <https://www.gyan.dev/ffmpeg/builds/> (the "essentials" build),
unzip it, and put the folder's `bin` on your PATH.

If you would rather not: play the file in VLC or Audacity and export it as WAV, or just say so
and it can be handled from this end.

## What the demo shows you

The same beat detector and the same cut engine the phone uses. The page prints how far the
worst cut lands from its beat — the product's own limit is 50 milliseconds, and people start
noticing at about 30.
