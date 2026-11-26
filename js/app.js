/* Shared app logic: Supabase client, auth helpers, route guards.
 * Loaded on every page after config.js and the supabase-js CDN script.
 * Plain copy, no filler. If Supabase is not configured, pages show a
 * clear setup message and do not fail silently.
 */
(function () {
  "use strict";

  var SETUP_MESSAGE = "Setup needed: add your Supabase URL and anon key in js/config.js, then run supabase/schema.sql in the Supabase SQL editor. See README.md.";

  function isConfigured() {
    return window.APP_CONFIG && typeof window.APP_CONFIG.isConfigured === "function"
      ? window.APP_CONFIG.isConfigured()
      : false;
  }

  function showSetupNotice() {
    var slots = document.querySelectorAll("[data-setup-notice]");
    slots.forEach(function (el) {
      el.classList.remove("hidden");
      el.textContent = SETUP_MESSAGE;
    });
    var banners = document.querySelectorAll("[data-setup-banner]");
    banners.forEach(function (el) {
      el.classList.remove("hidden");
      el.textContent = SETUP_MESSAGE;
    });
  }

  /* Create the Supabase client, or null when not configured. */
  var supabaseClient = null;
  function getClient() {
    if (supabaseClient) return supabaseClient;
    if (!isConfigured()) return null;
    if (!window.supabase || !window.supabase.createClient) return null;
    supabaseClient = window.supabase.createClient(
      window.APP_CONFIG.SUPABASE_URL,
      window.APP_CONFIG.SUPABASE_ANON_KEY
    );
    return supabaseClient;
  }

  /* Friendly message for common Supabase auth errors. */
  function friendlyAuthError(err) {
    if (!err) return "Something went wrong. Please try again.";
    var msg = err.message || String(err);
    if (/invalid login credentials/i.test(msg)) return "Email or password is wrong. Check both and try again.";
    if (/user already registered/i.test(msg) || /already registered/i.test(msg)) return "An account already exists for this email. Sign in instead.";
    if (/password/i.test(msg) && /at least/i.test(msg)) return "Password must be at least 6 characters.";
    if (/email.*confirm/i.test(msg)) return "Check your email and confirm your account, then sign in.";
    if (/email.*invalid/i.test(msg)) return "Enter a valid email address.";
    if (/rate limit/i.test(msg)) return "Too many attempts. Wait a few minutes and try again.";
    return msg;
  }

  function showError(el, err) {
    if (!el) return;
    el.textContent = friendlyAuthError(err);
    el.classList.remove("hidden");
  }
  function hideError(el) { if (el) el.classList.add("hidden"); }

  function showMessage(el, text) {
    if (!el) return;
    el.textContent = text;
    el.classList.remove("hidden");
  }

  async function getSession() {
    var client = getClient();
    if (!client) return null;
    var res = await client.auth.getSession();
    if (res.error) return null;
    return res.data ? res.data.session : null;
  }

  async function getUser() {
    var client = getClient();
    if (!client) return null;
    var res = await client.auth.getUser();
    if (res.error) return null;
    return res.data ? res.data.user : null;
  }

  /* Ensure a profiles row exists for this user. Called after sign in
   * and sign up. The full name comes from user metadata. */
  async function ensureProfile(user) {
    var client = getClient();
    if (!client || !user) return null;
    var name = (user.user_metadata && user.user_metadata.full_name)
      || (user.user_metadata && user.user_metadata.name)
      || "";
    var res = await client.from("profiles").upsert(
      { id: user.id, full_name: name },
      { onConflict: "id" }
    ).select().single();
    if (res.error) return null;
    return res.data;
  }

  async function signOut() {
    var client = getClient();
    if (client) await client.auth.signOut();
    window.location.href = "index.html";
  }

  /* Protect a page: redirect to auth.html when signed out.
   * When Supabase is not configured, show the setup notice and stop. */
  async function requireAuth() {
    if (!isConfigured()) {
      showSetupNotice();
      return null;
    }
    var session = await getSession();
    if (!session) {
      window.location.href = "auth.html";
      return null;
    }
    return session;
  }

  /* On public pages, update the nav to show the signed in state. */
  async function updateNav() {
    var session = await getSession();
    var signedIn = document.querySelectorAll("[data-nav-signed-in]");
    var signedOut = document.querySelectorAll("[data-nav-signed-out]");
    signedIn.forEach(function (el) { el.classList.toggle("hidden", !session); });
    signedOut.forEach(function (el) { el.classList.toggle("hidden", !!session); });
  }

  /* Wire every [data-sign-out] button on the page. */
  function wireSignOut() {
    document.querySelectorAll("[data-sign-out]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        signOut();
      });
    });
  }

  function currentYear() {
    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    if (!isConfigured()) showSetupNotice();
    currentYear();
    wireSignOut();
    updateNav();
  });

  window.SkillApp = {
    isConfigured: isConfigured,
    getClient: getClient,
    getSession: getSession,
    getUser: getUser,
    ensureProfile: ensureProfile,
    signOut: signOut,
    requireAuth: requireAuth,
    friendlyAuthError: friendlyAuthError,
    showError: showError,
    hideError: hideError,
    showMessage: showMessage,
    SETUP_MESSAGE: SETUP_MESSAGE
  };
})();
