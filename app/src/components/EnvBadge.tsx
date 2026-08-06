import { getEnvironment } from "../api/supabase/config";

export function EnvBadge() {
  const env = getEnvironment();
  return <span data-testid="env-badge">{env}</span>;
}
