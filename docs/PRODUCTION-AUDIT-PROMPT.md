# Paste this into a new chat for the production-readiness audit

> Continue ThumpCut. Code is at D:\Apps\ThumpCut\Codebase, GitHub: aucksy/ThumpCut.
> Read first, in this order: CLAUDE.md (project rules — I am a product manager, not a coder;
> plain English in everything written to me), DECISIONS.md (bottom first), PROGRESS.md,
> OPEN-QUESTIONS.md, GO-LIVE.md, then specs/ — 08, 09, 10 are the newest features.
>
> **The job: a full end-to-end audit, then fix what you find, until this app is polished and
> ready like a production app.** Work as an autonomous batch: decide, ship, then surface.
> One review round per finding; ship unless it touches behaviour, money or privacy.
>
> Audit in this order, fixing as you go:
>
> 1. **Walk every screen like a first-time user.** Render every state with `npm run verify`
>    and LOOK at all the screenshots in artifacts/ui — a green gate with an ugly screen is a
>    failure. Hunt: clipped text, cramped spacing, states that dead-end, anything that needs
>    a coder's eyes to understand. Every error message must say what happened and what to do.
> 2. **Walk every flow for holes.** Cold start offline. Kill the app at every step and
>    reopen. Deny every permission. Pick 3 items, 30 items, all videos, all photos. Rotate.
>    Every hole gets a designed state, not a crash and not a blank.
> 3. **The known unfinished edges** — close them: photos still don't drift or zoom in the
>    export (the gentle Ken Burns motion is designed, in the cut lists, and not applied by
>    the renderer); a clip far too short for its slot fails the export instead of holding
>    its last frame; template cards show stills, not motion.
> 4. **Performance on a cheap phone.** The app must feel instant on 2GB of RAM: gallery
>    opens with no spinner ever, preview starts fast, no memory spikes in the analysis or
>    export paths. Measure where you can; reason and document where you can't.
> 5. **Production hygiene, as a checklist with owners.** The signing key is a throwaway test
>    key with a published password — a Play Store release needs Play App Signing and a real
>    key (mine to do; write the exact steps). Also: version naming, a privacy policy page
>    (the app collects nothing — say so), the Meta app's Live-mode switch, and the two
>    standing Jamendo rules (no revenue without their licence; no offline library feature).
>    Put everything I must personally do into GO-LIVE.md, step by step.
> 6. **Docs match reality.** PROGRESS, OPEN-QUESTIONS, GO-LIVE and TEST-ON-YOUR-PHONE must
>    describe the app as it is when you finish, not as it was.
>
> Hard rules that are not up for review: an Instagram-catalogue export is silent, for ever;
> royalty-free and Your-music exports carry exactly their own track (invariant G2); local
> music plays and embeds only its exact rendered copy (invariant LM8 — the one-clock rule);
> no new third-party packages without asking me; do not build anything on the out-of-scope
> list in specs/00-overview.md §5.2.
>
> Method rules: cloud builds only — after every push, read the conclusion of EVERY workflow,
> not just the app build, and open the published APK before claiming it works. Never claim
> anything a phone must prove — park those for me, numbered, in TEST-ON-YOUR-PHONE.md.
> Anything you genuinely cannot decide goes in OPEN-QUESTIONS.md and you carry on.
>
> End with the Done / Needs you / Next block, self-contained, max ten lines, plain English.
