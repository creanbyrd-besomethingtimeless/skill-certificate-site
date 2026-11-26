/* Supabase configuration.
 *
 * Replace the two placeholder values below with the real values from
 * your Supabase project dashboard: Project Settings > API.
 *
 * SUPABASE_URL: the Project URL, for example https://xyzcompany.supabase.co
 * SUPABASE_ANON_KEY: the anon public key (NOT the service_role key).
 *
 * Never put the service_role key in this file. It is secret and it
 * bypasses Row Level Security. Only the anon key belongs in the browser.
 */
window.APP_CONFIG = {
  SUPABASE_URL: "https://lmcuovngbipumlfeiuxi.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxtY3Vvdm5nYmlwdW1sZmVpdXhpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2NTEzMTIsImV4cCI6MjExMTIyNzMxMn0.pWMpuKjK8qf52m-1BpCkBahdze19XYGn57PSCUCTIwI"
};

/* True when real keys have been entered. The app checks this before
 * calling Supabase, so a missing setup shows a clear message instead
 * of failing silently. */
window.APP_CONFIG.isConfigured = function () {
  var c = window.APP_CONFIG;
  return Boolean(c.SUPABASE_URL && c.SUPABASE_ANON_KEY
    && c.SUPABASE_URL !== "YOUR_SUPABASE_URL"
    && c.SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY"
    && c.SUPABASE_URL.indexOf("supabase.co") !== -1);
};
