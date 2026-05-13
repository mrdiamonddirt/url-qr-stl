import React from "react";
import { render, screen } from "@testing-library/react";
import { IonApp } from "@ionic/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { User } from "@supabase/supabase-js";
import { vi } from "vitest";
import EditorPage from "./EditorPage";
import { Profile } from "../types";

vi.mock("../lib/qr", async () => {
  const actual = await vi.importActual<typeof import("../lib/qr")>("../lib/qr");
  return {
    ...actual,
    toQrDataUrl: vi.fn(async () => "data:image/png;base64,stub"),
  };
});

function renderEditor(profile: Profile | null = null, user: User | null = null) {
  return render(
    <IonApp>
      <MemoryRouter>
        <EditorPage user={user} profile={profile} />
      </MemoryRouter>
    </IonApp>
  );
}

describe("EditorPage template picker", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("shows premium lock badges and blocks free users from premium templates", async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getAllByRole("button", { name: /Select template /i })).toHaveLength(9);
    expect(screen.getByRole("button", { name: "Select template No Border" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Simple Border" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Fancy Border" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Scan Me" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Open Link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Loop Square" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Loop Round" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Loop Square + Text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Loop Round + Text" })).toBeInTheDocument();

    expect(screen.getAllByText("Premium").length).toBeGreaterThanOrEqual(4);

    expect(screen.getByText(/No text fields for this template/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Enter custom tag text")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select template Fancy Border" }));
    expect(screen.getByText(/Premium template selected/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select template Scan Me" }));

    expect((await screen.findAllByPlaceholderText("Enter custom tag text")).length).toBeGreaterThan(0);
    expect(screen.getByText(/^Text size \(/i)).toBeInTheDocument();
  });

  test("shows direct link as locked for free accounts", () => {
    renderEditor();

    expect(screen.getByText("Direct")).toBeInTheDocument();
    expect(screen.getByTestId("instant-redirect-state")).toHaveTextContent("Locked");
  });

  test("opens the plan overlay for free users when they try direct link", async () => {
    const user = userEvent.setup();

    renderEditor();

    await user.click(screen.getByLabelText("Direct link toggle"));

    expect(screen.getByText("Direct Link requires Premium")).toBeInTheDocument();
    expect(screen.getByText("Direct Link is a Premium feature.")).toBeInTheDocument();
  });

  test("defaults direct link to off for premium accounts", () => {
    const premiumProfile: Profile = {
      id: "test-user",
      plan: "premium",
      redirect_mode: "interstitial",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_ends_at: null,
      monthly_scans: 0,
      monthly_reset_at: null,
      created_at: new Date().toISOString(),
    };

    const premiumUser = { id: "test-user", email: "premium@example.com" } as unknown as User;
    renderEditor(premiumProfile, premiumUser);

    expect(screen.getByText("Direct")).toBeInTheDocument();
    expect(screen.getByTestId("instant-redirect-state")).toHaveTextContent("Off");
  });

  test("shows import-step controls for QR generation", () => {
    renderEditor();

    expect(screen.getByPlaceholderText("https://example.com/page")).toBeInTheDocument();
    expect(screen.getByText(/^Generate QR$|^Re-render QR$/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /1 Import URL/i })).toBeInTheDocument();
  });

  test("loads a saved QR from recent tags", async () => {
    const user = userEvent.setup();
    localStorage.setItem(
      "url-qr-stl.short-urls",
      JSON.stringify([
        {
          id: "saved-1",
          code: "ABC1234",
          originalUrl: "https://example.com/saved",
          shortUrl: "https://short/ABC1234",
          templateId: "no-border",
          templateValues: {},
          qrType: "standard",
          createdAt: new Date().toISOString(),
        },
      ])
    );

    renderEditor();

    const loadButtons = await screen.findAllByRole("button", { name: /Load previous tag/i });
    await user.click(loadButtons[0]);

    expect(await screen.findByText(/Loaded tag ABC1234\./i)).toBeInTheDocument();
  });

  test("shows pending state when premium direct link is toggled", async () => {
    const user = userEvent.setup();
    const premiumProfile: Profile = {
      id: "test-user",
      plan: "premium",
      redirect_mode: "interstitial",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_ends_at: null,
      monthly_scans: 0,
      monthly_reset_at: null,
      created_at: new Date().toISOString(),
    };

    const premiumUser = { id: "test-user", email: "premium@example.com" } as unknown as User;
    renderEditor(premiumProfile, premiumUser);

    await user.click(screen.getByLabelText("Direct link toggle"));
    expect(screen.getByTestId("instant-redirect-state")).toHaveTextContent("Pending On");
  });

  test("renders next button on preview workflow", () => {
    renderEditor();
    expect(screen.getByText("Next: Template Edit")).toBeInTheDocument();
  });

  test("shows qr type selector without unavailable-build copy", () => {
    renderEditor();

    expect(screen.getByText("QR type")).toBeInTheDocument();
    expect(screen.queryByText(/not in this build|unavailable in this build/i)).not.toBeInTheDocument();
  });

  test("renders recent tag search and loaded local tags", async () => {
    localStorage.setItem(
      "url-qr-stl.short-urls",
      JSON.stringify([
        {
          id: "1",
          code: "ABC1234",
          originalUrl: "https://example.com/alpha",
          shortUrl: "https://short/ABC1234",
          templateId: "no-border",
          templateValues: {},
          createdAt: new Date().toISOString(),
        },
        {
          id: "2",
          code: "ZZZ9876",
          originalUrl: "https://example.com/zeta",
          shortUrl: "https://short/ZZZ9876",
          templateId: "no-border",
          templateValues: {},
          createdAt: new Date().toISOString(),
        },
      ])
    );

    renderEditor();

    expect(screen.getByPlaceholderText("Search by code or URL")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Load previous tag ABC1234" })).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Load previous tag ZZZ9876" })).toBeInTheDocument();
  });

  test("does not show legacy qr guidance copy for free users", () => {
    renderEditor();

    expect(screen.queryByText(/Balanced default for most tags\./i)).not.toBeInTheDocument();
  });

  test("allows premium users to select Frame QR", () => {
    const premiumProfile: Profile = {
      id: "test-user",
      plan: "premium",
      redirect_mode: "interstitial",
      stripe_customer_id: null,
      stripe_subscription_id: null,
      subscription_ends_at: null,
      monthly_scans: 0,
      monthly_reset_at: null,
      created_at: new Date().toISOString(),
    };

    const premiumUser = { id: "test-user", email: "premium@example.com" } as unknown as User;
    renderEditor(premiumProfile, premiumUser);

    expect(screen.getByText("QR type")).toBeInTheDocument();
    expect(screen.queryByText(/available on Premium/i)).not.toBeInTheDocument();
  });

});