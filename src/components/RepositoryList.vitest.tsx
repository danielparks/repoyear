import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { RepositoryList } from "./RepositoryList.tsx";
import { Calendar, Day, Filter, Repository } from "../model.ts";

describe("RepositoryList", () => {
  function createTestCalendar() {
    const startDate = new Date(2025, 0, 1);
    const days: Day[] = [];

    for (let i = 0; i < 30; i++) {
      const day = new Day(
        new Date(2025, 0, 1 + i),
        Math.floor(Math.random() * 10),
      );
      days.push(day);
    }

    const calendar = new Calendar("testuser", startDate, days);

    const repo1 = new Repository("https://github.com/test/repo1");
    repo1.contributions = 10;
    repo1.hue = 120;
    calendar.repositories.set(repo1.url, repo1);

    const repo2 = new Repository("https://github.com/test/repo2");
    repo2.contributions = 5;
    repo2.hue = 240;
    calendar.repositories.set(repo2.url, repo2);

    return calendar;
  }

  it("should render list of repositories", () => {
    const calendar = createTestCalendar();
    const filter = new Filter();
    const setFilter = vi.fn();
    const setHighlight = vi.fn();

    render(
      <RepositoryList
        calendar={calendar}
        filter={filter}
        setFilter={setFilter}
        setHighlight={setHighlight}
      />,
    );

    expect(screen.getByText("test/repo1")).toBeInTheDocument();
    expect(screen.getByText("test/repo2")).toBeInTheDocument();
  });

  it("should render repositories in order of most contributions", () => {
    const calendar = createTestCalendar();
    const filter = new Filter();
    const setFilter = vi.fn();
    const setHighlight = vi.fn();

    render(
      <RepositoryList
        calendar={calendar}
        filter={filter}
        setFilter={setFilter}
        setHighlight={setHighlight}
      />,
    );

    const repos = screen.getAllByRole("listitem");
    expect(repos[0]).toHaveTextContent("test/repo1");
    expect(repos[1]).toHaveTextContent("test/repo2");
  });

  it("should render checkboxes checked by default", () => {
    const calendar = createTestCalendar();
    const filter = new Filter();
    const setFilter = vi.fn();
    const setHighlight = vi.fn();

    render(
      <RepositoryList
        calendar={calendar}
        filter={filter}
        setFilter={setFilter}
        setHighlight={setHighlight}
      />,
    );

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).toBeChecked();
  });

  it("should call setFilter when checkbox is clicked", async () => {
    const user = userEvent.setup();
    const calendar = createTestCalendar();
    const filter = new Filter();
    const setFilter = vi.fn();
    const setHighlight = vi.fn();

    render(
      <RepositoryList
        calendar={calendar}
        filter={filter}
        setFilter={setFilter}
        setHighlight={setHighlight}
      />,
    );

    const checkbox = screen.getAllByRole("checkbox")[0];
    await user.click(checkbox);

    expect(setFilter).toHaveBeenCalledTimes(1);
  });

  it("should call setHighlight on mouse enter", async () => {
    const user = userEvent.setup();
    const calendar = createTestCalendar();
    const filter = new Filter();
    const setFilter = vi.fn();
    const setHighlight = vi.fn();

    render(
      <RepositoryList
        calendar={calendar}
        filter={filter}
        setFilter={setFilter}
        setHighlight={setHighlight}
      />,
    );

    const label = screen.getByText("test/repo1").closest("label");
    if (label) {
      await user.hover(label);
      expect(setHighlight).toHaveBeenCalledWith(
        "https://github.com/test/repo1",
      );
    }
  });

  it("should render repository links with correct URLs", () => {
    const calendar = createTestCalendar();
    const filter = new Filter();
    const setFilter = vi.fn();
    const setHighlight = vi.fn();

    render(
      <RepositoryList
        calendar={calendar}
        filter={filter}
        setFilter={setFilter}
        setHighlight={setHighlight}
      />,
    );

    const link1 = screen.getByText("test/repo1").closest("a");
    const link2 = screen.getByText("test/repo2").closest("a");

    expect(link1).toHaveAttribute("href", "https://github.com/test/repo1");
    expect(link2).toHaveAttribute("href", "https://github.com/test/repo2");
  });

  it("should render sparklines for each repository", () => {
    const calendar = createTestCalendar();
    const filter = new Filter();
    const setFilter = vi.fn();
    const setHighlight = vi.fn();

    render(
      <RepositoryList
        calendar={calendar}
        filter={filter}
        setFilter={setFilter}
        setHighlight={setHighlight}
      />,
    );

    const sparklines = document.querySelectorAll(".sparkline");
    expect(sparklines.length).toBe(2);
  });
});
