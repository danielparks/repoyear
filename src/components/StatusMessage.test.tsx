import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusMessage } from "./StatusMessage.tsx";

describe("StatusMessage", () => {
  it("should render error message", () => {
    render(
      <StatusMessage
        type="error"
        message="Something went wrong"
      />,
    );

    const messageElement = screen.getByText("Something went wrong");
    expect(messageElement).toBeInTheDocument();
    expect(messageElement.className).toBe("error-message");
  });

  it("should render loading message", () => {
    render(
      <StatusMessage
        type="loading"
        message="Loading data..."
      />,
    );

    const messageElement = screen.getByText("Loading data...");
    expect(messageElement).toBeInTheDocument();
    expect(messageElement.className).toBe("loading-message");
  });

  it("should render title when provided", () => {
    render(
      <StatusMessage
        type="error"
        message="An error occurred"
        title="Error"
      />,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Error",
    );
    expect(screen.getByText("An error occurred")).toBeInTheDocument();
  });

  it("should not render title when not provided", () => {
    render(
      <StatusMessage
        type="loading"
        message="Loading..."
      />,
    );

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });
});
