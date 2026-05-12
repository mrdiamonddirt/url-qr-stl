import React from "react";
import { render, screen } from "@testing-library/react";
import { IonApp } from "@ionic/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { User } from "@supabase/supabase-js";
import { vi } from "vitest";
import EditorPage from "./EditorPage";
import { Profile } from "../types";

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

    expect(screen.getByText("Direct Link")).toBeInTheDocument();
    expect(screen.getByTestId("instant-redirect-state")).toHaveTextContent("Locked");
  });

  test("prompts free users to upgrade when they try direct link", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderEditor();

    await user.click(screen.getByLabelText("Direct link toggle"));

    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByText("Direct Link is a Premium feature.")).toBeInTheDocument();

    confirmSpy.mockRestore();
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

    expect(screen.getByText("Direct Link")).toBeInTheDocument();
    expect(screen.getByTestId("instant-redirect-state")).toHaveTextContent("Off");
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

  test("shows qr type selector and unavailable symbology guidance", () => {
    renderEditor();

    expect(screen.getByText(/Micro QR, rMQR, iQR, and SQRC are unavailable in this build\./i)).toBeInTheDocument();
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

  test("shows Frame QR as locked (Premium) for free users", () => {
    renderEditor();

    const qrTypeSelect = screen.getByRole("combobox", { name: "QR type" });
    expect(qrTypeSelect).toBeInTheDocument();

    const frameQrOption = screen.getByRole("option", { name: /Frame QR \(Premium\)/ });
    expect(frameQrOption).toHaveAttribute("disabled");
  });

  test("prompts free users to upgrade when they try to select Frame QR", async () => {
    const user = userEvent.setup();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderEditor();

    const qrTypeSelect = screen.getByRole("combobox", { name: "QR type" });
    await user.click(qrTypeSelect);

    const frameQrOption = screen.getByRole("option", { name: /Frame QR \(Premium\)/ });
    expect(frameQrOption).toHaveAttribute("disabled");

    confirmSpy.mockRestore();
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

    const qrTypeSelect = screen.getByRole("combobox", { name: "QR type" });
    expect(qrTypeSelect).toBeInTheDocument();

    const frameQrOption = screen.queryByRole("option", { name: /Frame QR \(Premium\)/ });
    const standardFrameQrOption = screen.getByRole("option", { name: "Frame QR" });
    expect(standardFrameQrOption).not.toHaveAttribute("disabled");
  });
});