import type { ComponentType } from "react";
import { RaceConditionLab } from "./async-race-conditions/RaceConditionLab.tsx";

export const labViews: Record<string, ComponentType> = {
  "async-race-conditions": RaceConditionLab,
};
