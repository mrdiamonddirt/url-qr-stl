import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { IonApp } from "@ionic/react";
import { MemoryRouter, Route } from "react-router-dom";
import { vi } from "vitest";
import RedirectPage from "./RedirectPage";

const recordScanMock = vi.fn();
const findShortUrlByCodeMock = vi.fn();

vi.mock("../lib/supabaseClient", () => ({
  recordScan: (...args: unknown[]) => recordScanMock(...args),
}));

vi.mock("../lib/storage", () => ({
  findShortUrlByCode: (...args: unknown[]) => findShortUrlByCodeMock(...args),
}));

function renderRedirect(path = "/s/ABC1234") {
  return render(
    <IonApp>
      <MemoryRouter initialEntries={[path]}>
        <Route path="/s/:code">
          <RedirectPage />
        </Route>
      </MemoryRouter>
    </IonApp>
  );
}

describe("RedirectPage", () => {
  beforeEach(() => {
    recordScanMock.mockReset();
    findShortUrlByCodeMock.mockReset();
  });

  test("shows clean-through page with ad slot and settings CTAs when free scan limit is reached", async () => {
    recordScanMock.mockResolvedValue({ error: "limit_reached" });

    renderRedirect();

    expect(await screen.findByText(/scan limit reached/i)).toBeInTheDocument();
    expect(screen.getByTestId("blocked-through-ad-slot")).toBeInTheDocument();
    expect(screen.getByText("Subscribe to Reactivate")).toBeInTheDocument();
    expect(screen.getByText("Make Another QR")).toBeInTheDocument();
  });

  test("keeps banned-state messaging available", async () => {
    recordScanMock.mockResolvedValue({ error: "banned" });

    renderRedirect();

    expect(await screen.findByText(/link disabled/i)).toBeInTheDocument();
    expect(screen.getByText(/blocked from redirecting links/i)).toBeInTheDocument();
    expect(screen.getByText(/terms and policies/i)).toBeInTheDocument();
  });

  test("falls back to local storage lookup when remote record is not found", async () => {
    recordScanMock.mockResolvedValue({ error: "not_found" });
    findShortUrlByCodeMock.mockReturnValue(undefined);

    renderRedirect();

    await waitFor(() => {
      expect(findShortUrlByCodeMock).toHaveBeenCalledWith("ABC1234");
    });

    expect(await screen.findByText(/short link missing/i)).toBeInTheDocument();
  });

  test("treats malformed codes as not found without calling RPC", async () => {
    renderRedirect("/s/%20%20");

    expect(await screen.findByText(/short link missing/i)).toBeInTheDocument();
    expect(recordScanMock).not.toHaveBeenCalled();
    expect(findShortUrlByCodeMock).not.toHaveBeenCalled();
  });
});