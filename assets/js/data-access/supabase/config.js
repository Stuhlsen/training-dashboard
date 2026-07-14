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

export function getConfig() {
  const host = window.location.hostname;
  const port = window.location.port ? `:${window.location.port}` : '';
  const fullHost = port ? `${host}${port}` : host;

  if (SUPABASE_CONFIG[fullHost]) return SUPABASE_CONFIG[fullHost];
  if (SUPABASE_CONFIG[host])     return SUPABASE_CONFIG[host];

  throw new Error(
    `[Supabase] Hostname "${fullHost}" nicht bekannt. ` +
    `Erwartet: ${Object.keys(SUPABASE_CONFIG).join(', ')}`
  );
}
