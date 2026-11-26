/* Certificate logic: capstone gate, generation, verification lookup.
 * The certificate unlocks only when all 30 days are complete AND every
 * capstone check is ticked. The verification code format is
 * SC-YYYY-XXXXXX, where XXXXXX is 6 random uppercase letters or digits.
 */
(function () {
  "use strict";

  var SKILL_NAME = "Full-Stack Web Development";

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function generateCode() {
    var year = new Date().getFullYear();
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var out = "";
    for (var i = 0; i < 6; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return "SC-" + year + "-" + out;
  }

  function isCodeFormat(code) {
    return /^SC-\d{4}-[A-Z0-9]{6}$/.test(String(code || "").trim().toUpperCase());
  }

  /* Returns { unlocked, daysDone, daysTotal, checksDone, checksTotal }. */
  function gateStatus() {
    var course = window.SkillCourse;
    var daysDone = course ? course.completedCount() : 0;
    var checks = course ? course.capstoneChecks() : [];
    var checksDone = course ? course.capstoneCompleteCount() : 0;
    return {
      unlocked: daysDone >= 30 && checksDone === checks.length && checks.length > 0,
      daysDone: daysDone,
      daysTotal: 30,
      checksDone: checksDone,
      checksTotal: checks.length
    };
  }

  async function findCertificate(user) {
    var client = window.SkillApp && window.SkillApp.getClient ? window.SkillApp.getClient() : null;
    if (!client || !user) return null;
    var res = await client.from("certificates")
      .select("id, code, skill, learner_name, issued_at")
      .eq("user_id", user.id).eq("skill", SKILL_NAME)
      .maybeSingle();
    if (res.error) return null;
    return res.data || null;
  }

  async function createCertificate(user, learnerName) {
    var client = window.SkillApp && window.SkillApp.getClient ? window.SkillApp.getClient() : null;
    if (!client || !user) return null;
    /* Retry a few times in case the random code already exists. */
    for (var attempt = 0; attempt < 5; attempt++) {
      var code = generateCode();
      var res = await client.from("certificates").insert({
        user_id: user.id,
        code: code,
        skill: SKILL_NAME,
        learner_name: learnerName,
        issued_at: new Date().toISOString()
      }).select().single();
      if (!res.error && res.data) return res.data;
      if (res.error && !/duplicate|unique/i.test(res.error.message || "")) return null;
    }
    return null;
  }

  function learnerNameFromUser(user, profile) {
    if (profile && profile.full_name) return profile.full_name;
    if (user && user.user_metadata && user.user_metadata.full_name) return user.user_metadata.full_name;
    if (user && user.user_metadata && user.user_metadata.name) return user.user_metadata.name;
    if (user && user.email) return user.email;
    return "Learner";
  }

  function renderCertificateSheet(cert) {
    var sheet = el("certificate-sheet");
    if (!sheet) return;
    var issued = cert.issued_at ? new Date(cert.issued_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";
    var verifyUrl = window.location.origin + window.location.pathname.replace("certificate.html", "verify.html")
      + "?code=" + encodeURIComponent(cert.code);
    sheet.innerHTML =
      '<p class="cert-kicker">Certificate of Completion</p>'
      + "<h2>" + esc(cert.skill) + "</h2>"
      + "<p>This certificate is awarded to</p>"
      + '<p class="cert-name">' + esc(cert.learner_name) + "</p>"
      + "<p>for completing the 30 day " + esc(cert.skill) + " course, including the capstone project.</p>"
      + '<p class="cert-meta">Issued ' + esc(issued) + "<br>Verification code: <span class=\"cert-code\">" + esc(cert.code) + "</span></p>"
      + '<p class="cert-meta small">Verify at: <a href="' + esc(verifyUrl) + '">' + esc(verifyUrl) + "</a></p>";
    sheet.classList.remove("hidden");
    var linkInput = el("verify-link");
    if (linkInput) linkInput.value = verifyUrl;
  }

  async function initCertificatePage() {
    var session = await window.SkillApp.requireAuth();
    if (!session) return;
    var user = session.user;
    await window.SkillCourse.loadProgress(user);
    var gate = gateStatus();
    var statusBox = el("cert-status");
    var lockedBox = el("cert-locked");
    var readyBox = el("cert-ready");

    if (!gate.unlocked) {
      if (statusBox) statusBox.classList.add("hidden");
      if (lockedBox) {
        lockedBox.classList.remove("hidden");
        var detail = el("cert-locked-detail");
        if (detail) {
          detail.textContent = "You have completed " + gate.daysDone + " of " + gate.daysTotal
            + " days and ticked " + gate.checksDone + " of " + gate.checksTotal
            + " capstone checks. Finish all 30 days and tick every capstone check to unlock your certificate.";
        }
      }
      if (readyBox) readyBox.classList.add("hidden");
      return;
    }

    if (lockedBox) lockedBox.classList.add("hidden");
    if (readyBox) readyBox.classList.remove("hidden");
    if (statusBox) {
      statusBox.classList.remove("hidden");
      statusBox.textContent = "Unlocked: all 30 days complete and all capstone checks ticked.";
    }

    var existing = await findCertificate(user);
    if (existing) {
      renderCertificateSheet(existing);
      return;
    }

    /* No certificate stored yet. Without Supabase, show it on screen
     * only and say clearly that it is not stored or verifiable yet. */
    if (!window.SkillApp.isConfigured()) {
      var name = learnerNameFromUser(user, null);
      var temp = {
        skill: SKILL_NAME,
        learner_name: name,
        code: generateCode(),
        issued_at: new Date().toISOString()
      };
      renderCertificateSheet(temp);
      var note = el("cert-unsaved-note");
      if (note) {
        note.classList.remove("hidden");
        note.textContent = "Supabase is not set up yet, so this certificate is shown on screen only. It is not saved and the verification link will not work until Supabase is configured and the certificate is stored.";
      }
      return;
    }

    var profile = null;
    var client = window.SkillApp.getClient();
    if (client) {
      var p = await client.from("profiles").select("full_name").eq("id", user.id).maybeSingle();
      if (!p.error && p.data) profile = p.data;
    }
    var created = await createCertificate(user, learnerNameFromUser(user, profile));
    if (created) {
      renderCertificateSheet(created);
    } else {
      var errBox = el("cert-error");
      if (errBox) {
        errBox.classList.remove("hidden");
        errBox.textContent = "Your certificate is unlocked, but it could not be saved. Check your Supabase setup and try again.";
      }
    }
  }

  async function initVerifyPage() {
    var params = new URLSearchParams(window.location.search);
    var code = (params.get("code") || "").trim().toUpperCase();
    var resultBox = el("verify-result");
    var form = el("verify-form");
    var input = el("verify-code-input");
    if (input && code) input.value = code;
    if (!resultBox) return;

    if (!code) {
      resultBox.innerHTML = '<p class="muted">Enter a verification code to check a certificate, or open a verification link.</p>';
      return;
    }
    if (!isCodeFormat(code)) {
      resultBox.className = "verify-result invalid";
      resultBox.innerHTML = '<p class="big">Invalid code</p><p>Codes look like SC-2026-ABC123. Check the code and try again.</p>';
      return;
    }
    if (!window.SkillApp.isConfigured()) {
      resultBox.className = "verify-result";
      resultBox.innerHTML = '<p class="big">Verification is not set up yet</p><p>' + esc(window.SkillApp.SETUP_MESSAGE) + "</p>";
      return;
    }
    var client = window.SkillApp.getClient();
    var res = await client.from("certificates")
      .select("code, skill, learner_name, issued_at")
      .eq("code", code).maybeSingle();
    if (res.error) {
      resultBox.className = "verify-result invalid";
      resultBox.innerHTML = "<p class=\"big\">Could not verify</p><p>Something went wrong while checking this code. Please try again.</p>";
      return;
    }
    if (!res.data) {
      resultBox.className = "verify-result invalid";
      resultBox.innerHTML = '<p class="big">Not found</p><p>No certificate matches code ' + esc(code) + ". Check the code and try again.</p>";
      return;
    }
    var issued = res.data.issued_at
      ? new Date(res.data.issued_at).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })
      : "Unknown date";
    resultBox.className = "verify-result valid";
    resultBox.innerHTML = '<p class="big">Valid certificate</p>'
      + "<p><strong>" + esc(res.data.learner_name) + "</strong><br>"
      + esc(res.data.skill) + "<br>Issued " + esc(issued) + "<br>Code: <span class=\"cert-code\">" + esc(res.data.code) + "</span></p>";
  }

  window.SkillCertificate = {
    SKILL_NAME: SKILL_NAME,
    generateCode: generateCode,
    isCodeFormat: isCodeFormat,
    gateStatus: gateStatus,
    findCertificate: findCertificate,
    createCertificate: createCertificate,
    initCertificatePage: initCertificatePage,
    initVerifyPage: initVerifyPage
  };
})();
