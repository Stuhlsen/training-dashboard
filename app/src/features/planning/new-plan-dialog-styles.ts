import type React from "react";

export const LABEL_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: ".76rem",
  color: "var(--ink-3)",
};

export const BTN_STYLE: React.CSSProperties = {
  border: "1px solid var(--hair)",
  borderRadius: "var(--pill)",
  padding: "8px 16px",
  background: "transparent",
  color: "var(--ink-2)",
  font: "inherit",
  fontSize: ".82rem",
  cursor: "pointer",
};

export const PRIMARY_BTN_STYLE: React.CSSProperties = {
  ...BTN_STYLE,
  background: "var(--ss)",
  borderColor: "var(--ss)",
  color: "#17110a",
  fontWeight: 600,
};

export const PILL_STYLE: React.CSSProperties = {
  ...BTN_STYLE,
  padding: "6px 12px",
  fontSize: ".78rem",
};