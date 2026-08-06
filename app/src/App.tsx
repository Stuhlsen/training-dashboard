import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { LoginPage } from "./features/auth/LoginPage";
import { HeroPage } from "./features/hero/HeroPage";
import { PlanningPage } from "./features/planning/PlanningPage";
import { TrainerPage } from "./features/trainer/TrainerPage";
import { ExplorerPage } from "./features/explorer/ExplorerPage";
import { EventsPage } from "./features/events/EventsPage";
import { SettingsPage } from "./features/settings/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route index element={<HeroPage />} />
          <Route path="planning" element={<PlanningPage />} />
          <Route path="trainer" element={<TrainerPage />} />
          <Route path="explorer" element={<ExplorerPage />} />
          <Route path="events" element={<EventsPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
