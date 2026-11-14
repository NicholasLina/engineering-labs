import { act, render, screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { expect, test } from "vitest";
import { createManualClock, type ManualClock } from "./clock.ts";
import { RetryLab } from "./RetryLab.tsx";

function renderLab() {
  const clock = createManualClock();
  const view = render(<RetryLab clock={clock} />);
  return { clock, ...view };
}

function advance(clock: ManualClock, ms: number) {
  act(() => {
    clock.advance(ms);
  });
}

function attemptItems() {
  return within(screen.getByRole("region", { name: "Attempts" })).queryAllByRole("listitem");
}

function scheduledWait(): number {
  const waiting = screen.getByRole("region", { name: "Waiting" });
  const match = waiting.textContent?.match(/(\d+) ms/);
  if (!match?.[1]) {
    throw new Error(`No scheduled wait in "${waiting.textContent}"`);
  }
  return Number(match[1]);
}

async function openAdvanced(user: UserEvent) {
  const advanced = screen.getByRole("button", { name: "Advanced" });
  if (advanced.getAttribute("aria-expanded") !== "true") {
    await user.click(advanced);
  }
}

async function chooseMode(user: UserEvent, label: "No retry" | "Bounded backoff") {
  await openAdvanced(user);
  await user.click(screen.getByRole("button", { name: label }));
}

async function clickScenario(user: UserEvent, name: string) {
  const scenarios = screen.getByRole("group", { name: "Scenarios" });
  await user.click(within(scenarios).getByRole("button", { name }));
}

test("the idle example explains itself and keeps Advanced collapsed", async () => {
  renderLab();

  const definition = screen.getByText(/A retry is another attempt after a read fails/);
  const matters = screen.getByRole("region", { name: "Why this matters" });
  expect(definition.compareDocumentPosition(matters) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  );
  expect(matters).toHaveTextContent("3 total attempts");
  expect(matters).toHaveTextContent("200 ms");
  expect(matters).toHaveTextContent("400 ms");
  expect(screen.getByRole("region", { name: "How to handle it" }).textContent).toContain(
    "id !== current",
  );
  expect(screen.getByText(/idempotency/)).toBeInTheDocument();
  for (const title of ["Retrying writes", "Debouncing", "Cache lifetime", "In-flight duplicates"]) {
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(title).closest("a")).toBeNull();
  }

  expect(screen.getByRole("heading", { name: "Retries" })).toHaveAttribute("id", "retry-lab-title");
  expect(screen.getByRole("toolbar", { name: "Scenarios" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Example" })).toBeInTheDocument();
  expect(screen.getByText("Load", { selector: ".lab-example-bar" })).toBeInTheDocument();
  expect(screen.getByRole("searchbox", { name: "Query" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Load" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("No load has started yet.");
  expect(screen.getByText("Logical request none")).toBeInTheDocument();

  const explanation = screen.getByRole("region", { name: "Explanation" });
  expect(explanation).toHaveTextContent("No load has started yet.");
  expect(within(explanation).getByText("Request")).toBeInTheDocument();
  expect(within(explanation).getByText("Wait")).toBeInTheDocument();
  expect(within(explanation).getByText("Outcome")).toBeInTheDocument();
  expect(within(explanation).getAllByText("Attempts").length).toBeGreaterThan(0);
  expect(screen.getByRole("region", { name: "Waiting" })).toHaveTextContent("No retry is waiting.");
  expect(attemptItems()).toHaveLength(0);

  expect(screen.getByRole("button", { name: "Advanced" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: "Bounded backoff" })).not.toBeInTheDocument();
  expect(screen.queryByRole("switch", { name: "Jitter" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Success" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Clear" })).toHaveClass("ui-button-outline");
});

test("mode none stops Recover on the transient attempt", async () => {
  const user = userEvent.setup();
  const { clock } = renderLab();

  await clickScenario(user, "Recover");

  expect(screen.getByRole("searchbox", { name: "Query" })).toHaveValue("alpha");
  expect(screen.getByRole("status")).toHaveTextContent("Transient failure.");
  expect(screen.getByText("Logical request 1")).toBeInTheDocument();
  expect(attemptItems().map((item) => item.textContent)).toEqual(["Attempt 1, transient, alpha"]);
  expect(screen.getByRole("region", { name: "Waiting" })).toHaveTextContent("No retry is waiting.");

  advance(clock, 1000);
  expect(screen.getByRole("status")).toHaveTextContent("Transient failure.");
  expect(attemptItems()).toHaveLength(1);

  await clickScenario(user, "Clear");
  expect(screen.getByRole("status")).toHaveTextContent("No load has started yet.");
  expect(attemptItems()).toHaveLength(0);
  advance(clock, 1000);
  expect(attemptItems()).toHaveLength(0);
});

test("bounded backoff Recover loads alpha on the second attempt", async () => {
  const user = userEvent.setup();
  const { clock } = renderLab();

  await chooseMode(user, "Bounded backoff");
  expect(screen.getByRole("switch", { name: "Jitter" })).toHaveAttribute("aria-checked", "false");
  expect(screen.getByRole("button", { name: "Bounded backoff" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await clickScenario(user, "Recover");

  expect(screen.getByRole("status")).toHaveTextContent("Waiting 200 ms to retry alpha.");
  expect(scheduledWait()).toBe(200);
  expect(attemptItems()).toHaveLength(1);

  advance(clock, 200);
  expect(screen.getByRole("status")).toHaveTextContent("Loaded alpha");
  expect(attemptItems().map((item) => item.textContent)).toEqual([
    "Attempt 1, transient, alpha",
    "Attempt 2, success, alpha",
  ]);
  expect(screen.getByRole("region", { name: "Waiting" })).toHaveTextContent("No retry is waiting.");
});

test("the attempt limit stops after three transient attempts", async () => {
  const user = userEvent.setup();
  const { clock } = renderLab();

  await chooseMode(user, "Bounded backoff");
  await clickScenario(user, "Attempt limit");
  expect(attemptItems()).toHaveLength(1);

  advance(clock, 200);
  expect(attemptItems()).toHaveLength(2);
  expect(scheduledWait()).toBe(400);

  advance(clock, 400);
  expect(screen.getByRole("status")).toHaveTextContent("Transient failure.");
  expect(attemptItems().map((item) => item.textContent)).toEqual([
    "Attempt 1, transient, alpha",
    "Attempt 2, transient, alpha",
    "Attempt 3, transient, alpha",
  ]);

  advance(clock, 800);
  expect(attemptItems()).toHaveLength(3);
  expect(screen.getByRole("status")).toHaveTextContent("Transient failure.");
});

test("a permanent failure in backoff mode is not retried", async () => {
  const user = userEvent.setup();
  const { clock } = renderLab();

  await chooseMode(user, "Bounded backoff");
  await clickScenario(user, "Permanent");

  expect(screen.getByRole("status")).toHaveTextContent("Permanent failure.");
  expect(attemptItems().map((item) => item.textContent)).toEqual([
    "Attempt 1, permanent, alpha",
  ]);
  expect(screen.getByRole("region", { name: "Waiting" })).toHaveTextContent("No retry is waiting.");

  advance(clock, 200);
  expect(attemptItems()).toHaveLength(1);
  expect(screen.getByRole("status")).toHaveTextContent("Permanent failure.");
});

test("Supersede shows beta immediately and the old retry does not continue", async () => {
  const user = userEvent.setup();
  const { clock } = renderLab();

  await chooseMode(user, "Bounded backoff");
  await clickScenario(user, "Supersede");

  expect(screen.getByRole("status")).toHaveTextContent("Loaded beta");
  expect(screen.getByRole("searchbox", { name: "Query" })).toHaveValue("beta");
  expect(attemptItems().map((item) => item.textContent)).toEqual([
    "Attempt 1, transient, alpha",
    "Attempt 1, success, beta",
  ]);
  const [alpha, beta] = attemptItems();
  expect(alpha?.style.getPropertyValue("--lane")).toBe("var(--lane-1)");
  expect(beta?.style.getPropertyValue("--lane")).toBe("var(--lane-2)");
  const brief = screen.getByRole("region", { name: "Explanation" }).querySelector(".lab-brief");
  expect(brief).toHaveTextContent("beta");
  expect(brief).not.toHaveTextContent("alpha");

  advance(clock, 1000);
  expect(screen.getByRole("status")).toHaveTextContent("Loaded beta");
  expect(attemptItems().filter((item) => item.textContent?.includes("alpha"))).toHaveLength(1);
  expect(attemptItems().some((item) => item.textContent?.includes("Attempt 2"))).toBe(false);
});

test("Clear waiting returns to idle and a late timer stays silent", async () => {
  const user = userEvent.setup();
  const { clock } = renderLab();

  await chooseMode(user, "Bounded backoff");
  await clickScenario(user, "Clear waiting");

  expect(screen.getByRole("status")).toHaveTextContent("No load has started yet.");
  expect(screen.getByRole("searchbox", { name: "Query" })).toHaveValue("");
  expect(screen.getByText("Logical request none")).toBeInTheDocument();
  expect(attemptItems()).toHaveLength(0);
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "No load has started yet.",
  );

  advance(clock, 1000);
  expect(screen.getByRole("status")).toHaveTextContent("No load has started yet.");
  expect(attemptItems()).toHaveLength(0);
});

test("seeded jitter on Recover repeats and still resolves within the first full delay", async () => {
  const user = userEvent.setup();

  async function armRecover(clock: ManualClock) {
    const view = render(<RetryLab clock={clock} />);
    await chooseMode(user, "Bounded backoff");
    await user.click(screen.getByRole("switch", { name: "Jitter" }));
    expect(screen.getByRole("switch", { name: "Jitter" })).toHaveAttribute("aria-checked", "true");
    await clickScenario(user, "Recover");
    return view;
  }

  const firstClock = createManualClock();
  const first = await armRecover(firstClock);
  const firstWait = scheduledWait();
  expect(Number.isFinite(firstWait)).toBe(true);
  expect(Number.isInteger(firstWait)).toBe(true);
  expect(firstWait).toBeGreaterThanOrEqual(0);
  expect(firstWait).toBeLessThanOrEqual(200);
  first.unmount();

  const secondClock = createManualClock();
  await armRecover(secondClock);
  expect(scheduledWait()).toBe(firstWait);

  advance(secondClock, 0);
  if (!screen.getByRole("status").textContent?.includes("Loaded alpha")) {
    advance(secondClock, 200);
  }
  expect(screen.getByRole("status")).toHaveTextContent("Loaded alpha");
  expect(attemptItems()).toHaveLength(2);
  expect(attemptItems().some((item) => item.textContent?.includes("Attempt 3"))).toBe(false);
});

test("manual Load uses the query, script, and jitter switch", async () => {
  const user = userEvent.setup();
  const firstClock = createManualClock();
  const first = render(<RetryLab clock={firstClock} />);

  await openAdvanced(user);
  const script = screen.getByRole("group", { name: "Script" });
  await user.click(within(script).getByRole("button", { name: "Permanent" }));
  await clickScenario(user, "Recover");
  expect(screen.getByRole("status")).toHaveTextContent("Transient failure.");
  expect(attemptItems().map((item) => item.textContent)).toEqual(["Attempt 1, transient, alpha"]);

  const query = screen.getByRole("searchbox", { name: "Query" });
  await user.clear(query);
  await user.type(query, "gamma");
  await user.click(within(script).getByRole("button", { name: "Success" }));
  await user.click(screen.getByRole("button", { name: "Load" }));
  expect(screen.getByRole("status")).toHaveTextContent("Loaded gamma");
  expect(attemptItems().at(-1)).toHaveTextContent("Attempt 1, success, gamma");

  await chooseMode(user, "Bounded backoff");
  await user.click(screen.getByRole("switch", { name: "Jitter" }));
  await user.click(within(script).getByRole("button", { name: "Transient then success" }));
  await user.clear(query);
  await user.type(query, "alpha");
  await user.click(screen.getByRole("button", { name: "Load" }));
  const wait = scheduledWait();
  expect(Number.isInteger(wait)).toBe(true);
  expect(wait).toBeGreaterThanOrEqual(0);
  expect(wait).toBeLessThan(200);
  first.unmount();

  const secondClock = createManualClock();
  render(<RetryLab clock={secondClock} />);
  await chooseMode(user, "Bounded backoff");
  await user.click(screen.getByRole("switch", { name: "Jitter" }));
  await user.click(
    within(screen.getByRole("group", { name: "Script" })).getByRole("button", {
      name: "Transient then success",
    }),
  );
  await user.type(screen.getByRole("searchbox", { name: "Query" }), "alpha");
  await user.click(screen.getByRole("button", { name: "Load" }));
  expect(scheduledWait()).toBe(wait);

  advance(secondClock, 0);
  if (!screen.getByRole("status").textContent?.includes("Loaded alpha")) {
    advance(secondClock, 200);
  }
  expect(screen.getByRole("status")).toHaveTextContent("Loaded alpha");
  expect(attemptItems()).toHaveLength(2);
  expect(attemptItems().some((item) => item.textContent?.includes("Attempt 3"))).toBe(false);
});
