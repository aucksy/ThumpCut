/**
 * The one place the app's moving parts are joined up.
 *
 * The rule that shapes this file is V4: **the preview and the export come from the same cut
 * list object.** If they were built separately the user would watch one edit and receive
 * another, and nothing would ever surface the difference.
 *
 * Everything below is wiring. Every rule worth testing lives in the modules this pulls
 * together, which is why they are all testable without a phone.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Constants from "expo-constants";
import { buildCutList, type CutList, type MediaItem } from "@thumpcut/cut-engine";
import { planPreviewAudio, samePlan, type PreviewAudioPlan } from "../audio/source.ts";
import {
  CatalogueService,
  createDeviceNetwork,
  createDeviceStorage,
  type BeatMap,
  type CatalogueSnapshot,
  type CatalogueTemplate,
  type CatalogueTrack,
} from "../catalogue/index.ts";
import {
  initialSelectionState,
  selectionReducer,
  selectionToMedia,
  type SelectionAction,
  type SelectionState,
} from "../media/selection.ts";
import { findSubstituteTrack, shuffleOrder } from "../templates/recommend.ts";

export interface AppState {
  catalogue: CatalogueSnapshot;
  selection: SelectionState;
  dispatchSelection: (action: SelectionAction) => void;

  templates: CatalogueTemplate[];
  tracks: CatalogueTrack[];

  selectedTemplate: CatalogueTemplate | null;
  selectedTrack: CatalogueTrack | null;
  beatMap: BeatMap | null;
  /** The single cut list the preview plays and the export renders. */
  cutList: CutList | null;
  media: MediaItem[];
  /** Whether the preview may stream the selected track, and why not when it may not. */
  audioPlan: PreviewAudioPlan;
  /** Shown once, then cleared. */
  notice: "none" | "adjusted" | "skipped" | "retired";

  loadCatalogue: () => Promise<void>;
  retryCatalogue: () => Promise<void>;
  chooseTemplate: (template: CatalogueTemplate) => Promise<void>;
  shuffle: () => void;
  clearNotice: () => void;
}

const AppContext = createContext<AppState | null>(null);

const EXTRA = Constants.expoConfig?.extra as
  | { catalogueUrl?: string; audioIndexUrl?: string }
  | undefined;
const CATALOGUE_URL = EXTRA?.catalogueUrl ?? "";
/**
 * Deliberately a different URL from the catalogue's, and deliberately not pinned to the build
 * commit. Instagram's audio links expire in about a day and a half; the song list must not
 * move after a build. See `AudioIndex` in the catalogue types.
 */
const AUDIO_INDEX_URL = EXTRA?.audioIndexUrl ?? "";

export function AppStateProvider({ children }: { children: ReactNode }) {
  const service = useRef(
    new CatalogueService({
      catalogueUrl: CATALOGUE_URL,
      audioIndexUrl: AUDIO_INDEX_URL,
      storage: createDeviceStorage(),
      network: createDeviceNetwork(),
    }),
  ).current;

  const [catalogue, setCatalogue] = useState<CatalogueSnapshot>(service.snapshot());
  const [selection, dispatchSelection] = useReducer(selectionReducer, initialSelectionState());
  const [selectedTemplate, setSelectedTemplate] = useState<CatalogueTemplate | null>(null);
  const [selectedTrack, setSelectedTrack] = useState<CatalogueTrack | null>(null);
  const [beatMap, setBeatMap] = useState<BeatMap | null>(null);
  const [cutList, setCutList] = useState<CutList | null>(null);
  const [audioPlan, setAudioPlan] = useState<PreviewAudioPlan>({
    kind: "click",
    reason: "no-entry",
  });
  const [notice, setNotice] = useState<AppState["notice"]>("none");
  const [shuffleSeed, setShuffleSeed] = useState(0);

  /** V2 — only one build at a time; an earlier one is abandoned rather than raced. */
  const buildToken = useRef(0);

  const media = useMemo(() => {
    const ordered = selectionToMedia(selection);
    return shuffleSeed === 0 ? ordered : shuffleOrder(ordered, shuffleSeed);
  }, [selection, shuffleSeed]);

  const loadCatalogue = useCallback(async () => {
    setCatalogue(await service.load());
  }, [service]);

  const retryCatalogue = useCallback(async () => {
    setCatalogue(await service.retry());
  }, [service]);

  const build = useCallback(
    async (template: CatalogueTemplate, track: CatalogueTrack, items: MediaItem[]) => {
      const token = ++buildToken.current;
      const map = await service.beatMapFor(track.trackId);
      if (token !== buildToken.current) return;

      if (!map) {
        // The track was retired between choosing it and using it. Substitute rather than
        // losing the user's work — the cut list is expressed in beats, so a same-tempo
        // replacement holds up.
        const substitute = findSubstituteTrack(
          catalogue.catalogue?.tracks ?? [],
          track.bpm,
          track.trackId,
        );
        if (!substitute) return;
        setNotice("retired");
        await build(template, substitute, items);
        return;
      }

      // On a cold start the index may not have landed yet. Fetching it here rather than
      // racing it means the preview knows whether it may stream *before* it starts playing,
      // instead of beginning on the click and switching a beat later for no reason.
      if (!service.audioIndex()) await service.refreshAudioIndex();
      if (token !== buildToken.current) return;

      setBeatMap(map);
      setSelectedTrack(track);
      setSelectedTemplate(template);
      // Same plan, same object — see `samePlan`. Tapping through five styles must not restart
      // the music five times for a track that never changed.
      const next = planPreviewAudio(service.audioIndex(), track, Date.now());
      setAudioPlan((current) => (samePlan(current, next) ? current : next));
      setCutList(buildCutList(map, items, template));
    },
    [catalogue.catalogue, service],
  );

  const chooseTemplate = useCallback(
    async (template: CatalogueTemplate) => {
      const track = selectedTrack ?? catalogue.catalogue?.tracks[0] ?? null;
      if (!track || media.length < 3) return;
      await build(template, track, media);
    },
    [build, catalogue.catalogue, media, selectedTrack],
  );

  const shuffle = useCallback(() => {
    setShuffleSeed((seed) => seed + 1);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      catalogue,
      selection,
      dispatchSelection,
      templates: catalogue.catalogue?.templates ?? [],
      tracks: catalogue.catalogue?.tracks ?? [],
      selectedTemplate,
      selectedTrack,
      beatMap,
      cutList,
      media,
      audioPlan,
      notice,
      loadCatalogue,
      retryCatalogue,
      chooseTemplate,
      shuffle,
      clearNotice: () => setNotice("none"),
    }),
    [
      audioPlan,
      beatMap,
      catalogue,
      chooseTemplate,
      cutList,
      loadCatalogue,
      media,
      notice,
      retryCatalogue,
      selectedTemplate,
      selectedTrack,
      selection,
      shuffle,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppState(): AppState {
  const value = useContext(AppContext);
  if (!value) throw new Error("useAppState was called outside AppStateProvider");
  return value;
}
