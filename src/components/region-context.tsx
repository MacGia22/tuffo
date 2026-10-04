"use client";

import { createContext, useContext } from "react";
import type { Region } from "@/lib/region";

const RegionContext = createContext<Region | null>(null);

/** The pool's region, for pickers that list the equipment sold there first. */
export function RegionProvider({ region, children }: { region: Region | null; children: React.ReactNode }) {
  return <RegionContext.Provider value={region}>{children}</RegionContext.Provider>;
}

export function useRegion(): Region | null {
  return useContext(RegionContext);
}
