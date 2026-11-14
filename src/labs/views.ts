import type { ComponentType } from "react";
import { RaceConditionLab } from "./async-race-conditions/RaceConditionLab.tsx";
import { CacheLifetimeLab } from "./cache-lifetime/CacheLifetimeLab.tsx";
import { DebounceLab } from "./debouncing/DebounceLab.tsx";
import { CancellationLab } from "./request-cancellation/CancellationLab.tsx";
import { DeduplicationLab } from "./request-deduplication/DeduplicationLab.tsx";
import { RetryLab } from "./retries/RetryLab.tsx";

export const labViews: Record<string, ComponentType> = {
  "async-race-conditions": RaceConditionLab,
  debouncing: DebounceLab,
  "request-cancellation": CancellationLab,
  "cache-lifetime": CacheLifetimeLab,
  "request-deduplication": DeduplicationLab,
  retries: RetryLab,
};
