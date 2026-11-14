import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { createManualClock } from "./clock.ts";
import { DeduplicationLab } from "./DeduplicationLab.tsx";

function renderLab() {
  const clock = createManualClock();
  render(<DeduplicationLab clock={clock} />);
  return clock;
}

test("starts idle, with collapsed advanced controls and named key inputs", () => {
  renderLab();

  expect(screen.getByRole("heading", { name: "Request Deduplication" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "No request has started yet.",
  );
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent("In flight");
  expect(screen.getByRole("region", { name: "Example" })).toHaveTextContent("Consumers");
  expect(screen.getByRole("status")).toHaveTextContent("0 transport requests");
  expect(screen.getByRole("status")).toHaveTextContent("simulation");
  expect(screen.getByRole("textbox", { name: "Key for A" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Key for B" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Advanced" })).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("button", { name: "Independent" })).not.toBeInTheDocument();
  expect(document.querySelector("code")?.textContent).toContain("inflight");
  expect(document.querySelector("code")?.textContent).toContain("inflight.delete");

  for (const title of [
    "Result caching and TTL",
    "Debouncing",
    "Cancellation of a whole page of unrelated requests",
    "Retries",
  ]) {
    expect(screen.getByText(title).closest("a")).toBeNull();
  }
});

test("shared same key uses one transport, then a new one after it settles", () => {
  const clock = renderLab();

  fireEvent.click(screen.getByRole("button", { name: "Same key" }));

  expect(screen.getByRole("status")).toHaveTextContent("1 transport request");
  expect(screen.getByRole("status")).toHaveTextContent("2 consumers, 1 request");
  expect(screen.getByRole("status")).toHaveTextContent("simulation");
  expect(screen.getByRole("region", { name: "Consumer A" })).toHaveTextContent("pending");
  expect(screen.getByRole("region", { name: "Consumer B" })).toHaveTextContent("pending");
  expect(screen.getByRole("region", { name: "Transport list" }).querySelectorAll("li")).toHaveLength(1);
  const lane = screen.getByRole("region", { name: "Transport list" }).querySelector("li");
  expect(lane).toBeInstanceOf(HTMLElement);
  if (lane instanceof HTMLElement) {
    expect(lane.style.getPropertyValue("--lane")).toBe("var(--lane-1)");
  }

  act(() => {
    clock.advance(400);
  });

  expect(screen.getByRole("region", { name: "Consumer A" })).toHaveTextContent("Record atlas");
  expect(screen.getByRole("region", { name: "Consumer B" })).toHaveTextContent("Record atlas");
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent("Nothing is in flight.");

  fireEvent.click(screen.getByRole("button", { name: "Same key" }));

  expect(screen.getByRole("status")).toHaveTextContent("2 transport requests");
  expect(screen.getByRole("region", { name: "Transport list" }).querySelectorAll("li")).toHaveLength(2);
});

test("independent same key starts two transports before either resolves", () => {
  const clock = renderLab();

  fireEvent.click(screen.getByRole("button", { name: "Advanced" }));
  fireEvent.click(screen.getByRole("button", { name: "Independent" }));
  fireEvent.click(screen.getByRole("button", { name: "Same key" }));

  expect(screen.getByRole("button", { name: "Independent" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("status")).toHaveTextContent("2 transport requests");
  expect(screen.getByRole("region", { name: "Transport list" }).querySelectorAll("li")).toHaveLength(2);
  expect(screen.getByRole("region", { name: "Consumer A" })).not.toHaveTextContent("Record atlas");
  expect(clock.now()).toBe(0);
});

test("different keys in shared mode start two transports", () => {
  renderLab();

  fireEvent.click(screen.getByRole("button", { name: "Different keys" }));

  const list = screen.getByRole("region", { name: "Transport list" });
  expect(screen.getByRole("status")).toHaveTextContent("2 transport requests");
  expect(list.querySelectorAll("li")).toHaveLength(2);
  expect(list).toHaveTextContent("atlas");
  expect(list).toHaveTextContent("borealis");
  expect(screen.getByRole("textbox", { name: "Key for A" })).toHaveValue("atlas");
  expect(screen.getByRole("textbox", { name: "Key for B" })).toHaveValue("borealis");
});

test("detaching A leaves the shared record for B and does not report an abort", () => {
  const clock = renderLab();

  fireEvent.click(screen.getByRole("button", { name: "Detach A" }));

  act(() => {
    clock.advance(400);
  });

  expect(screen.getByRole("region", { name: "Consumer B" })).toHaveTextContent("Record atlas");
  expect(screen.getByRole("region", { name: "Consumer A" })).not.toHaveTextContent("Record atlas");
  expect(screen.getByRole("region", { name: "Consumer A" })).toHaveTextContent("idle");
  expect(screen.getByRole("status")).not.toHaveTextContent(/abort/i);
  expect(screen.getByRole("region", { name: "Transport list" })).not.toHaveTextContent(/abort/i);
  expect(screen.getByRole("region", { name: "Transport rows" })).not.toHaveTextContent(/abort/i);
  expect(screen.getByRole("region", { name: "Transport list" })).toHaveTextContent("settled");
});

test("fail then retry ends with the shared record and two transports", () => {
  const clock = renderLab();

  fireEvent.click(screen.getByRole("button", { name: "Fail then retry" }));
  expect(screen.getByRole("status")).toHaveTextContent("1 transport request");

  act(() => {
    clock.advance(400);
  });

  expect(screen.getByRole("status")).toHaveTextContent("2 transport requests");
  expect(screen.getByRole("region", { name: "Transport list" })).toHaveTextContent("failed");
  expect(screen.getByRole("region", { name: "Consumer A" })).not.toHaveTextContent("Record atlas");

  act(() => {
    clock.advance(400);
  });

  expect(screen.getByRole("region", { name: "Consumer A" })).toHaveTextContent("Record atlas");
  expect(screen.getByRole("region", { name: "Consumer B" })).toHaveTextContent("Record atlas");
  expect(screen.getByRole("status")).toHaveTextContent("2 transport requests");
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent("Nothing is in flight.");
  expect(screen.getByRole("region", { name: "Transport list" })).toHaveTextContent("failed");
  expect(screen.getByRole("region", { name: "Transport list" })).toHaveTextContent("settled");
});
