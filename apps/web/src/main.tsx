import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { SessionProvider } from "./session";
import { HomePage, JoinPage, LobbyPage, GamePage, Shell } from "./pages";
import { RulebookPage } from "./rulebook";
import { RulebookModal } from "./rulebook-modal";
import "./ui/tokens.css";
import "./ui/base.css";
import "./ui/game.css";
import "./ui/menu.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <RulebookModal />
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
