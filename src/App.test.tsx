import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";
import App from "./App.tsx";

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
  expect(screen.getByText("Stale responses")).toBeInTheDocument();
  expect(document.querySelector(".lab-card img")).toHaveAttribute("alt", "");
});

test("an unknown hash stays on the gallery", () => {
  window.location.hash = "#missing";
  render(<App />);

  expect(screen.getByRole("link", { name: "Race Condition" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Back to labs" })).not.toBeInTheDocument();
});

test("the optimistic updates card opens the board and the back link returns", async () => {
  window.location.hash = "#optimistic-updates";
  const user = userEvent.setup();
  render(<App />);

  expect(screen.getByRole("heading", { level: 2, name: "Optimistic Updates" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Successful save" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "To do" })).toBeInTheDocument();

  await user.click(screen.getByRole("link", { name: "Back to labs" }));
  expect(screen.getByRole("link", { name: "Optimistic Updates" })).toHaveAttribute(
    "href",
    "#optimistic-updates",
  );
  expect(screen.getByText("Optimistic UI")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Successful save" })).not.toBeInTheDocument();
});

test("the card opens the experiment and the back link returns", async () => {
  window.location.hash = "";
  const user = userEvent.setup();
  render(<App />);

  await user.click(screen.getByRole("link", { name: "Race Condition" }));
  expect(screen.getByRole("searchbox", { name: "Search" })).toBeInTheDocument();

  await user.click(screen.getByRole("link", { name: "Back to labs" }));
  expect(screen.getByRole("link", { name: "Race Condition" })).toBeInTheDocument();
  expect(screen.queryByRole("searchbox", { name: "Search" })).not.toBeInTheDocument();
});
