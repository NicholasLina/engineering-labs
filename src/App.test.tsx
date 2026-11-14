import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";
import App from "./App.tsx";

const experiments = [
  { title: "Race Condition", slug: "async-race-conditions" },
  { title: "Debouncing", slug: "debouncing" },
  { title: "Request Cancellation", slug: "request-cancellation" },
  { title: "Cache Lifetime", slug: "cache-lifetime" },
  { title: "Request Deduplication", slug: "request-deduplication" },
  { title: "Retries", slug: "retries" },
] as const;

afterEach(() => {
  window.location.hash = "";
});

test("the gallery has no site header and shows the race condition card", () => {
  window.location.hash = "";
  render(<App />);

  expect(screen.queryByText("Software Engineering Portfolio")).not.toBeInTheDocument();
  expect(
    screen.queryByText(
      "Interactive experiments exploring software reliability, performance, accessibility, and system design.",
    ),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: "Engineering Labs" })).toBeInTheDocument();
  expect(screen.queryByText("Experiments coming soon.")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Race Condition" })).toHaveAttribute(
    "href",
    "#async-race-conditions",
  );
  const raceCard = screen.getByRole("link", { name: "Race Condition" }).closest(".lab-card");
  expect(raceCard).not.toBeNull();
  expect(within(raceCard as HTMLElement).getByText("Stale responses")).toBeInTheDocument();
  const images = document.querySelectorAll(".lab-card img");
  expect(images).toHaveLength(experiments.length);
  for (const image of images) {
    expect(image).toHaveAttribute("alt", "");
  }
});

test("an unknown hash stays on the gallery", () => {
  window.location.hash = "#missing";
  render(<App />);

  expect(screen.getByRole("link", { name: "Race Condition" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Back to labs" })).not.toBeInTheDocument();
});

test("each card opens its experiment and the back link returns", async () => {
  window.location.hash = "";
  const user = userEvent.setup();
  render(<App />);

  for (const experiment of experiments) {
    const card = screen.getByRole("link", { name: experiment.title });
    expect(card).toHaveAttribute("href", `#${experiment.slug}`);
    await user.click(card);
    expect(screen.getByRole("heading", { level: 2, name: experiment.title })).toBeInTheDocument();
    expect(window.location.hash).toBe(`#${experiment.slug}`);

    await user.click(screen.getByRole("link", { name: "Back to labs" }));
    expect(screen.getByRole("link", { name: experiment.title })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Back to labs" })).not.toBeInTheDocument();
    expect(screen.queryByRole("toolbar", { name: "Scenarios" })).not.toBeInTheDocument();
  }
});

test("a registered hash opens that experiment", () => {
  window.location.hash = "#retries";
  render(<App />);

  expect(screen.getByRole("heading", { level: 2, name: "Retries" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Race Condition" })).not.toBeInTheDocument();
});
