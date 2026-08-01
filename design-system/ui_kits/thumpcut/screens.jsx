import { BeatRuler } from '../../components/ruler/BeatRuler.jsx';
import { Button } from '../../components/actions/Button.jsx';
import { Chip } from '../../components/actions/Chip.jsx';
import { Toast } from '../../components/feedback/Toast.jsx';
import { InlineHint } from '../../components/feedback/InlineHint.jsx';
import { TrackNotice } from '../../components/feedback/TrackNotice.jsx';
import { MediaTile } from '../../components/media/MediaTile.jsx';
import { TemplateCard } from '../../components/media/TemplateCard.jsx';
import { TrimSheet } from '../../components/media/TrimSheet.jsx';

/* ThumpCut UI kit — the nine screens, every state. 393×852, dark only. */

const IMG = (s, w = 300, h = 300) => 'https://picsum.photos/seed/' + s + '/' + w + '/' + h;
const LOGO = '../../assets/logo-mark.svg';
const LIB = [
  { s: 'tp1' }, { s: 'tv1', type: 'video', dur: '0:12' }, { s: 'tp2' }, { s: 'tp3' },
  { s: 'tv2', type: 'video', dur: '0:07' }, { s: 'tp4' }, { s: 'tp5' },
  { s: 'tv3', type: 'video', dur: '0:21' }, { s: 'tp6' }, { s: 'tp7' }, { s: 'tp8' }, { s: 'tp9' },
];
const TPLS = [
  { name: 'Night drive', bpm: 128, items: '8–16', seed: 2, img: 'tpl1' },
  { name: 'Golden hour', bpm: 96, items: '6–12', seed: 5, img: 'tpl2' },
  { name: 'Heat', bpm: 140, items: '10–20', seed: 7, img: 'tpl3' },
  { name: 'Coastline', bpm: 112, items: '8–14', seed: 4, img: 'tpl4' },
  { name: 'Blackout', bpm: 150, items: '12–24', seed: 9, img: 'tpl5' },
  { name: 'Super 8', bpm: 90, items: '5–10', seed: 6, img: 'tpl6' },
];

const M = ({ children, size = 13, color = 'var(--tc-bone)', weight = 500, style = {} }) => (
  <span style={{ fontFamily: 'var(--font-data)', fontSize: size, fontWeight: weight, color, fontVariantNumeric: 'tabular-nums', ...style }}>{children}</span>
);
const Display = ({ children, size = 24, style = {} }) => (
  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontStretch: '80%', letterSpacing: '-.02em', fontSize: size, lineHeight: 1.12, color: 'var(--tc-bone)', ...style }}>{children}</div>
);
const Label = ({ children, style = {} }) => (
  <div style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--tc-bone-55)', ...style }}>{children}</div>
);

export function StatusBar() {
  return (
    <div style={{ height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px', boxSizing: 'border-box' }}>
      <M size={13} weight={600}>9:41</M>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <svg width="16" height="11" viewBox="0 0 16 11" aria-hidden="true">
          <rect x="0" y="7" width="3" height="4" rx="1" fill="var(--tc-bone)"/><rect x="4.5" y="5" width="3" height="6" rx="1" fill="var(--tc-bone)"/>
          <rect x="9" y="2.5" width="3" height="8.5" rx="1" fill="var(--tc-bone)"/><rect x="13.5" y="0" width="2.5" height="11" rx="1" fill="var(--tc-bone-35)"/>
        </svg>
        <svg width="24" height="12" viewBox="0 0 24 12" aria-hidden="true">
          <rect x=".5" y=".5" width="20" height="11" rx="3" stroke="var(--tc-bone-35)"/><rect x="2" y="2" width="13" height="8" rx="1.5" fill="var(--tc-bone)"/>
          <path d="M22 4v4a2 2 0 0 0 0-4z" fill="var(--tc-bone-35)"/>
        </svg>
      </div>
    </div>
  );
}
const HomeBar = () => <div style={{ position: 'absolute', bottom: 8, left: '50%', width: 120, height: 4, marginLeft: -60, borderRadius: 2, background: 'var(--tc-bone-12)' }} />;

const Back = ({ onClick }) => (
  <button aria-label="Back" onClick={onClick} style={{ width: 44, height: 44, margin: -10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
    <svg width="10" height="17" viewBox="0 0 10 17" aria-hidden="true"><path d="M8.5 1.5 2 8.5l6.5 7" stroke="var(--tc-bone)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
  </button>
);
const TopBar = ({ onBack, center, right }) => (
  <div style={{ height: 48, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 20px', boxSizing: 'border-box', gap: 12 }}>
    <div style={{ width: 24, display: 'flex' }}>{onBack && <Back onClick={onBack} />}</div>
    <div style={{ flex: 1, textAlign: 'center' }}>{center}</div>
    <div style={{ width: 24, display: 'flex', justifyContent: 'flex-end' }}>{right}</div>
  </div>
);

export function Screen({ children, label, style = {} }) {
  return (
    <div data-screen-label={label} style={{
      width: 393, height: 852, position: 'relative', overflow: 'hidden', flexShrink: 0,
      background: 'var(--tc-graphite)', display: 'flex', flexDirection: 'column',
      fontFamily: 'var(--font-body)', color: 'var(--tc-bone)', boxSizing: 'border-box', ...style,
    }}>{children}</div>
  );
}

const CenterMsg = ({ children, action, onAction, hero }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, padding: '0 44px', textAlign: 'center' }}>
    {hero}
    <div style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--tc-bone-70)', textWrap: 'pretty' }}>{children}</div>
    {action && <Button variant="secondary" small onClick={onAction}>{action}</Button>}
  </div>
);

const ToastAt = ({ children, bottom = 128 }) => (
  <div style={{ position: 'absolute', left: 20, right: 20, bottom, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
    <Toast>{children}</Toast>
  </div>
);

const Wordmark = ({ size = 20, mark = 22 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
    <img src={LOGO} width={mark} height={mark} alt="" />
    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontStretch: '80%', letterSpacing: '-.02em', fontSize: size, display: 'inline-flex', alignItems: 'baseline' }}>
      Thump<span style={{ width: Math.max(2, size * .09), height: size * .68, background: 'var(--tc-signal)', borderRadius: 1, margin: '0 ' + size * .06 + 'px', alignSelf: 'center', transform: 'translateY(' + size * .02 + 'px)' }} />cut
    </span>
  </div>
);

/* ---- 1 · First launch ---- */
export function Launch({ state = 'default', go = () => {} }) {
  const msg = {
    offline: ['You\u2019re offline. Connect to the internet to get started.', 'Retry'],
    failed: ['We couldn\u2019t load your styles. Check your connection and try again.', 'Retry'],
    storage: [<span>Not enough storage to set up ThumpCut. Free up about <M size={14}>50 MB</M> and try again.</span>, 'Retry'],
  }[state];
  return (
    <Screen label={'First launch — ' + state}>
      <StatusBar />
      <div style={{ padding: '18px 0 0', display: 'flex', justifyContent: 'center' }}><Wordmark /></div>
      {state === 'default' && <>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 36, padding: '0 24px' }}>
          <BeatRuler height={76} seed={4} playing />
          <Display size={31}>Photos and clips in. Reel out. Every cut on the beat.</Display>
        </div>
        <div style={{ padding: '0 20px 36px' }}><Button full onClick={() => go('gallery', 'default')}>Get started</Button></div>
      </>}
      {state === 'downloading' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26, padding: '0 24px' }}>
          <BeatRuler height={76} seed={4} playing />
          <div style={{ width: 160, height: 3, borderRadius: 2, background: 'var(--tc-bone-12)', overflow: 'hidden' }}>
            <div style={{ width: '42%', height: '100%', borderRadius: 2, background: 'var(--tc-signal)' }} />
          </div>
          <div style={{ fontSize: 14, color: 'var(--tc-bone-55)' }}>Getting things ready</div>
        </div>
      )}
      {msg && <CenterMsg hero={<div style={{ width: '100%', opacity: .35 }}><BeatRuler height={56} seed={4} /></div>} action={msg[1]} onAction={() => {}}>{msg[0]}</CenterMsg>}
      <HomeBar />
    </Screen>
  );
}

/* ---- 2 · Template gallery (home) ---- */
export function Gallery({ state = 'default', go = () => {} }) {
  return (
    <Screen label={'Template gallery — ' + state}>
      <StatusBar />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 20px 0' }}>
        <Wordmark size={19} mark={20} />
        <button aria-label="Settings" onClick={() => go('settings', 'default')} style={{ width: 44, height: 44, margin: -10, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="3" stroke="var(--tc-bone-70)" strokeWidth="1.6"/>
            <path d="M10 1.8v2.4M10 15.8v2.4M1.8 10h2.4M15.8 10h2.4M4.2 4.2l1.7 1.7M14.1 14.1l1.7 1.7M15.8 4.2l-1.7 1.7M5.9 14.1l-1.7 1.7" stroke="var(--tc-bone-70)" strokeWidth="1.6" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '14px 20px 4px', overflow: 'hidden' }}>
        <Chip selected>All</Chip><Chip>Chill</Chip><Chip>Upbeat</Chip><Chip>Hype</Chip><Chip>Cinematic</Chip>
      </div>
      <div style={{ flex: 1, overflow: 'hidden', padding: '12px 20px 0' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {TPLS.map((t, i) => (
            <div key={t.name} onClick={() => go('media', 'permission')} style={{ cursor: 'pointer' }}>
              <TemplateCard width="100%" name={t.name} bpm={t.bpm} items={t.items} seed={t.seed}
                src={IMG(t.img, 340, 500)} still={state === 'cached' && (i === 1 || i === 4)} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 26, left: 0, right: 0, display: 'flex', justifyContent: 'center' }}>
        <Button onClick={() => go('media', 'permission')} style={{ padding: '0 34px', boxShadow: '0 10px 28px rgba(0,0,0,.55)' }}>Create</Button>
      </div>
      <HomeBar />
    </Screen>
  );
}

/* ---- 3 · Media selection ---- */
export function MediaSelect({ state = 'ready', go = () => {} }) {
  const cfg = {
    permission: { msg: <span>Pick photos and clips from your gallery. ThumpCut reads only what you select.</span>, action: 'Allow photo access', primary: true },
    denied: { msg: 'ThumpCut needs access to your photos to make a reel.', action: 'Open Settings' },
    empty: { msg: 'No photos or videos on this device.' },
  }[state];
  const isGrid = !cfg && state !== 'loading';
  const selCount = { browsing: 2, ready: 9, cap: 30, videocap: 18, validating: 9, unavailable: 8, limited: 4, trim: 9 }[state] || 0;
  const clipCount = { browsing: 1, ready: 3, cap: 12, videocap: 15, validating: 3, unavailable: 3, limited: 0, trim: 3 }[state] || 0;
  const canContinue = selCount >= 3;
  let order = 0;
  const items = (state === 'limited' ? LIB.filter(x => !x.type).slice(0, 6) : LIB).map((it, i) => {
    const isVideo = it.type === 'video';
    let selected = false;
    if (state === 'browsing') selected = i < 2;
    else if (state === 'videocap') selected = isVideo ? i === 1 : i % 2 === 0;
    else if (state === 'unavailable') selected = i < 9 && i !== 3;
    else if (state === 'limited') selected = i < 4;
    else if (['ready', 'validating', 'trim', 'cap'].includes(state)) selected = i < 9;
    return { ...it, i, selected, order: selected ? ++order : null,
      dimmed: state === 'videocap' && isVideo && !selected,
      unavailable: state === 'unavailable' && i === 3 };
  });
  return (
    <Screen label={'Media selection — ' + state}>
      <StatusBar />
      <TopBar onBack={() => go('gallery', 'default')}
        center={selCount > 0 ? <M size={13}>{selCount} items · {clipCount} clips</M> : <M size={13} color="var(--tc-bone-55)">Pick items</M>}
        right={isGrid && <M size={12} color={state === 'cap' ? 'var(--tc-clip)' : 'var(--tc-bone-55)'}>{selCount}/30</M>} />
      {cfg && <CenterMsg action={cfg.action} onAction={() => go('media', 'ready')}
        hero={state === 'permission' && <img src={LOGO} width="52" height="52" alt="" style={{ opacity: .9 }} />}>{cfg.msg}</CenterMsg>}
      {state === 'loading' && (
        <div style={{ flex: 1, padding: '4px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, alignContent: 'start' }}>
          {Array.from({ length: 12 }, (_, i) => <div key={i} style={{ aspectRatio: '1', borderRadius: 8, background: 'var(--tc-bone-08)' }} />)}
        </div>
      )}
      {isGrid && (
        <div style={{ flex: 1, overflow: 'hidden', padding: '4px 20px 0' }}>
          {state === 'limited' && (
            <button style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--tc-panel)', border: 'none', borderRadius: 8, padding: '13px 14px', marginBottom: 10, cursor: 'pointer', color: 'var(--tc-bone)', fontFamily: 'var(--font-body)', fontSize: 14 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M7 1v12M1 7h12" stroke="var(--tc-cool)" strokeWidth="1.8" strokeLinecap="round"/></svg>
              Select more photos
            </button>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {items.map((it) => (
              <div key={it.i} onClick={it.type === 'video' && it.selected ? () => go('trim', 'default') : undefined} style={{ cursor: 'pointer' }}>
                <MediaTile src={IMG(it.s)} type={it.type || 'photo'} duration={it.dur} size="100%"
                  style={{ aspectRatio: '1', height: 'auto' }} order={it.order} selected={it.selected}
                  dimmed={it.dimmed} unavailable={it.unavailable} />
              </div>
            ))}
          </div>
        </div>
      )}
      {isGrid && (
        <div style={{ padding: '14px 20px 34px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {state === 'browsing' && <InlineHint>Pick at least 3 items.</InlineHint>}
          <Button full disabled={!canContinue} onClick={() => go('recommended', 'default')}>Continue</Button>
        </div>
      )}
      {state === 'cap' && <ToastAt>You can add up to 30 items.</ToastAt>}
      {state === 'videocap' && <ToastAt>You can add up to 15 video clips.</ToastAt>}
      {state === 'unavailable' && <ToastAt>This item couldn’t be downloaded and was skipped.</ToastAt>}
      {state === 'validating' && <>
        <div style={{ position: 'absolute', inset: 0, background: 'var(--surface-scrim)' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--tc-panel-2)', borderRadius: 8, padding: '14px 22px', fontSize: 14, boxShadow: '0 8px 24px rgba(0,0,0,.45)' }}>Preparing…</div>
        </div>
      </>}
      <HomeBar />
    </Screen>
  );
}

/* ---- 4 · Clip trim sheet ---- */
export function Trim({ go = () => {} }) {
  return (
    <div style={{ position: 'relative', width: 393, height: 852, flexShrink: 0 }} data-screen-label="Clip trim sheet">
      <MediaSelect state="trim" go={go} />
      <div style={{ position: 'absolute', inset: 0, background: 'var(--surface-scrim)' }} />
      <TrimSheet width={393} clipSrc={IMG('tv1', 700, 400)} inPoint="0:02.4" duration="0:12" inPct={18}
        onDone={() => go('media', 'ready')} style={{ position: 'absolute', bottom: 0, left: 0 }} />
    </div>
  );
}

/* ---- 5 · Recommended templates ---- */
export function Recommended({ go = () => {} }) {
  const fits = [TPLS[0], TPLS[3]], rest = [TPLS[1], TPLS[2], TPLS[4], TPLS[5]];
  return (
    <Screen label="Recommended templates">
      <StatusBar />
      <TopBar onBack={() => go('media', 'ready')} center={<M size={13}>9 items · 3 clips</M>} />
      <div style={{ flex: 1, overflow: 'hidden', padding: '8px 20px 0' }}>
        <Label style={{ marginBottom: 12 }}>Made for <span style={{ fontFamily: 'var(--font-data)' }}>9</span> items</Label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {fits.map((t) => (
            <div key={t.name} onClick={() => go('preview', 'default')} style={{ cursor: 'pointer' }}>
              <TemplateCard width="100%" name={t.name} bpm={t.bpm} items={t.items} seed={t.seed} src={IMG(t.img, 340, 500)} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 12px' }}>
          <Label>Also works</Label><div style={{ flex: 1, height: 1, background: 'var(--tc-bone-12)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {rest.map((t) => (
            <div key={t.name} onClick={() => go('preview', 'default')} style={{ cursor: 'pointer' }}>
              <TemplateCard width="100%" name={t.name} bpm={t.bpm} items={t.items} seed={t.seed} src={IMG(t.img, 340, 500)} />
            </div>
          ))}
        </div>
      </div>
      <HomeBar />
    </Screen>
  );
}

/* ---- 6 · Preview ---- */
export function Preview({ state = 'default', go = () => {} }) {
  const reduced = state === 'reduced';
  return (
    <Screen label={'Preview — ' + state}>
      <StatusBar />
      <TopBar onBack={() => go('recommended', 'default')} center={<M size={13} color="var(--tc-bone-55)">Night drive</M>} />
      <div style={{ position: 'relative', margin: '2px auto 0', height: 424, aspectRatio: '9/16', borderRadius: 8, overflow: 'hidden', background: '#1B1C1F' }}>
        <img src={IMG('reel', 540, 960)} alt="Reel preview" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', opacity: state === 'building' ? .55 : 1 }} />
        {(state === 'adjusted' || state === 'skipped') && (
          <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', justifyContent: 'center' }}>
            <Toast>{state === 'adjusted' ? 'This style needs a different number of items, so we adjusted it.' : 'One item was skipped because it\u2019s no longer available.'}</Toast>
          </div>
        )}
      </div>
      <div style={{ margin: '16px 20px 0' }}><BeatRuler height={40} seed={2} playing reduced={reduced} sweepDur={7.5} /></div>
      <div style={{ margin: '12px 20px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className={reduced ? '' : 'tc-anim-beat'} style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--tc-signal)', animation: reduced ? 'none' : 'tc-beat 0.469s infinite' }} />
          <M size={12}>Midnight Loop · Arjun Rao · 128 BPM</M>
        </div>
        <Label style={{ fontSize: 9 }}>Click preview</Label>
      </div>
      {state === 'retired' && <div style={{ margin: '12px 20px 0' }}><TrackNotice>That track isn’t available anymore. Here’s a similar one.</TrackNotice></div>}
      <div style={{ display: 'flex', gap: 10, margin: (state === 'retired' ? '12px' : '16px') + ' 0 0 20px', overflow: 'hidden', flex: 1, minHeight: 0, alignItems: 'flex-start' }}>
        {TPLS.slice(0, 5).map((t, i) => (
          <div key={t.name} style={{ flexShrink: 0, width: 68 }}>
            <div style={{ aspectRatio: '9/16', borderRadius: 6, overflow: 'hidden', background: '#1B1C1F', border: i === 0 ? '2px solid var(--tc-cool)' : '1px solid var(--tc-bone-08)', boxSizing: 'border-box' }}>
              <img src={IMG(t.img, 140, 250)} alt={t.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 10, color: i === 0 ? 'var(--tc-cool)' : 'var(--tc-bone-55)', marginTop: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '14px 20px 34px' }}>
        <Button variant="secondary" style={{ flex: 1 }}>Shuffle order</Button>
        <Button style={{ flex: 1.2 }} onClick={() => go('export', 'rendering')}>Export</Button>
      </div>
      <HomeBar />
    </Screen>
  );
}

/* ---- 7 · Export (a sheet, not a screen) ---- */
export function Export({ state = 'rendering', pct = 47, go = () => {} }) {
  const R = 42, C = 2 * Math.PI * R;
  const body = { fontSize: 15, lineHeight: 1.55, color: 'var(--tc-bone)', textAlign: 'center', textWrap: 'pretty', maxWidth: 300 };
  const content = {
    preparing: <>
      <div style={{ ...body, color: 'var(--tc-bone-70)' }}>Getting your media ready</div>
    </>,
    rendering: <>
      <div style={{ position: 'relative', width: 100, height: 100 }}>
        <svg width="100" height="100" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--tc-bone-12)" strokeWidth="5" />
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--tc-signal)" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={(pct / 100) * C + ' ' + C} transform="rotate(-90 50 50)" />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><M size={18} weight={600}>{pct}%</M></div>
      </div>
      <div style={body}>Rendering your reel.</div>
      <Button variant="destructive" small onClick={() => go('preview', 'default')}>Cancel</Button>
    </>,
    storage: <>
      <div style={body}>Not enough storage. Free up about <M size={14}>200 MB</M> and try again.</div>
      <Button variant="secondary" small>Retry</Button>
    </>,
    memory: <div style={body}>This reel is too heavy for your phone. Try using fewer video clips.</div>,
    interrupted: <>
      <div style={body}>Your reel didn’t finish because the app went to the background. Keep ThumpCut open while it renders.</div>
      <Button variant="secondary" small>Retry</Button>
    </>,
    failed: <>
      <div style={body}>Something went wrong making your reel. Please try again.</div>
      <Button variant="secondary" small>Retry</Button>
    </>,
  }[state];
  return (
    <div style={{ position: 'relative', width: 393, height: 852, flexShrink: 0 }} data-screen-label={'Export — ' + state}>
      <Preview go={go} />
      <div style={{ position: 'absolute', inset: 0, background: 'var(--surface-scrim)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--tc-panel)', borderRadius: '8px 8px 0 0', padding: '10px 24px 40px', boxShadow: '0 -12px 40px rgba(0,0,0,.5)' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--tc-bone-12)', margin: '0 auto 24px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, minHeight: 150, justifyContent: 'center' }}>{content}</div>
      </div>
    </div>
  );
}

/* ---- 8 · Share ---- */
export function Share({ state = 'default', go = () => {} }) {
  const gone = state === 'filegone';
  return (
    <Screen label={'Share — ' + state}>
      <StatusBar />
      <TopBar onBack={() => go('preview', 'default')} center={<Display size={17}>Your reel</Display>} />
      {gone ? (
        <CenterMsg>That reel is no longer available. Please export again.</CenterMsg>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: 216, aspectRatio: '9/16', borderRadius: 8, overflow: 'hidden', background: '#1B1C1F' }}>
            <img src={IMG('reel', 432, 768)} alt="Finished reel" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10 }}><BeatRuler compressed beats={24} seed={2} /></div>
          </div>
        </div>
      )}
      {!gone && (
        <div style={{ padding: '0 20px 34px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {state !== 'noinstagram' && <Button full onClick={() => {}}>Share to Instagram</Button>}
          <Button full variant={state === 'noinstagram' ? 'primary' : 'secondary'}>Save to gallery</Button>
          <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--tc-bone-70)', textAlign: 'center', padding: '8px 12px 0', textWrap: 'pretty' }}>
            Pick your track in Instagram — you’ll get the full library.
          </div>
        </div>
      )}
      {state === 'handofffail' && <ToastAt bottom={228}>Couldn’t open Instagram. You can save the reel and share it manually.</ToastAt>}
      {state === 'saved' && <ToastAt bottom={228}>Saved to your gallery.</ToastAt>}
      <HomeBar />
    </Screen>
  );
}

/* ---- 9 · Settings ---- */
export function Settings({ go = () => {} }) {
  const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 16px', fontSize: 15 };
  const chev = <svg width="7" height="12" viewBox="0 0 7 12" aria-hidden="true"><path d="M1 1l5 5-5 5" stroke="var(--tc-bone-35)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  return (
    <Screen label="Settings">
      <StatusBar />
      <TopBar onBack={() => go('gallery', 'default')} center={<Display size={17}>Settings</Display>} />
      <div style={{ padding: '10px 20px 0' }}>
        <div style={{ background: 'var(--tc-panel)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={row}><span>Export quality</span><span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><M size={13} color="var(--tc-bone-55)">1080p</M>{chev}</span></div>
          <div style={{ height: 1, background: 'var(--tc-bone-08)', margin: '0 16px' }} />
          <div style={row}><span>Privacy policy</span>{chev}</div>
        </div>
        <div style={{ textAlign: 'center', marginTop: 28 }}><M size={12} color="var(--tc-bone-35)">ThumpCut 1.0.0 (214)</M></div>
      </div>
      <HomeBar />
    </Screen>
  );
}

/* Registry for boards + the interactive shell */
export const SCREEN_DEFS = [
  { id: 'launch', n: '01', title: 'First launch', comp: Launch,
    states: [['default', 'Default'], ['downloading', 'Downloading'], ['offline', 'Offline, nothing cached'], ['failed', 'Download failed'], ['storage', 'Storage full']] },
  { id: 'gallery', n: '02', title: 'Template gallery', comp: Gallery,
    states: [['default', 'Default'], ['cached', 'Partially cached — stills, never an empty box'], ['offline', 'Offline with cache — identical, no banner']] },
  { id: 'media', n: '03', title: 'Media selection', comp: MediaSelect,
    states: [['permission', 'Permission unknown'], ['denied', 'Permission denied'], ['limited', 'Limited access (iOS)'], ['loading', 'Loading'], ['empty', 'Empty'], ['browsing', 'Fewer than 3 selected'], ['ready', 'Ready'], ['cap', 'Item cap reached'], ['videocap', 'Video cap — clips dim, photos stay live'], ['validating', 'Validating'], ['unavailable', 'Item unavailable']] },
  { id: 'trim', n: '04', title: 'Clip trim sheet', comp: Trim, states: [['default', 'Default — in-point pre-nudged']] },
  { id: 'recommended', n: '05', title: 'Recommended templates', comp: Recommended, states: [['default', 'Made for 9 items + Also works']] },
  { id: 'preview', n: '06', title: 'Preview', comp: Preview,
    states: [['default', 'Default — metronome click, not the song'], ['building', 'Building — dim, no spinner'], ['adjusted', 'Template adjusted'], ['skipped', 'Item skipped'], ['retired', 'Track retired'], ['reduced', 'Reduced motion']] },
  { id: 'export', n: '07', title: 'Export', comp: Export,
    states: [['preparing', 'Preparing'], ['rendering', 'Rendering'], ['storage', 'Not enough storage'], ['memory', 'Out of memory'], ['interrupted', 'Interrupted (iOS)'], ['failed', 'Failed']] },
  { id: 'share', n: '08', title: 'Share', comp: Share,
    states: [['default', 'Default'], ['noinstagram', 'Instagram not installed — button absent'], ['handofffail', 'Handoff failed'], ['saved', 'Saved'], ['filegone', 'File gone']] },
  { id: 'settings', n: '09', title: 'Settings', comp: Settings, states: [['default', 'Almost empty — that\u2019s the message']] },
];
