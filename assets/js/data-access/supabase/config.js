const SUPABASE_CONFIG = {
  'localhost': {
    projectUrl: 'https://wxkuwhzpsbkmbhaqrurv.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind4a3V3aHpwc2JrbWJoYXFydXJ2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNDg4NDQsImV4cCI6MjA5OTYyNDg0NH0.l3PuErI7TJr7IRBYE4wSAUH0ZHiDS2sLWehdHOlXk1Q'
  },
  '127.0.0.1': {
    projectUrl: 'DEINE_PROJECT_URL',
    anonKey: 'DEIN_ANON_KEY'
  },
  'stuhlsen.github.io': {
    projectUrl: '',
    anonKey: ''
  }
};

/** Liefert die Supabase-Config für den aktuellen Hostname, oder null wenn
 *  der Host unbekannt ist oder die Config (noch) leere Platzhalter hat
 *  (z.B. dashboard-prod vor Phase-1-Merge) — Aufrufer degradieren dann
 *  graceful statt zu crashen (s. client.js). */
export function getConfig() {
  const host = window.location.hostname;
  const port = window.location.port ? `:${window.location.port}` : '';
  const fullHost = port ? `${host}${port}` : host;

  const cfg = SUPABASE_CONFIG[fullHost] || SUPABASE_CONFIG[host];
  if (!cfg || !cfg.projectUrl || !cfg.anonKey) return null;
  return cfg;
}
