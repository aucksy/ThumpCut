The one thing ThumpCut is remembered by: the track's real beat grid, energy-tinted cool → bone → signal with clip at the drop. Photo cut markers are bone squares, video markers are teal bars — at a glance you see stills vs motion.

```jsx
<BeatRuler height={44} playing />          // preview screen, full width
<BeatRuler compressed beats={24} seed={2}/> // 4px strip on template cards
<BeatRuler playing reduced />               // reduced motion: playhead only
```

Playing: amber playhead sweeps (`sweepDur`s/pass), each marker pulses 120ms scale-only as it's hit. Always decorative (aria-hidden). Spend the boldness here; keep everything else quiet.