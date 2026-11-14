import type { ComponentType } from "react";
import { RaceConditionLab } from "./async-race-conditions/RaceConditionLab.tsx";
import { OptimisticUpdatesLab } from "./optimistic-updates/OptimisticUpdatesLab.tsx";

export const labViews: Record<string, ComponentType> = {
  "async-race-conditions": RaceConditionLab,
  "optimistic-updates": OptimisticUpdatesLab,
};
