import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { CacheLifetimeLab } from "./CacheLifetimeLab.tsx";

const outside = [
  "Background revalidation",
  "Debouncing",
  "Request cancellation",
  "In-flight duplicates",
  "Retries",
];

function logText(): string[] {
  return within(screen.getByRole("region", { name: "Lookup log" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

test("the page starts idle at clock 0", () => {
  render(<CacheLifetimeLab />);

  expect(document.querySelector(".cache-lab")).not.toBeNull();
  expect(screen.getByRole("heading", { name: "Cache Lifetime" })).toHaveAttribute(
    "id",
    "cache-lab-title",
  );
  expect(screen.getByRole("link", { name: "Back to labs" })).toHaveAttribute("href", "#labs");
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "No lookup has run yet.",
  );
  expect(screen.getByText("Clock 0")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Key" })).toHaveValue("ada");
  expect(screen.getByRole("textbox", { name: "Ada" })).toHaveValue("Ada Lovelace");
  expect(screen.getByRole("textbox", { name: "Bea" })).toHaveValue("Bea Atlas");
  expect(screen.getByRole("textbox", { name: "Cam" })).toHaveValue("Cam Rivera");
  expect(screen.getByRole("status")).toHaveTextContent("No lookup yet.");
  expect(screen.queryByRole("button", { name: "Advanced" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "First hit" })).toHaveClass("ui-button-primary");
  expect(screen.getByRole("button", { name: "Expire" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Stale edit" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Evict" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Advance 1" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Advance to expiry" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Clear" })).toHaveClass("ui-button-outline");
  expect(screen.getByText("Lookup", { selector: ".lab-example-bar" })).toBeInTheDocument();
  expect(document.querySelector("code")?.textContent).toContain("now < storedAt + ttl");
  expect(
    screen.getByText(/TTL 5, capacity 2, hits do not extend TTL/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/expired entries are dropped before LRU eviction/),
  ).toBeInTheDocument();
  for (const title of outside) {
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByText(title).closest("a")).toBeNull();
  }
});

test("an optional initial tick is the visible clock", () => {
  render(<CacheLifetimeLab initialNow={2} />);
  expect(screen.getByText("Clock 2")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "No lookup has run yet.",
  );
});

test("First hit logs one source read and one hit for Ada Lovelace", async () => {
  const user = userEvent.setup();
  render(<CacheLifetimeLab />);

  await user.click(screen.getByRole("button", { name: "First hit" }));

  const items = logText();
  expect(items.filter((item) => item.startsWith("source"))).toEqual([
    "source · ada · Ada Lovelace · tick 0",
  ]);
  expect(items.filter((item) => item.startsWith("hit"))).toEqual([
    "hit · ada · Ada Lovelace · tick 0",
  ]);
  expect(screen.getByRole("status")).toHaveTextContent("Hit ada: Ada Lovelace");
  const row = screen.getByRole("row", { name: /ada/i });
  expect(row).toHaveTextContent("Ada Lovelace");
  expect(row.style.getPropertyValue("--lane")).toBe("var(--lane-1)");
});

test("Expire reloads the value at tick 5 after a hit at tick 4", async () => {
  const user = userEvent.setup();
  render(<CacheLifetimeLab />);

  await user.click(screen.getByRole("button", { name: "Expire" }));

  expect(screen.getByText("Clock 5")).toBeInTheDocument();
  const row = screen.getByRole("row", { name: /ada Ada Lovelace/i });
  expect(within(row).getByText("fresh")).toBeInTheDocument();
  expect(within(row).getByText("5")).toBeInTheDocument();
  expect(within(row).getByText("10")).toBeInTheDocument();
  expect(logText()).toEqual([
    "source · ada · Ada Lovelace · tick 0",
    "hit · ada · Ada Lovelace · tick 4",
    "source · ada · Ada Lovelace · tick 5",
  ]);
  expect(screen.getByRole("region", { name: "Evictions" })).toHaveTextContent(
    "expired · ada · tick 5",
  );
  expect(screen.getByRole("status")).toHaveTextContent("Source ada: Ada Lovelace");
});

test("Stale edit shows the cached name before invalidate and the revision after it", async () => {
  const user = userEvent.setup();
  render(<CacheLifetimeLab />);

  await user.click(screen.getByRole("button", { name: "Stale edit" }));

  const items = logText();
  expect(items[1]).toBe("hit · ada · Ada Lovelace · tick 0");
  expect(items[2]).toBe("source · ada · Ada Lovelace (revised) · tick 0");
  expect(screen.getByRole("status")).toHaveTextContent("Source ada: Ada Lovelace (revised)");
  expect(screen.getByRole("region", { name: "Evictions" })).toHaveTextContent(
    "invalidated · ada · tick 0",
  );
  expect(screen.getByRole("row", { name: /revised/i })).toHaveTextContent("Ada Lovelace (revised)");
});

test("Evict lists ada as a capacity eviction and keeps bea and cam", async () => {
  const user = userEvent.setup();
  render(<CacheLifetimeLab />);

  await user.click(screen.getByRole("button", { name: "Evict" }));

  expect(screen.getByRole("region", { name: "Evictions" })).toHaveTextContent(
    "capacity · ada · tick 0",
  );
  const table = screen.getByRole("table");
  expect(within(table).getByText("bea")).toBeInTheDocument();
  expect(within(table).getByText("cam")).toBeInTheDocument();
  expect(within(table).getByText("Bea Atlas")).toBeInTheDocument();
  expect(within(table).getByText("Cam Rivera")).toBeInTheDocument();
  expect(within(table).queryByText("ada")).not.toBeInTheDocument();
});

test("Advance 1 increases the visible clock", async () => {
  const user = userEvent.setup();
  render(<CacheLifetimeLab />);

  expect(screen.getByText("Clock 0")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Advance 1" }));
  expect(screen.getByText("Clock 1")).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Cache" })).toHaveTextContent("The cache is empty.");
});

test("editing the source field alone leaves the cached lookup result", () => {
  render(<CacheLifetimeLab />);

  fireEvent.click(screen.getByRole("button", { name: "Lookup" }));
  expect(screen.getByRole("status")).toHaveTextContent("Source ada: Ada Lovelace");

  fireEvent.change(screen.getByRole("textbox", { name: "Ada" }), {
    target: { value: "Ada Lovelace (revised)" },
  });

  expect(screen.getByRole("textbox", { name: "Ada" })).toHaveValue("Ada Lovelace (revised)");
  expect(screen.getByRole("status")).toHaveTextContent("Source ada: Ada Lovelace");
  expect(screen.getByRole("status").textContent).not.toContain("revised");
  const row = screen.getByRole("row", { name: /ada Ada Lovelace/i });
  expect(row).toHaveTextContent("Ada Lovelace");
  expect(row.textContent).not.toContain("revised");
  expect(screen.getByRole("region", { name: "Evictions" })).toHaveTextContent("No evictions yet.");
});

test("a second lookup after a source edit still returns the cached name", () => {
  render(<CacheLifetimeLab />);

  fireEvent.click(screen.getByRole("button", { name: "Lookup" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Ada" }), {
    target: { value: "Ada Lovelace (revised)" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lookup" }));

  expect(screen.getByRole("status")).toHaveTextContent("Hit ada: Ada Lovelace");
  expect(screen.getByRole("status").textContent).not.toContain("revised");
  expect(logText()[1]).toBe("hit · ada · Ada Lovelace · tick 0");
});

test("Advance to expiry moves the clock and leaves the entry stored", () => {
  render(<CacheLifetimeLab />);

  fireEvent.click(screen.getByRole("button", { name: "Lookup" }));
  fireEvent.click(screen.getByRole("button", { name: "Advance to expiry" }));

  expect(screen.getByText("Clock 5")).toBeInTheDocument();
  expect(screen.getByRole("row", { name: /ada/i })).toHaveTextContent("expired");
  expect(screen.getByRole("region", { name: "Evictions" })).toHaveTextContent("No evictions yet.");
});

test("an unknown key misses and stays out of the cache", () => {
  render(<CacheLifetimeLab />);

  fireEvent.change(screen.getByRole("textbox", { name: "Key" }), {
    target: { value: "nope" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Lookup" }));

  expect(screen.getByRole("status")).toHaveTextContent("Miss nope");
  expect(screen.getByRole("region", { name: "Cache" })).toHaveTextContent("The cache is empty.");
  expect(logText()).toEqual(["miss · nope · tick 0"]);
});

test("Clear restores the idle clock, key, and source", () => {
  render(<CacheLifetimeLab />);

  fireEvent.click(screen.getByRole("button", { name: "First hit" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Key" }), {
    target: { value: "bea" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Ada" }), {
    target: { value: "Changed" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Clear" }));

  expect(screen.getByRole("region", { name: "Explanation" })).toHaveTextContent(
    "No lookup has run yet.",
  );
  expect(screen.getByText("Clock 0")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Key" })).toHaveValue("ada");
  expect(screen.getByRole("textbox", { name: "Ada" })).toHaveValue("Ada Lovelace");
  expect(screen.getByRole("region", { name: "Cache" })).toHaveTextContent("The cache is empty.");
  expect(screen.getByRole("region", { name: "Lookup log" })).toHaveTextContent("No lookups yet.");
});
