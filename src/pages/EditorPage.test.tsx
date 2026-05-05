import React from "react";
import { render, screen } from "@testing-library/react";
import { IonApp } from "@ionic/react";
import { MemoryRouter } from "react-router-dom";
import EditorPage from "./EditorPage";

function renderEditor() {
  return render(
    <IonApp>
      <MemoryRouter>
        <EditorPage user={null} />
      </MemoryRouter>
    </IonApp>
  );
}

describe("EditorPage template picker", () => {
  test("shows the simplified QR-only template set with no text inputs", () => {
    renderEditor();

    expect(screen.getAllByRole("button", { name: /Select template /i })).toHaveLength(5);
    expect(screen.getByRole("button", { name: "Select template No Border" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Simple Border" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Fancy Border" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Scan Me" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select template Open Link" })).toBeInTheDocument();
    expect(screen.getByText(/No text fields yet/i)).toBeInTheDocument();
    expect(screen.queryByText("Top text")).not.toBeInTheDocument();
    expect(screen.queryByText("Bottom text")).not.toBeInTheDocument();
  });
});