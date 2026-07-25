"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Redo2,
  Undo2,
  Upload
} from "lucide-react";
import type {
  PreviewizerMode,
  PreviewizerResult,
  PreviewizerSession,
  PreviewizerUploadPreview,
} from "@/lib/previewizer-session";
import { PreviewizerBlurPlugMinimap } from "./previewizer-blur-plug-minimap";
import { PreviewizerExportModal } from "./previewizer-export-modal";
import { PreviewizerMyTemplatesModal } from "./previewizer-my-templates-modal";
import { PreviewizerStudioCanvas } from "./previewizer-studio-canvas";
import { PreviewizerStudioSidebar, type StudioSidebarTab } from "./previewizer-studio-sidebar";
import { preloadPreviewizerFonts } from "./previewizer-fonts";
import {
  DEFAULT_TEMPLATE_OPTIONS,
  createGraphicLayerFromPreset,
  type DesignTemplateOptions
} from "./previewizer-design-templates";
import {
  applyCompositionTemplate,
  compositionAllowsAspectSwitch,
  DEFAULT_ACTIVE_COMPOSITION_ID,
  getCompositionFraming,
  getCompositionTemplateMeta,
  getCompositionVariantAspectKey,
  getCompositionVariantPatch,
  switchCompositionTemplate,
  updateBlurPlugStamp,
  type BlurPlugProps,
  type BlurPlugStampFont,
  type BlurPlugNsfwVariant,
  type BlurPlugEighteenVariant,
  BLUR_PLUG_QR_LAYER_ID,
  normalizeBlurPlugQrStamp,
  type CompositionPropsById,
  type CompositionTemplateId
} from "./previewizer-template-compositions";
import {
  applyOverlayDocument,
  createDefaultOverlayDocument,
  loadOverlayImage,
  type LogoBucketItem,
  type OverlayDocument
} from "./previewizer-overlay-layers";
import { compositeExportWithComposition, compositeExportWithGraphics } from "./previewizer-export-composite";
import { usePreviewizerUndo } from "./previewizer-undo";
import {
  ASPECT_OUTPUT,
  DEFAULT_SELECTION,
  PRESET_LABELS,
  applyExactSelectionCrop,
  applyPreset,
  reshapeSelectionToAspect,
  type AspectRatioKey,
  type NormalizedRect,
  type PresetId
} from "./previewizer-presets";
import { useStudioSession } from "@/lib/studio-session-context";
import {
  createPreviewTemplate,
  deletePreviewTemplate,
  fetchCreatorBlueskyCredential,
  fetchPatreonSyncState,
  fetchPreviewTemplates,
  type PreviewTemplateWire
} from "@/lib/relay-api";
import { previewizerDestinationQrPngDataUrl } from "@/lib/previewizer-destination-qr";
import {
  assemblePreviewizerLinkDestinations,
  compositionSupportsDestinationQr,
  defaultPreviewizerDestinationId,
  destinationDisplayPatch,
  findPreviewizerDestination,
  type PreviewizerLinkDestination,
  type PreviewizerLinkPlatformId
} from "@/lib/previewizer-link-destinations";
import {
  hydratePreviewTemplateConfig,
  MAX_CUSTOM_PREVIEW_TEMPLATES,
  serializePreviewTemplateConfig,
  tryHydratePreviewTemplateConfig,
  type PreviewTemplateHydratePatch
} from "@/lib/previewizer-template-config";

const ASPECT_KEYS: AspectRatioKey[] = ["1:1", "4:5", "9:16"];

const LINK_PLATFORM_IDS = new Set<string>([
  "patreon",
  "bluesky",
  "x",
  "instagram",
  "website",
  "custom"
]);

function asLinkPlatformId(raw: string | null): PreviewizerLinkPlatformId | null {
  if (!raw || !LINK_PLATFORM_IDS.has(raw)) return null;
  return raw as PreviewizerLinkPlatformId;
}

type StudioSnapshot = {
  overlayDoc: OverlayDocument;
  selection: NormalizedRect;
  preset: PresetId;
  aspectKey: AspectRatioKey;
  compositionId: CompositionTemplateId | null;
  compositionProps: CompositionPropsById[CompositionTemplateId] | null;
  compositionVariantIndex: number | null;
  templateOptions: DesignTemplateOptions;
};

function blankSnapshot(): StudioSnapshot {
  return {
    overlayDoc: createDefaultOverlayDocument(),
    selection: DEFAULT_SELECTION,
    preset: "tight_crop",
    aspectKey: "1:1",
    compositionId: null,
    compositionProps: null,
    compositionVariantIndex: null,
    templateOptions: { ...DEFAULT_TEMPLATE_OPTIONS }
  };
}

export type PreviewizerClientProps = {
  mode?: PreviewizerMode;
  session?: PreviewizerSession;
  onComplete?: (result: PreviewizerResult) => void | Promise<void>;
  onCancel?: () => void;
  /** Required in distribution mode when using “Use as preview”. */
  onUploadPreview?: PreviewizerUploadPreview;
};

export default function PreviewizerClient({
  mode = "standalone",
  session,
  onComplete,
  onCancel,
  onUploadPreview,
}: PreviewizerClientProps = {}) {
  const isDistribution = mode === "distribution";
  const isHostedSession = isDistribution;
  const { creatorId: studioCreatorId, ready: studioReadySession } = useStudioSession();
  const creatorId = session?.creatorId?.trim() || studioCreatorId;
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [studioReady, setStudioReady] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<StudioSidebarTab>("content");
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [selectedStampId, setSelectedStampId] = useState<string | null>(null);
  const [customLogos, setCustomLogos] = useState<LogoBucketItem[]>([]);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportPreviewUrl, setExportPreviewUrl] = useState<string | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [savedTemplates, setSavedTemplates] = useState<PreviewTemplateWire[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesListError, setTemplatesListError] = useState<string | null>(null);
  const [myTemplatesOpen, setMyTemplatesOpen] = useState(false);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);
  const [saveTemplateChecked, setSaveTemplateChecked] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState("");
  const [replaceTemplateId, setReplaceTemplateId] = useState<string | null>(null);
  const [templateSaveError, setTemplateSaveError] = useState<string | null>(null);
  const [templateSaveBusy, setTemplateSaveBusy] = useState(false);
  const [sourceLoading, setSourceLoading] = useState(Boolean(session?.sourceImageUrl));
  const [sourceLoadError, setSourceLoadError] = useState<string | null>(null);
  const [linkDestinations, setLinkDestinations] = useState<PreviewizerLinkDestination[]>(() =>
    assemblePreviewizerLinkDestinations({})
  );
  const [selectedDestinationId, setSelectedDestinationId] =
    useState<PreviewizerLinkPlatformId>("custom");
  const [customDestinationUrl, setCustomDestinationUrl] = useState("");
  const [qrSrc, setQrSrc] = useState<string | null>(null);
  const [destinationsLoading, setDestinationsLoading] = useState(false);
  const [detectedPatreonName, setDetectedPatreonName] = useState<string | null>(null);
  const [detectedBlueskyHandle, setDetectedBlueskyHandle] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportCanvasRef = useRef<HTMLCanvasElement>(null);

  const undo = usePreviewizerUndo<StudioSnapshot>(blankSnapshot());
  const {
    overlayDoc,
    selection,
    preset,
    aspectKey,
    compositionId,
    compositionProps,
    compositionVariantIndex,
    templateOptions
  } = undo.present;

  const outputSize = ASPECT_OUTPUT[aspectKey];
  const revealActive =
    compositionId === "blur_plug" &&
    Boolean(compositionProps) &&
    (compositionProps as BlurPlugProps | null)?.revealShape !== "none";
  const [revealDrawerCollapsed, setRevealDrawerCollapsed] = useState(false);
  const [revealDrawerOffsetTop, setRevealDrawerOffsetTop] = useState(12);
  const revealDrawerColRef = useRef<HTMLDivElement>(null);
  const revealDrawerExpanded = revealActive && !revealDrawerCollapsed;

  useEffect(() => {
    if (!revealActive) setRevealDrawerCollapsed(false);
  }, [revealActive]);

  useLayoutEffect(() => {
    if (!revealActive) return;

    const measure = () => {
      const anchor = document.querySelector("[data-previewizer-reveal-anchor]");
      const col = revealDrawerColRef.current;
      if (!anchor || !col) return;
      const a = anchor.getBoundingClientRect();
      const c = col.getBoundingClientRect();
      setRevealDrawerOffsetTop(Math.max(8, Math.round(a.top - c.top)));
    };

    measure();
    const scrollEl = document.querySelector("[data-previewizer-sidebar-scroll]");
    scrollEl?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const ro = new ResizeObserver(measure);
    if (revealDrawerColRef.current) ro.observe(revealDrawerColRef.current);
    if (scrollEl) ro.observe(scrollEl);

    return () => {
      scrollEl?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      ro.disconnect();
    };
  }, [revealActive, sidebarTab, compositionId, compositionProps]);

  const commitComposition = useCallback(
    (applied: ReturnType<typeof applyCompositionTemplate>, label: string) => {
      const imgAspect =
        imageEl && imageEl.naturalHeight > 0
          ? imageEl.naturalWidth / imageEl.naturalHeight
          : 1;
      const selection =
        applied.compositionId === "blur_plug"
          ? reshapeSelectionToAspect(applied.selection, applied.aspectKey, imgAspect)
          : applied.selection;
      const dest = findPreviewizerDestination(linkDestinations, selectedDestinationId);
      const displayPatch =
        dest?.available && dest.displayText
          ? destinationDisplayPatch(applied.compositionId, dest.displayText)
          : null;
      const compositionProps = displayPatch
        ? ({
            ...applied.compositionProps,
            ...displayPatch
          } as CompositionPropsById[CompositionTemplateId])
        : applied.compositionProps;
      undo.setPresent(label, (prev) => ({
        overlayDoc: applied.overlayDoc,
        selection,
        preset: applied.preset,
        aspectKey: applied.aspectKey,
        compositionId: applied.compositionId,
        compositionProps,
        compositionVariantIndex: 0,
        templateOptions: {
          ...prev.templateOptions,
          ...(displayPatch?.platformUrl
            ? { platformUrl: displayPatch.platformUrl }
            : displayPatch?.handle
              ? { platformUrl: displayPatch.handle }
              : {})
        }
      }));
      setSelectedLayerId(null);
      setSelectedStampId(null);
    },
    [imageEl, undo, linkDestinations, selectedDestinationId]
  );

  const setOverlayDoc = useCallback(
    (updater: OverlayDocument | ((prev: OverlayDocument) => OverlayDocument), trackUndo = true) => {
      const apply = (prev: StudioSnapshot) => ({
        ...prev,
        overlayDoc: typeof updater === "function" ? updater(prev.overlayDoc) : updater
      });
      if (trackUndo) undo.setPresent("Edit layers", apply);
      else undo.mutatePresent(apply);
    },
    [undo]
  );

  const updateTemplateOptions = useCallback(
    (patch: Partial<DesignTemplateOptions>) => {
      undo.setPresent("Update options", (prev) => ({
        ...prev,
        templateOptions: { ...prev.templateOptions, ...patch }
      }));
    },
    [undo]
  );

  const updateCompositionProps = useCallback(
    (patch: Partial<CompositionPropsById[CompositionTemplateId]>) => {
      if (!compositionId || !compositionProps) return;
      undo.setPresent("Edit content", (prev) => {
        if (!prev.compositionId || !prev.compositionProps) return prev;
        return {
          ...prev,
          compositionProps: {
            ...prev.compositionProps,
            ...patch
          } as CompositionPropsById[CompositionTemplateId],
          compositionVariantIndex: null
        };
      });
    },
    [compositionId, compositionProps, undo]
  );

  useEffect(() => {
    if (!studioReadySession || !creatorId) return;
    let cancelled = false;
    setDestinationsLoading(true);
    void (async () => {
      try {
        const [sync, bluesky] = await Promise.all([
          fetchPatreonSyncState(creatorId).catch(() => null),
          fetchCreatorBlueskyCredential().catch(() => ({ credential: null }))
        ]);
        if (cancelled) return;
        const patreonName = sync?.campaign_display?.patreon_name?.trim() || null;
        const blueskyHandle = bluesky.credential?.handle?.trim() || null;
        setDetectedPatreonName(patreonName);
        setDetectedBlueskyHandle(blueskyHandle);
        const next = assemblePreviewizerLinkDestinations({
          patreonName,
          blueskyHandle,
          customUrl: customDestinationUrl
        });
        setLinkDestinations(next);
        setSelectedDestinationId((prev) => {
          const stillOk = next.find((d) => d.id === prev && d.available);
          if (stillOk) return prev;
          return defaultPreviewizerDestinationId(next);
        });
      } finally {
        if (!cancelled) setDestinationsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load on creator identity
  }, [studioReadySession, creatorId]);

  useEffect(() => {
    setLinkDestinations(
      assemblePreviewizerLinkDestinations({
        patreonName: detectedPatreonName,
        blueskyHandle: detectedBlueskyHandle,
        customUrl: customDestinationUrl
      })
    );
  }, [detectedPatreonName, detectedBlueskyHandle, customDestinationUrl]);

  const applyDestinationToComposition = useCallback(
    (destinationId: PreviewizerLinkPlatformId, destinations = linkDestinations) => {
      const dest = findPreviewizerDestination(destinations, destinationId);
      if (!dest?.available || !dest.displayText) return;
      const patch = destinationDisplayPatch(compositionId, dest.displayText);
      undo.setPresent("Update destination", (prev) => {
        const withOptions = {
          ...prev,
          templateOptions: { ...prev.templateOptions, platformUrl: dest.displayText }
        };
        if (!patch || !prev.compositionId || !prev.compositionProps) return withOptions;
        return {
          ...withOptions,
          compositionProps: {
            ...prev.compositionProps,
            ...patch
          } as CompositionPropsById[CompositionTemplateId]
        };
      });
    },
    [compositionId, linkDestinations, undo]
  );

  const selectLinkDestination = useCallback(
    (id: PreviewizerLinkPlatformId) => {
      setSelectedDestinationId(id);
      if (id !== "custom") {
        applyDestinationToComposition(id);
      }
    },
    [applyDestinationToComposition]
  );

  useEffect(() => {
    let href = "";
    if (selectedDestinationId === "custom") {
      href =
        findPreviewizerDestination(
          assemblePreviewizerLinkDestinations({ customUrl: customDestinationUrl }),
          "custom"
        )?.href ?? "";
    } else {
      const dest = findPreviewizerDestination(linkDestinations, selectedDestinationId);
      if (dest?.available) href = dest.href;
    }
    if (!href || !compositionSupportsDestinationQr(compositionId)) {
      setQrSrc(null);
      return;
    }
    let cancelled = false;
    void previewizerDestinationQrPngDataUrl(href)
      .then((dataUrl) => {
        if (!cancelled) setQrSrc(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [linkDestinations, selectedDestinationId, customDestinationUrl, compositionId]);

  const refreshSavedTemplates = useCallback(async () => {
    if (!isHostedSession || !creatorId) return;
    setTemplatesLoading(true);
    setTemplatesListError(null);
    try {
      const { templates } = await fetchPreviewTemplates();
      setSavedTemplates(templates);
    } catch (e) {
      setTemplatesListError(e instanceof Error ? e.message : String(e));
    } finally {
      setTemplatesLoading(false);
    }
  }, [isHostedSession, creatorId]);

  useEffect(() => {
    if (!isHostedSession || !creatorId || !studioReadySession) return;
    void refreshSavedTemplates();
  }, [isHostedSession, creatorId, studioReadySession, refreshSavedTemplates]);

  useEffect(() => {
    if (!exportModalOpen || !isHostedSession) return;
    void refreshSavedTemplates();
  }, [exportModalOpen, isHostedSession, refreshSavedTemplates]);

  const buildCurrentTemplateConfig = useCallback(() => {
    return serializePreviewTemplateConfig(
      {
        preset,
        aspectKey,
        compositionId,
        compositionProps,
        compositionVariantIndex,
        overlayDoc,
        templateOptions
      },
      {
        selectedDestinationId,
        customDestinationUrl: customDestinationUrl.trim() || null
      }
    );
  }, [
    preset,
    aspectKey,
    compositionId,
    compositionProps,
    compositionVariantIndex,
    overlayDoc,
    templateOptions,
    selectedDestinationId,
    customDestinationUrl
  ]);

  const persistTemplateIfRequested = useCallback(async (): Promise<boolean> => {
    if (!isHostedSession || !saveTemplateChecked) return true;
    const name = saveTemplateName.trim();
    if (!name) {
      setTemplateSaveError("Enter a template name.");
      return false;
    }
    if (savedTemplates.length >= MAX_CUSTOM_PREVIEW_TEMPLATES && !replaceTemplateId) {
      setTemplateSaveError("Pick a template slot to replace.");
      return false;
    }
    setTemplateSaveBusy(true);
    setTemplateSaveError(null);
    try {
      await createPreviewTemplate({
        name,
        config: buildCurrentTemplateConfig(),
        replace_template_id: replaceTemplateId
      });
      await refreshSavedTemplates();
      setSaveTemplateChecked(false);
      setSaveTemplateName("");
      setReplaceTemplateId(null);
      return true;
    } catch (e) {
      setTemplateSaveError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setTemplateSaveBusy(false);
    }
  }, [
    isHostedSession,
    saveTemplateChecked,
    saveTemplateName,
    savedTemplates.length,
    replaceTemplateId,
    buildCurrentTemplateConfig,
    refreshSavedTemplates
  ]);

  const applyHydratePatch = useCallback(
    (patch: PreviewTemplateHydratePatch, historyLabel: string) => {
      setApplyNotice(null);
      undo.setPresent(historyLabel, (prev) => ({
        ...prev,
        preset: patch.preset,
        aspectKey: patch.aspectKey,
        compositionId: patch.compositionId,
        compositionProps: patch.compositionProps,
        compositionVariantIndex: patch.compositionVariantIndex,
        overlayDoc: patch.overlayDoc,
        templateOptions: patch.templateOptions
        // selection intentionally unchanged
      }));
      setSelectedLayerId(null);
      setSelectedStampId(null);

      const destId = asLinkPlatformId(patch.destination.selectedDestinationId);
      if (destId === "custom") {
        setCustomDestinationUrl(patch.destination.customDestinationUrl ?? "");
        setSelectedDestinationId("custom");
      } else if (destId) {
        const live = findPreviewizerDestination(linkDestinations, destId);
        if (!live?.available) {
          setApplyNotice(
            `Template applied, but ${destId} isn’t linked — pick a destination for the QR.`
          );
        }
        setSelectedDestinationId(destId);
        // Do not call applyDestinationToComposition — keeps sticky handle/label text.
      }
    },
    [undo, linkDestinations]
  );

  const applySavedTemplate = useCallback(
    (template: PreviewTemplateWire) => {
      setApplyingTemplateId(template.template_id);
      setApplyNotice(null);
      try {
        const patch = hydratePreviewTemplateConfig(template.config);
        applyHydratePatch(patch, `Apply template: ${template.name}`);
        setMyTemplatesOpen(false);
      } catch (e) {
        setTemplatesListError(e instanceof Error ? e.message : String(e));
      } finally {
        setApplyingTemplateId(null);
      }
    },
    [applyHydratePatch]
  );

  const deleteSavedTemplate = useCallback(
    async (template: PreviewTemplateWire) => {
      setDeletingTemplateId(template.template_id);
      setTemplatesListError(null);
      try {
        await deletePreviewTemplate(template.template_id);
        await refreshSavedTemplates();
      } catch (e) {
        setTemplatesListError(e instanceof Error ? e.message : String(e));
      } finally {
        setDeletingTemplateId(null);
      }
    },
    [refreshSavedTemplates]
  );

  const resetActiveComposition = useCallback(() => {
    if (!compositionId) return;
    commitComposition(switchCompositionTemplate(compositionId), "Reset template");
  }, [commitComposition, compositionId]);

  const resetCompositionFraming = useCallback(() => {
    if (!compositionId) return;
    const framing = getCompositionFraming(compositionId);
    const imgAspect =
      imageEl && imageEl.naturalHeight > 0
        ? imageEl.naturalWidth / imageEl.naturalHeight
        : 1;
    undo.setPresent("Reset framing", (prev) => ({
      ...prev,
      preset: framing.preset,
      selection:
        compositionId === "blur_plug"
          ? reshapeSelectionToAspect(framing.selection, prev.aspectKey, imgAspect)
          : framing.selection
    }));
  }, [compositionId, imageEl, undo]);

  const selectCompositionVariant = useCallback(
    (variantIndex: number) => {
      if (!compositionId) return;
      undo.setPresent("Apply text preset", (prev) => {
        if (!prev.compositionId || !prev.compositionProps) return prev;
        const nextAspect = getCompositionVariantAspectKey(prev.compositionId, variantIndex);
        const imgAspect =
          imageEl && imageEl.naturalHeight > 0
            ? imageEl.naturalWidth / imageEl.naturalHeight
            : 1;
        return {
          ...prev,
          compositionProps: {
            ...prev.compositionProps,
            ...getCompositionVariantPatch(prev.compositionId, variantIndex)
          } as CompositionPropsById[CompositionTemplateId],
          compositionVariantIndex: variantIndex,
          ...(nextAspect
            ? {
                aspectKey: nextAspect,
                selection:
                  prev.compositionId === "blur_plug"
                    ? reshapeSelectionToAspect(prev.selection, nextAspect, imgAspect)
                    : prev.selection
              }
            : {})
        };
      });
    },
    [compositionId, imageEl, undo]
  );

  const changeAspect = useCallback(
    (nextAspect: AspectRatioKey) => {
      if (!compositionAllowsAspectSwitch(compositionId)) return;
      undo.setPresent("Change aspect", (prev) => {
        const imgAspect =
          imageEl && imageEl.naturalHeight > 0
            ? imageEl.naturalWidth / imageEl.naturalHeight
            : 1;
        return {
          ...prev,
          aspectKey: nextAspect,
          selection:
            prev.compositionId === "blur_plug"
              ? reshapeSelectionToAspect(prev.selection, nextAspect, imgAspect)
              : prev.selection
        };
      });
    },
    [compositionId, imageEl, undo]
  );

  const changePreset = useCallback(
    (nextPreset: PresetId) => {
      if (compositionId) return;
      undo.setPresent("Change preset", (prev) => ({ ...prev, preset: nextPreset }));
    },
    [compositionId, undo]
  );

  const changeSelection = useCallback(
    (sel: NormalizedRect, trackUndo = true) => {
      const apply = (prev: StudioSnapshot) => ({ ...prev, selection: sel });
      if (trackUndo) undo.setPresent("Reframe", apply);
      else undo.mutatePresent(apply);
    },
    [undo]
  );

  const commitCanvasEdit = useCallback(() => {
    undo.setPresent("Canvas edit", (p) => ({ ...p }));
  }, [undo]);

  const moveStampLive = useCallback(
    (id: string, x: number, y: number) => {
      undo.mutatePresent((prev) => {
        if (prev.compositionId !== "blur_plug" || !prev.compositionProps) return prev;
        const props = prev.compositionProps as BlurPlugProps;
        if (id === BLUR_PLUG_QR_LAYER_ID) {
          const qrStamp = normalizeBlurPlugQrStamp(props.qrStamp);
          return {
            ...prev,
            compositionProps: {
              ...props,
              qrStamp: { ...qrStamp, x, y }
            } as CompositionPropsById[CompositionTemplateId]
          };
        }
        return {
          ...prev,
          compositionProps: {
            ...props,
            stamps: updateBlurPlugStamp(props.stamps ?? [], id, { x, y })
          } as CompositionPropsById[CompositionTemplateId]
        };
      });
    },
    [undo]
  );

  const patchStampLive = useCallback(
    (
      id: string,
      patch: Partial<{
        size: number;
        rotation: number;
        font: BlurPlugStampFont;
        variant: BlurPlugNsfwVariant | BlurPlugEighteenVariant;
      }>
    ) => {
      const apply = (prev: typeof undo.present) => {
        if (prev.compositionId !== "blur_plug" || !prev.compositionProps) return prev;
        const props = prev.compositionProps as BlurPlugProps;
        return {
          ...prev,
          compositionProps: {
            ...props,
            stamps: updateBlurPlugStamp(props.stamps ?? [], id, patch)
          } as CompositionPropsById[CompositionTemplateId]
        };
      };
      // Discrete font/variant picks need an undoable commit — mutate+commit in the same tick
      // used to wipe the change via a stale present snapshot.
      if (patch.font !== undefined || patch.variant !== undefined) {
        undo.setPresent(patch.variant !== undefined ? "Stamp style" : "Stamp font", apply);
        return;
      }
      undo.mutatePresent(apply);
    },
    [undo]
  );

  const addGraphicLayer = useCallback(
    (graphicId: import("./previewizer-v0-promo-graphics").PromoGraphicId) => {
      const layer = createGraphicLayerFromPreset(graphicId, aspectKey, templateOptions);
      setOverlayDoc((prev) => ({
        ...prev,
        graphicLayers: [...(prev.graphicLayers ?? []), layer]
      }));
      setSelectedLayerId(layer.id);
    },
    [aspectKey, setOverlayDoc, templateOptions]
  );


  // Generation token so superseded mounts (effect cleanup / newer load) ignore late onload.
  const imageMountGenRef = useRef(0);
  /** AUT-VS6-T01 — apply session.initialTemplateConfig once after source mount. */
  const initialTemplateAppliedRef = useRef(false);
  const replaceSnapshot = undo.replace;

  const mountImageFromUrl = useCallback(
    (url: string, revokeOnReplace: boolean) => {
      const gen = ++imageMountGenRef.current;
      setImageUrl((prev) => {
        if (prev && revokeOnReplace) URL.revokeObjectURL(prev);
        return url;
      });
      const img = new Image();
      img.onload = () => {
        if (gen !== imageMountGenRef.current) return;
        setImageEl(img);
        setSourceLoading(false);
        // Always land in Blur Plug — other compositions stay registered but unplugged from entry.
        const applied = switchCompositionTemplate(DEFAULT_ACTIVE_COMPOSITION_ID);
        const imgAspect =
          img.naturalHeight > 0 ? img.naturalWidth / img.naturalHeight : 1;
        replaceSnapshot(
          {
            overlayDoc: applied.overlayDoc,
            selection: reshapeSelectionToAspect(
              applied.selection,
              applied.aspectKey,
              imgAspect
            ),
            preset: applied.preset,
            aspectKey: applied.aspectKey,
            compositionId: applied.compositionId,
            compositionProps: applied.compositionProps,
            compositionVariantIndex: 0,
            templateOptions: { ...DEFAULT_TEMPLATE_OPTIONS }
          },
          true
        );
        setStudioReady(true);
        setSidebarTab("content");
      };
      img.onerror = () => {
        if (gen !== imageMountGenRef.current) return;
        setSourceLoading(false);
        setSourceLoadError("Could not load the post image.");
      };
      img.src = url;
    },
    [replaceSnapshot]
  );

  const loadFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      setSourceLoadError(null);
      mountImageFromUrl(URL.createObjectURL(file), true);
    },
    [mountImageFromUrl]
  );

  const loadFromUrl = useCallback(
    async (url: string) => {
      setSourceLoadError(null);
      setSourceLoading(true);
      // no-store: defense if a no-cors <img> ever shared this URL under a cross-origin base
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        throw new Error(`Could not load post image (${res.status}).`);
      }
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) {
        throw new Error("Post media is not an image.");
      }
      mountImageFromUrl(URL.createObjectURL(blob), true);
    },
    [mountImageFromUrl]
  );

  // loadFromUrl is stable (depends on undo.replace only). Including it here is safe;
  // previously depending on the whole undo object re-fired this on every studio edit.
  useEffect(() => {
    const sourceUrl = session?.sourceImageUrl;
    if (!sourceUrl) return;
    initialTemplateAppliedRef.current = false;
    let cancelled = false;
    void loadFromUrl(sourceUrl).catch((e) => {
      if (cancelled) return;
      setSourceLoading(false);
      setSourceLoadError(e instanceof Error ? e.message : String(e));
    });
    return () => {
      cancelled = true;
      imageMountGenRef.current += 1;
    };
  }, [session?.sourceImageUrl, loadFromUrl]);

  // Optional Automations / approval preload: after mount crop is set, apply layout once.
  useEffect(() => {
    if (!studioReady || !imageEl) return;
    const config = session?.initialTemplateConfig;
    if (!config || initialTemplateAppliedRef.current) return;
    initialTemplateAppliedRef.current = true;
    const hydrated = tryHydratePreviewTemplateConfig(config);
    if (!hydrated.ok) {
      setApplyNotice(
        "Saved template snapshot could not be applied — studio defaults kept. You can pick a template from My Templates."
      );
      return;
    }
    applyHydratePatch(hydrated.patch, "Apply saved template snapshot");
  }, [
    studioReady,
    imageEl,
    session?.initialTemplateConfig,
    applyHydratePatch
  ]);

  useEffect(() => {
    void preloadPreviewizerFonts();
  }, []);

  useEffect(() => {
    if (compositionId && sidebarTab === "graphics") {
      setSidebarTab("content");
    }
  }, [compositionId, sidebarTab]);

  const [framedCompositionUrl, setFramedCompositionUrl] = useState<string | null>(null);

  useEffect(() => {
    // Pre-cropped frame for Blur Plug live preview + export (from imageEl, not blob URL).
    if (!imageEl || compositionId !== "blur_plug") {
      setFramedCompositionUrl(null);
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    applyExactSelectionCrop(ctx, imageEl, selection, outputSize);
    // PNG avoids JPEG mush on line art / flat color in the live overlay.
    setFramedCompositionUrl(canvas.toDataURL("image/png"));
  }, [imageEl, compositionId, selection, outputSize]);

  useEffect(() => {
    return () => {
      if (exportPreviewUrl) URL.revokeObjectURL(exportPreviewUrl);
    };
  }, [exportPreviewUrl]);

  const imageUrlRef = useRef<string | null>(null);
  useEffect(() => {
    imageUrlRef.current = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    return () => {
      const url = imageUrlRef.current;
      if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
    };
  }, []);

  const renderExportCanvas = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    if (!imageEl) return null;
    await preloadPreviewizerFonts();
    const canvas = exportCanvasRef.current ?? document.createElement("canvas");
    canvas.width = outputSize.width;
    canvas.height = outputSize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    if (compositionId === "blur_plug") {
      applyExactSelectionCrop(ctx, imageEl, selection, outputSize);
    } else {
      applyPreset(ctx, imageEl, preset, selection, aspectKey);
    }
    const logoImages = new Map<string, HTMLImageElement>();
    for (const layer of overlayDoc.logoLayers) {
      try {
        logoImages.set(layer.src, await loadOverlayImage(layer.src));
      } catch {
        /* skip */
      }
    }
    applyOverlayDocument(ctx, outputSize, overlayDoc, logoImages);
    if (compositionId && compositionProps) {
      return compositeExportWithComposition({
        baseCanvas: canvas,
        outputSize,
        compositionId,
        compositionProps,
        compositionImageSrc:
          compositionId === "blur_plug" ? imageUrl : null,
        compositionFocalX: 50,
        compositionFocalY: 50,
        compositionCropRect: compositionId === "blur_plug" ? selection : null,
        qrSrc
      });
    }
    if ((overlayDoc.graphicLayers?.length ?? 0) > 0) {
      return compositeExportWithGraphics({
        baseCanvas: canvas,
        overlayDoc,
        outputSize,
        platformId: templateOptions.platformId,
        titleText: templateOptions.titleText
      });
    }
    return canvas;
  }, [
    imageEl,
    outputSize,
    preset,
    selection,
    aspectKey,
    overlayDoc,
    templateOptions,
    compositionId,
    compositionProps,
    framedCompositionUrl,
    imageUrl,
    qrSrc
  ]);

  useEffect(() => {
    if (!exportModalOpen || !imageEl) return;
    let cancelled = false;
    void renderExportCanvas().then((canvas) => {
      if (cancelled || !canvas) return;
      canvas.toBlob(
        (blob) => {
          if (cancelled || !blob) return;
          setExportPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(blob);
          });
        },
        "image/jpeg",
        0.92
      );
    });
    return () => {
      cancelled = true;
    };
  }, [exportModalOpen, imageEl, renderExportCanvas]);

  async function downloadExport(format: "jpeg" | "png") {
    setExportBusy(true);
    setTemplateSaveError(null);
    try {
      const canvas = await renderExportCanvas();
      if (!canvas) return;
      const mime = format === "png" ? "image/png" : "image/jpeg";
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mime, format === "jpeg" ? 0.92 : undefined)
      );
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `previewizer-${compositionId ?? preset}-${aspectKey.replace(":", "x")}.${format === "png" ? "png" : "jpg"}`;
      a.click();
      URL.revokeObjectURL(a.href);
      // Non-blocking: download already succeeded; save failure stays in modal.
      if (isHostedSession && saveTemplateChecked) {
        await persistTemplateIfRequested();
      }
      if (!isHostedSession) setExportModalOpen(false);
    } finally {
      setExportBusy(false);
    }
  }

  async function completeHostedUpload() {
    if (!session || !onComplete || !onUploadPreview) return;
    setUploadBusy(true);
    setUploadError(null);
    setTemplateSaveError(null);
    try {
      const canvas = await renderExportCanvas();
      if (!canvas) throw new Error("Could not render preview.");
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.92)
      );
      if (!blob) throw new Error("Could not encode preview image.");

      const uploaded = await onUploadPreview(blob);
      const result: PreviewizerResult = { previewMediaId: uploaded.mediaId };

      // Template save is best-effort — never blocks attaching the preview.
      if (saveTemplateChecked) {
        await persistTemplateIfRequested();
      }

      await onComplete(result);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadBusy(false);
    }
  }

  const requestCancel = useCallback(() => {
    if (!onCancel) return;
    const dirty = studioReady && undo.canUndo;
    const confirmMsg = "Discard preview edits and return to distribution?";
    if (dirty && !window.confirm(confirmMsg)) {
      return;
    }
    onCancel();
  }, [onCancel, studioReady, undo.canUndo]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo.undo();
      }
      if (e.key === "z" && e.shiftKey) {
        e.preventDefault();
        undo.redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  }

  const templateLabel = compositionId ? getCompositionTemplateMeta(compositionId).label : null;

  return (
    <main className="previewizer-shell flex h-screen flex-col overflow-hidden bg-black text-[#f9fafb]">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[#1a1a1a] px-4 py-3 lg:px-6">
        <div className="flex min-w-0 items-center gap-4">
          {isHostedSession && onCancel ? (
            <button
              type="button"
              onClick={requestCancel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-sm text-[#9ca3af] hover:border-[#3a3a3a] hover:text-[#f9fafb]"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to distribution
            </button>
          ) : null}
          <div>
            <h1 className="text-base font-bold tracking-tight lg:text-lg">Previewizer</h1>
            <p className="hidden text-xs text-[#6b7280] sm:block">
              {isDistribution
                ? "Design a teaser for cross-post routing"
                : "Ad-ready overlays in seconds"}
            </p>
          </div>
          {!isHostedSession && studioReady ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-sm text-[#9ca3af] hover:border-[#3a3a3a] hover:text-[#f9fafb]"
            >
              Replace image
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          {studioReady ? (
            <>
              {isHostedSession ? (
                <button
                  type="button"
                  onClick={() => {
                    setTemplatesListError(null);
                    setMyTemplatesOpen(true);
                    void refreshSavedTemplates();
                  }}
                  className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-sm text-[#9ca3af] hover:border-[#3a3a3a] hover:text-[#f9fafb]"
                >
                  My templates
                  {savedTemplates.length > 0 ? (
                    <span className="ml-1.5 text-[#6b7280]">({savedTemplates.length})</span>
                  ) : null}
                </button>
              ) : null}
              {compositionAllowsAspectSwitch(compositionId) ? (
                <div className="flex rounded-lg border border-[#2a2a2a] p-0.5">
                  {ASPECT_KEYS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => changeAspect(k)}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                        aspectKey === k
                          ? "bg-[rgba(0,170,111,0.15)] text-[#9bf0c4]"
                          : "text-[#6b7280] hover:text-[#9ca3af]"
                      }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="rounded-lg border border-[#2a2a2a] px-3 py-1.5 text-sm text-[#6b7280]">
                  {aspectKey} locked
                </span>
              )}
              <div className="hidden items-center gap-1 sm:flex">
                <button
                  type="button"
                  disabled={!undo.canUndo}
                  onClick={() => undo.undo()}
                  className="rounded-lg border border-[#2a2a2a] p-2 text-[#9ca3af] disabled:opacity-40"
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={!undo.canRedo}
                  onClick={() => undo.redo()}
                  className="rounded-lg border border-[#2a2a2a] p-2 text-[#9ca3af] disabled:opacity-40"
                  title="Redo (Ctrl+Shift+Z)"
                >
                  <Redo2 className="h-4 w-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setUploadError(null);
                  setTemplateSaveError(null);
                  setExportModalOpen(true);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-[#00aa6f] px-4 py-2 text-sm font-bold text-black"
              >
                <Download className="h-4 w-4" />
                {isHostedSession ? "Export" : "Download"}
              </button>
            </>
          ) : null}
        </div>
      </header>

      {applyNotice ? (
        <div className="shrink-0 border-b border-[#2a2a2a] bg-[#111] px-4 py-2 text-xs text-[#9bf0c4]">
          {applyNotice}
          <button
            type="button"
            className="ml-3 text-[#6b7280] underline hover:text-[#9ca3af]"
            onClick={() => setApplyNotice(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) loadFile(f);
        }}
      />

      {!imageEl || !studioReady ? (
        <div className="flex flex-1 items-center justify-center p-6">
          {isHostedSession && sourceLoading ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#00aa6f]" aria-hidden />
              <p className="text-sm text-[#9ca3af]">Loading post image…</p>
            </div>
          ) : isHostedSession && sourceLoadError ? (
            <div className="max-w-md space-y-3 text-center">
              <p className="text-sm text-red-200">{sourceLoadError}</p>
              {onCancel ? (
                <button
                  type="button"
                  onClick={requestCancel}
                  className="rounded-xl border border-[#2a2a2a] px-4 py-2 text-sm text-[#f9fafb]"
                >
                  Back to distribution
                </button>
              ) : null}
            </div>
          ) : (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={onDrop}
              className="flex w-full max-w-lg flex-col items-center gap-4 rounded-2xl border border-dashed border-[#2a2a2a] bg-[#0a0a0a] px-8 py-16 text-center"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[rgba(0,170,111,0.25)] bg-[rgba(0,170,111,0.08)]">
                <Upload className="h-6 w-6 text-[#9bf0c4]" />
              </div>
              <div>
                <p className="text-base font-semibold text-[#f9fafb]">Drop an image to begin</p>
                <p className="mt-1 text-sm text-[#6b7280]">JPEG, PNG, WebP — processed locally</p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-xl bg-[#00aa6f] px-5 py-2.5 text-sm font-bold text-black"
              >
                Choose file
              </button>
            </div>
          )}
        </div>
      ) : (
        <div
          className={`grid min-h-0 flex-1 overflow-hidden transition-[grid-template-columns] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
            revealDrawerExpanded
              ? "grid-cols-[440px_240px_minmax(0,1fr)]"
              : revealActive
                ? "grid-cols-[440px_36px_minmax(0,1fr)]"
                : "grid-cols-[440px_0px_minmax(0,1fr)]"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <PreviewizerStudioSidebar
              tab={sidebarTab}
              imageUrl={imageUrl}
              compositionId={compositionId}
              compositionProps={compositionProps}
              compositionVariantIndex={compositionVariantIndex}
              templateOptions={templateOptions}
              aspectKey={aspectKey}
              preset={preset}
              selection={selection}
              customLogos={customLogos}
              outputWidth={outputSize.width}
              outputHeight={outputSize.height}
              selectedLayerId={selectedLayerId}
              selectedStampId={selectedStampId}
              overlayDoc={overlayDoc}
              onTabChange={setSidebarTab}
              onCompositionPropsChange={updateCompositionProps}
              onSelectCompositionVariant={selectCompositionVariant}
              onOptionsChange={updateTemplateOptions}
              onPresetChange={changePreset}
              onSelectionChange={changeSelection}
              onAddGraphic={addGraphicLayer}
              onCustomLogoAdded={(item) => setCustomLogos((prev) => [...prev, item])}
              onDocumentChange={setOverlayDoc}
              onSelectLayerId={setSelectedLayerId}
              onSelectStampId={setSelectedStampId}
              onResetComposition={resetActiveComposition}
              onResetCompositionFraming={resetCompositionFraming}
              onAspectChange={changeAspect}
              linkDestinations={linkDestinations}
              selectedDestinationId={selectedDestinationId}
              customDestinationUrl={customDestinationUrl}
              destinationsLoading={destinationsLoading}
              qrSrc={qrSrc}
              onSelectLinkDestination={selectLinkDestination}
              onCustomDestinationUrlChange={(url) => {
                setSelectedDestinationId("custom");
                setCustomDestinationUrl(url);
              }}
            />
          </div>

          <div
            ref={revealDrawerColRef}
            className={`min-h-0 overflow-hidden ${revealActive ? "border-r border-[#1a1a1a]" : ""}`}
          >
            {revealActive && compositionProps ? (
              revealDrawerExpanded ? (
                <div
                  className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto px-3 pb-3 animate-in fade-in slide-in-from-left-2 duration-200"
                  style={{ paddingTop: revealDrawerOffsetTop }}
                >
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-[#6b7280]">
                      Reveal placement
                    </p>
                    <button
                      type="button"
                      onClick={() => setRevealDrawerCollapsed(true)}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#2a2a2a] text-[#9ca3af] transition hover:border-[#3a3a3a] hover:text-[#f9fafb]"
                      aria-label="Collapse reveal placement"
                      title="Collapse"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  </div>
                  <PreviewizerBlurPlugMinimap
                    imageEl={imageEl}
                    aspectKey={aspectKey}
                    selection={selection}
                    blurProps={compositionProps as BlurPlugProps}
                    onSelectionChange={changeSelection}
                    onBlurPropsChange={(patch) => updateCompositionProps(patch)}
                    onInteractionEnd={commitCanvasEdit}
                    variant="drawer"
                  />
                </div>
              ) : (
                <div
                  className="flex h-full min-h-0 justify-center"
                  style={{ paddingTop: revealDrawerOffsetTop }}
                >
                  <button
                    type="button"
                    onClick={() => setRevealDrawerCollapsed(false)}
                    className="inline-flex h-9 w-7 items-center justify-center rounded-md border border-[#2a2a2a] bg-[#0a0a0a] text-[#9ca3af] transition hover:border-[#3a3a3a] hover:text-[#f9fafb]"
                    aria-label="Expand reveal placement"
                    title="Expand reveal placement"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )
            ) : null}
          </div>

          <div className="relative flex min-h-0 min-w-0 flex-1 items-start justify-center overflow-y-auto p-4">
            <PreviewizerStudioCanvas
              imageEl={imageEl}
              preset={preset}
              selection={selection}
              aspectKey={aspectKey}
              outputSize={outputSize}
              overlayDoc={overlayDoc}
              platformId={templateOptions.platformId}
              titleText={templateOptions.titleText}
              compositionId={compositionId}
              compositionProps={compositionProps}
              compositionImageSrc={
                compositionId === "blur_plug"
                  ? (framedCompositionUrl ?? imageUrl)
                  : framedCompositionUrl
              }
              compositionFocalX={50}
              compositionFocalY={50}
              compositionCropRect={
                compositionId === "blur_plug"
                  ? framedCompositionUrl
                    ? null
                    : selection
                  : null
              }
              activeTemplateLabel={templateLabel}
              selectedStampId={selectedStampId}
              onSelectStamp={setSelectedStampId}
              onStampMove={moveStampLive}
              onStampPatch={patchStampLive}
              onStampMoveEnd={commitCanvasEdit}
              qrSrc={qrSrc}
              onSelectionChange={(sel) => changeSelection(sel, false)}
              onInteractionEnd={commitCanvasEdit}
            />
          </div>
        </div>
      )}

      <PreviewizerExportModal
        open={exportModalOpen}
        previewUrl={exportPreviewUrl}
        outputLabel={`${outputSize.width}×${outputSize.height}px`}
        presetLabel={PRESET_LABELS[preset]}
        templateLabel={templateLabel}
        exportBusy={exportBusy}
        mode={mode}
        uploadBusy={uploadBusy}
        uploadError={uploadError}
        allowSaveTemplate={Boolean(isHostedSession && creatorId)}
        saveTemplateChecked={saveTemplateChecked}
        saveTemplateName={saveTemplateName}
        saveTemplateSlotsUsed={savedTemplates.length}
        saveTemplateOptions={savedTemplates.map((t) => ({
          template_id: t.template_id,
          name: t.name
        }))}
        replaceTemplateId={replaceTemplateId}
        templateSaveError={templateSaveError}
        templateSaveBusy={templateSaveBusy}
        onSaveTemplateCheckedChange={setSaveTemplateChecked}
        onSaveTemplateNameChange={setSaveTemplateName}
        onReplaceTemplateIdChange={setReplaceTemplateId}
        onClose={() => setExportModalOpen(false)}
        onDownload={downloadExport}
        onUseAsPreview={
          isHostedSession && onComplete && onUploadPreview
            ? () => void completeHostedUpload()
            : undefined
        }
      />

      <PreviewizerMyTemplatesModal
        open={myTemplatesOpen}
        templates={savedTemplates}
        loading={templatesLoading}
        error={templatesListError}
        applyingId={applyingTemplateId}
        deletingId={deletingTemplateId}
        onClose={() => setMyTemplatesOpen(false)}
        onApply={applySavedTemplate}
        onDelete={(tpl) => void deleteSavedTemplate(tpl)}
      />

      <canvas ref={exportCanvasRef} className="hidden" aria-hidden />
    </main>
  );
}
