import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { SessionProvider } from "./session";
import { HomePage, JoinPage, LobbyPage, GamePage, Shell } from "./pages";
import { RulebookPage } from "./rulebook";
import "./style.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <Shell>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/create" element={<JoinPage create />} />
            <Route path="/join" element={<JoinPage />} />
            <Route path="/join/:code" element={<JoinPage />} />
            <Route path="/lobby/:code" element={<LobbyPage />} />
            <Route path="/game/:code" element={<GamePage />} />
            <Route path="/rules" element={<RulebookPage />} />
            <Route path="/rules/:chapter" element={<RulebookPage />} />
            <Route path="*" element={<HomePage />} />
          </Routes>
        </Shell>
      </SessionProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
