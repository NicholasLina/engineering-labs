import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { LabCard } from "./LabCard.tsx";

const sample = {
  slug: "sample-topic",
  title: "Sample Topic",
  summary: "A short description of the sample.",
  concepts: ["Caching", "Latency"],
  thumbnail: "/sample-thumb.svg",
};

test("a lab card shows a thumbnail, title, summary, and concept tags", () => {
  const { container } = render(
    <ul>
      <LabCard lab={sample} />
    </ul>,
  );

  const image = container.querySelector("img");
  expect(image).toHaveAttribute("src", "/sample-thumb.svg");
  expect(image).toHaveAttribute("alt", "");
  expect(screen.getByRole("link", { name: "Sample Topic" })).toHaveAttribute(
    "href",
    "#sample-topic",
  );
  expect(screen.getByText("A short description of the sample.")).toBeInTheDocument();
  expect(screen.getByText("Caching")).toBeInTheDocument();
  expect(screen.getByText("Latency")).toBeInTheDocument();
});
