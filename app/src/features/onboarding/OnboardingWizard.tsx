/* ============================================================
   FEATURES/ONBOARDING/ONBOARDINGWIZARD.TSX — Fahrplan 17 E7

   Reine Orchestrierung, welcher Schritt gerade dran ist (V5-Contract) —
   keine eigene Feldlogik. Die Schritte sind entweder der neue
   SetPasswordStep (Pflicht) oder bestehende Settings-Sektionen, hier nur
   als Wizard-Schritt eingebunden (ProfileBasicsSection/IntervalsSection,
   beide laufen unverändert auch standalone in Settings).

   Reihenfolge: Passwort (Pflicht) → Profil-Basisdaten (überspringbar) →
   intervals.icu-Key (überspringbar) → onFinished().
   ============================================================ */

import { useState } from "react";
import { GlassCard } from "../../components/GlassCard";
import { SetPasswordStep } from "./SetPasswordStep";
import { ProfileBasicsSection } from "../settings/ProfileBasicsSection";
import { IntervalsSection } from "../settings/IntervalsSection";

type Step = "password" | "profile" | "intervals";

export interface OnboardingWizardProps {
  onFinished: () => void;
}

export function OnboardingWizard({ onFinished }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>("password");

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <GlassCard variant="strong" radius="var(--radius-xl)" style={{ width: "100%", maxWidth: 440, padding: "36px 32px" }}>
        <h1
          style={{
            margin: "0 0 24px",
            fontFamily: "var(--font-disp)",
            fontSize: "1.6rem",
            fontWeight: 600,
            color: "var(--ink)",
            textAlign: "center",
          }}
        >
          Willkommen
        </h1>

        {step === "password" && <SetPasswordStep onComplete={() => setStep("profile")} />}
        {step === "profile" && (
          <ProfileBasicsSection onComplete={() => setStep("intervals")} onSkip={() => setStep("intervals")} />
        )}
        {step === "intervals" && <IntervalsSection onComplete={onFinished} onSkip={onFinished} />}
      </GlassCard>
    </div>
  );
}
