# Paste this into a new chat if the beat sync still needs work

> Continue ThumpCut. Code is at D:\Apps\ThumpCut\Codebase, GitHub: aucksy/ThumpCut.
> Read first, in order: CLAUDE.md, DECISIONS.md (bottom first), PROGRESS.md, specs/08-local-music.md.
>
> The one thing I care about: **I pick any song from my phone's storage in "Your music",
> and the exported reel's picture changes exactly on that song's beats.** Preview and export
> both.
>
> Where this stands: on 2026-08-02 I reported image transitions out of sync with the beat
> for local MP3s (the built-in test tracks were fine). The session found the cause — an
> MP3's playback clock is not its analysis clock (hidden encoder padding, imprecise
> mid-file seeking on variable-bitrate files) — and shipped the structural fix, invariant
> LM8 in spec 08: at analysis time the app renders an exact PCM WAV copy of the song from
> the same decode the beat grid was measured on, and the preview plays and the export
> embeds ONLY that copy. See DECISIONS.md 2026-08-02 (the "One clock for local music"
> entry) before touching anything.
>
> My test result on the latest build is: [SAY HERE: in sync / still off — and if off:
> roughly how much, is it the same amount the whole way through or does it get worse, is it
> early or late, and is it the preview, the exported file in the gallery, or both].
>
> If it is still off, investigate in this order — each is a different signature:
> 1. **Constant offset, preview AND export** — the copy is somehow not being used; verify
>    the selected track's audio path ends in .wav (localTracks.ts, AnalysedLocalTrack) and
>    that the export receives the same path (deriveExportAudio).
> 2. **Constant offset, export only** — the renderer's audio clip start; check the ms
>    rounding and Media3 ClippingConfiguration against the WAV.
> 3. **Drifts worse over time** — a sample-rate mismatch in the WAV header vs actual frames
>    (AudioDecodeModule.decodeToWavFile, both platforms) or the resampler step.
> 4. **Jittery, not offset** — the preview playhead; StreamedAudio.getPositionSec and the
>    33ms poll in app/app/preview.tsx.
> Never "fix" this by nudging beats by a constant — find the clock that lies. Cloud builds
> only; read the workflow result and open the APK before claiming anything works. Plain
> English to me; end with the Done / Needs you / Next block.
