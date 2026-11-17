import React from "react";
import { useParams } from "react-router";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { SessionProvider } from "./session";
import { HomePage, LobbyPage, GamePage, Shell } from "./pages";
import { RulebookPage } from "./rulebook";
import { RulebookModal } from "./rulebook-modal";
import "./ui/tokens.css";
import "./ui/base.css";
import "./ui/game.css";
import "./ui/menu.css";
import "./ui/game-compact.css";
import "./ui/cursors.css";

function JoinInviteRedirect() {
  const { code = "" } = useParams();
  return <Navigate to={"/?code=" + encodeURIComponent(code.toUpperCase())} replace />;
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <RulebookModal />
        <Shell>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/create" element={<Navigate to="/" replace />} />
            <Route path="/join" element={<Navigate to="/" replace />} />
            <Route path="/join/:code" element={<JoinInviteRedirect />} />
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
