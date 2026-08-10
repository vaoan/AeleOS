import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/page";

describe("home page", () => {
  it("renders the product name", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { name: "AeleOS" })).toBeInTheDocument();
  });
});
