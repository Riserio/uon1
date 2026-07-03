import { createContext, useContext, useMemo, useState } from "react";
import type { LayoutMode } from "../types";

interface LayoutSettings {
  layoutMode: LayoutMode;
  maxTiles: number;
  hideNoVideo: boolean;
  setLayoutMode: (m: LayoutMode) => void;
  setMaxTiles: (n: number) => void;
  setHideNoVideo: (v: boolean) => void;
}

const STORAGE_KEYS = {
  layout: "uon1-video-layout",
  maxTiles: "uon1-video-max-tiles",
  hideNoVideo: "uon1-video-hide-novideo",
} as const;

const LayoutSettingsContext = createContext<LayoutSettings | null>(null);

function readInitial(): Pick<LayoutSettings, "layoutMode" | "maxTiles" | "hideNoVideo"> {
  return {
    layoutMode: (localStorage.getItem(STORAGE_KEYS.layout) as LayoutMode) || "auto",
    maxTiles: parseInt(localStorage.getItem(STORAGE_KEYS.maxTiles) || "50", 10),
    hideNoVideo: localStorage.getItem(STORAGE_KEYS.hideNoVideo) === "true",
  };
}

export function LayoutSettingsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(readInitial);

  const value = useMemo<LayoutSettings>(
    () => ({
      ...state,
      setLayoutMode: (layoutMode) => {
        localStorage.setItem(STORAGE_KEYS.layout, layoutMode);
        setState((s) => ({ ...s, layoutMode }));
      },
      setMaxTiles: (maxTiles) => {
        localStorage.setItem(STORAGE_KEYS.maxTiles, String(maxTiles));
        setState((s) => ({ ...s, maxTiles }));
      },
      setHideNoVideo: (hideNoVideo) => {
        localStorage.setItem(STORAGE_KEYS.hideNoVideo, String(hideNoVideo));
        setState((s) => ({ ...s, hideNoVideo }));
      },
    }),
    [state],
  );

  return <LayoutSettingsContext.Provider value={value}>{children}</LayoutSettingsContext.Provider>;
}

export function useLayoutSettings(): LayoutSettings {
  const ctx = useContext(LayoutSettingsContext);
  // Fallback local caso seja usado fora do provider (mantém o componente utilizável isoladamente)
  const [state, setState] = useState(readInitial);
  const fallback = useMemo<LayoutSettings>(
    () => ({
      ...state,
      setLayoutMode: (layoutMode) => {
        localStorage.setItem(STORAGE_KEYS.layout, layoutMode);
        setState((s) => ({ ...s, layoutMode }));
      },
      setMaxTiles: (maxTiles) => {
        localStorage.setItem(STORAGE_KEYS.maxTiles, String(maxTiles));
        setState((s) => ({ ...s, maxTiles }));
      },
      setHideNoVideo: (hideNoVideo) => {
        localStorage.setItem(STORAGE_KEYS.hideNoVideo, String(hideNoVideo));
        setState((s) => ({ ...s, hideNoVideo }));
      },
    }),
    [state],
  );
  return ctx ?? fallback;
}
