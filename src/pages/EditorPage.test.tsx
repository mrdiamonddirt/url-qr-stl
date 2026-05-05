import React from "react";
import { render, screen } from "@testing-library/react";
import { IonApp } from "@ionic/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import EditorPage from "./EditorPage";

function renderEditor() {
  return render(
    <IonApp>
      <MemoryRouter>
        <EditorPage user={null} profile={null} />
      </MemoryRouter>
    </IonApp>
  );
}

describe("EditorPage template picker", () => {
  test("shows text controls only for templates that support editable CTA text", async () => {
    const user = userEvent.setup();
    renderEditor();

    expect(screen.getAllByRole("button", { name: /Select template /i })).toHaveLength(7);
    expect(screen.getByRole("button", { name: "Select template No Border" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Simple Border" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Fancy Border" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Scan Me" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Open Link" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Scan Me Loop" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Scan Me Big Loop" })).toBeInTheDocument();

    expect(screen.getByText(/No text fields for this template/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Type text for this template")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Select template Scan Me" }));

    expect((await screen.findAllByPlaceholderText("Type text for this template")).length).toBeGreaterThan(0);
    expect(screen.getByText(/^Text size \(/i)).toBeInTheDocument();
  });
});