export type SearchMode = "naive" | "protected";

/**
 * A settlement may update the UI only while the screen that issued it is still
 * current. Naive mode also accepts an older id. Protected mode accepts the
 * latest id only.
 */
export function settlementMayWrite(input: {
  mounted: boolean;
  responseEpoch: number;
  currentEpoch: number;
  mode: SearchMode;
  responseId: number;
  latestId: number;
}): boolean {
  return (
    input.mounted &&
    input.responseEpoch === input.currentEpoch &&
    (input.mode === "naive" || input.responseId === input.latestId)
  );
}
