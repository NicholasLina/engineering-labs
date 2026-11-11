import { render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import App from "./App.tsx";

afterEach(() => {
  window.location.hash = "";
});

test("the gallery has no site header and shows the empty state", () => {
  window.location.hash = "";
  render(<App />);

  expect(screen.queryByText("Software Engineering Portfolio")).not.toBeInTheDocument();
  expect(
    screen.queryByText(
      "Interactive experiments exploring software reliability, performance, accessibility, and system design.",
    ),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: "Engineering Labs" })).toBeInTheDocument();
  expect(screen.getByText("Experiments coming soon.")).toBeInTheDocument();
});

test("an unknown hash stays on the gallery", () => {
  window.location.hash = "#missing";
  render(<App />);

  expect(screen.getByText("Experiments coming soon.")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Back to labs" })).not.toBeInTheDocument();
});
