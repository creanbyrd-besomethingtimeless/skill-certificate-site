/* Course logic: load curriculum.json, render days, quiz, progress, streak.
 * A day is complete only when its quiz is passed at 70 percent or more.
 * With 3 quiz questions, that means 3 out of 3 correct.
 * Progress is saved to Supabase when configured. Without Supabase,
 * progress is kept in this browser only (localStorage) so the course
 * can still be tried, and the page says so clearly.
 */
(function () {
  "use strict";

  var TOTAL_DAYS = 30;
  var PASS_MARK = 0.70;
  var LOCAL_KEY = "skillcert-progress-v1";
  var LOCAL_CAPSTONE_KEY = "skillcert-capstone-v1";

  var curriculum = null;
  var days = [];
  var completedDays = {}; /* day number -> { completed_at, quiz_score } */
  var capstoneDone = {};  /* check id -> true */
  var currentDay = 1;
  var currentUser = null;
  var quizState = { answers: {}, submitted: false, passed: false };

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------- Curriculum loading ---------- */
  /* Accepts curriculum.json in either shape:
   *   { days: [ {day, title, ...} ] }
   *   { weeks: [ { week, title, days: [ ... ] } ] }
   * Day fields used: day, title, goal, video_id / videoId / youtube_id /
   * video_url / videoUrl, steps / practical_steps, task / hands_on_task,
   * challenge / daily_challenge, quiz, weekly_project, capstone_checks.
   */
  async function loadCurriculum() {
    var res = await fetch("./curriculum.json");
    if (!res.ok) throw new Error("Could not load curriculum.json (HTTP " + res.status + ").");
    var data = await res.json();
    curriculum = data;
    days = normalizeDays(data);
    if (!days.length) throw new Error("curriculum.json has no days in it.");
    return data;
  }

  function normalizeDays(data) {
    var out = [];
    if (Array.isArray(data.days)) {
      data.days.forEach(function (d) { out.push(normalizeDay(d)); });
    } else if (Array.isArray(data.weeks)) {
      data.weeks.forEach(function (w) {
        (w.days || []).forEach(function (d) { out.push(normalizeDay(d, w)); });
      });
    }
    out.sort(function (a, b) { return a.day - b.day; });
    return out;
  }

  function normalizeDay(d, week) {
    /* Video can be a plain id string, a URL string, or an object such
     * as { channel, title, youtube_id }. All three are accepted. */
    var videoId = d.video_id || d.videoId || d.youtube_id || d.youtubeId || "";
    var videoUrl = d.video_url || d.videoUrl || "";
    var videoTitle = d.video_title || "";
    var videoChannel = "";
    var videoObj = d.video;
    if (videoObj && typeof videoObj === "object") {
      videoId = videoObj.youtube_id || videoObj.youtubeId || videoObj.id || videoId;
      videoTitle = videoObj.title || videoTitle;
      videoChannel = videoObj.channel || "";
    } else if (typeof videoObj === "string") {
      if (/youtu|v=/.test(videoObj)) videoUrl = videoObj;
      else if (!videoId) videoId = videoObj;
    }
    if (!videoId && videoUrl) videoId = extractVideoId(videoUrl);
    return {
      day: Number(d.day),
      title: d.title || ("Day " + d.day),
      week: (week && (week.week || week.number)) || d.week || Math.ceil(Number(d.day) / 7),
      weekTitle: (week && week.title) || d.week_title || "",
      goal: d.goal || d.objective || "",
      videoId: videoId,
      videoUrl: videoUrl,
      videoTitle: videoTitle,
      videoChannel: videoChannel,
      steps: d.steps || d.practical_steps || d.practicalSteps || [],
      task: d.task || d.hands_on_task || d.handsOnTask || "",
      challenge: d.challenge || d.daily_challenge || d.dailyChallenge || "",
      quiz: Array.isArray(d.quiz) ? d.quiz : [],
      weeklyProject: d.weekly_project || d.weeklyProject || d.project || null,
      capstoneChecks: d.capstone_checks || d.capstoneChecks || d.capstone || null
    };
  }

  function extractVideoId(url) {
    var m = String(url).match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : "";
  }

  function getDay(n) {
    for (var i = 0; i < days.length; i++) if (days[i].day === n) return days[i];
    return null;
  }

  function courseTitle() {
    if (curriculum && curriculum.course && curriculum.course.title) return curriculum.course.title;
    if (curriculum && curriculum.title) return curriculum.title;
    return "Full-Stack Web Development";
  }

  /* ---------- Progress: Supabase or local fallback ---------- */
  function localLoad() {
    try { completedDays = JSON.parse(localStorage.getItem(LOCAL_KEY) || "{}"); } catch (e) { completedDays = {}; }
    try { capstoneDone = JSON.parse(localStorage.getItem(LOCAL_CAPSTONE_KEY) || "{}"); } catch (e) { capstoneDone = {}; }
  }
  function localSave() {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(completedDays));
      localStorage.setItem(LOCAL_CAPSTONE_KEY, JSON.stringify(capstoneDone));
    } catch (e) { /* storage full or blocked, progress in memory only */ }
  }

  async function loadProgress(user) {
    currentUser = user || null;
    localLoad();
    var client = window.SkillApp && window.SkillApp.getClient ? window.SkillApp.getClient() : null;
    if (!client || !user) return completedDays;
    var res = await client.from("progress").select("day, completed_at, quiz_score").eq("user_id", user.id);
    if (!res.error && res.data) {
      completedDays = {};
      res.data.forEach(function (row) {
        completedDays[row.day] = { completed_at: row.completed_at, quiz_score: row.quiz_score };
      });
    }
    var cap = await client.from("capstone_checks").select("check_id").eq("user_id", user.id);
    if (!cap.error && cap.data) {
      capstoneDone = {};
      cap.data.forEach(function (row) { capstoneDone[row.check_id] = true; });
    }
    return completedDays;
  }

  async function saveDayComplete(dayNum, quizScore) {
    var record = { completed_at: new Date().toISOString(), quiz_score: quizScore };
    completedDays[dayNum] = record;
    localSave();
    var client = window.SkillApp && window.SkillApp.getClient ? window.SkillApp.getClient() : null;
    if (client && currentUser) {
      await client.from("progress").upsert(
        { user_id: currentUser.id, day: dayNum, completed_at: record.completed_at, quiz_score: quizScore },
        { onConflict: "user_id,day" }
      );
    }
    return record;
  }

  async function saveCapstoneCheck(checkId, checked) {
    if (checked) capstoneDone[checkId] = true; else delete capstoneDone[checkId];
    localSave();
    var client = window.SkillApp && window.SkillApp.getClient ? window.SkillApp.getClient() : null;
    if (!client || !currentUser) return;
    if (checked) {
      await client.from("capstone_checks").upsert(
        { user_id: currentUser.id, check_id: checkId, checked_at: new Date().toISOString() },
        { onConflict: "user_id,check_id" }
      );
    } else {
      await client.from("capstone_checks").delete().eq("user_id", currentUser.id).eq("check_id", checkId);
    }
  }

  function completedCount() { return Object.keys(completedDays).length; }
  function isDayComplete(n) { return Boolean(completedDays[n]); }
  function progressPercent() { return Math.round((completedCount() / TOTAL_DAYS) * 100); }

  /* Streak: consecutive calendar days with a completed day, counting
   * back from today. If nothing was completed today, count back from
   * yesterday so a streak is not lost on the current day alone. */
  function calculateStreak() {
    var dates = {};
    Object.keys(completedDays).forEach(function (k) {
      var d = completedDays[k].completed_at;
      if (d) dates[String(d).slice(0, 10)] = true;
    });
    var keys = Object.keys(dates);
    if (!keys.length) return 0;
    var cursor = new Date();
    var todayKey = cursor.toISOString().slice(0, 10);
    if (!dates[todayKey]) cursor.setDate(cursor.getDate() - 1);
    var streak = 0;
    while (dates[cursor.toISOString().slice(0, 10)]) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  function nextIncompleteDay() {
    for (var n = 1; n <= TOTAL_DAYS; n++) if (!isDayComplete(n)) return n;
    return TOTAL_DAYS;
  }

  /* All capstone checks across days 22 to 30, de-duplicated by id. */
  function allCapstoneChecks() {
    var seen = {};
    var out = [];
    days.forEach(function (d) {
      if (d.day < 22) return;
      (d.capstoneChecks || []).forEach(function (c) {
        var id = typeof c === "string" ? c : (c.id || c.label);
        var label = typeof c === "string" ? c : (c.label || c.id);
        if (!seen[id]) { seen[id] = true; out.push({ id: id, label: label }); }
      });
    });
    return out;
  }

  /* Default capstone checklist used when the curriculum does not
   * list its own checks for days 22 to 30. */
  function defaultCapstoneChecks() {
    return [
      { id: "capstone-plan", label: "Capstone plan written: what the app does and who it is for" },
      { id: "capstone-frontend", label: "Frontend built: pages, forms and navigation working" },
      { id: "capstone-backend", label: "Backend built: database, auth and API working" },
      { id: "capstone-deploy", label: "App deployed and reachable on a public link" },
      { id: "capstone-demo", label: "Demo recorded or written: a walkthrough of the finished app" }
    ];
  }

  function capstoneChecks() {
    var list = allCapstoneChecks();
    if (list.length) return list;
    if (curriculum && curriculum.capstone && Array.isArray(curriculum.capstone.checks) && curriculum.capstone.checks.length) {
      return curriculum.capstone.checks.map(function (label, i) {
        return { id: "capstone-" + (i + 1), label: String(label) };
      });
    }
    return defaultCapstoneChecks();
  }

  function capstoneCompleteCount() {
    return capstoneChecks().filter(function (c) { return capstoneDone[c.id]; }).length;
  }

  /* ---------- Landing page outline ---------- */
  function renderOutline(container) {
    if (!container) return;
    if (!days.length) {
      container.innerHTML = '<p class="muted">The course outline could not be loaded. Check that curriculum.json is in the site folder.</p>';
      return;
    }
    var html = "";
    var currentWeek = null;
    days.forEach(function (d) {
      if (d.week !== currentWeek) {
        currentWeek = d.week;
        var wt = d.weekTitle ? " - " + esc(d.weekTitle) : "";
        html += '<h3 class="week-heading">Week ' + esc(String(d.week)) + wt + "</h3>";
      }
      html += '<li><span class="day-num">Day ' + d.day + "</span><div><h3>" + esc(d.title) + "</h3>"
        + (d.goal ? "<p>" + esc(d.goal) + "</p>" : "") + "</div></li>";
    });
    container.innerHTML = html;
  }

  /* ---------- Dashboard ---------- */
  function renderDashboard() {
    var pct = progressPercent();
    var count = completedCount();
    var streak = calculateStreak();
    var next = nextIncompleteDay();
    var setText = function (id, v) { var n = el(id); if (n) n.textContent = v; };
    setText("stat-progress", pct + "%");
    setText("stat-completed", count + " / " + TOTAL_DAYS);
    setText("stat-streak", streak + (streak === 1 ? " day" : " days"));
    setText("stat-next-day", "Day " + next);
    var fill = el("progress-fill");
    if (fill) fill.style.width = pct + "%";
    var label = el("progress-label-text");
    if (label) label.textContent = count + " of " + TOTAL_DAYS + " days complete";
    var nextTitle = el("next-day-title");
    var nextGoal = el("next-day-goal");
    var nextLink = el("continue-link");
    var day = getDay(next);
    if (day) {
      if (nextTitle) nextTitle.textContent = "Day " + day.day + ": " + day.title;
      if (nextGoal) nextGoal.textContent = day.goal || "";
      if (nextLink) nextLink.href = "learn.html?day=" + day.day;
    }
    if (count === TOTAL_DAYS) {
      var doneBox = el("all-days-done");
      if (doneBox) doneBox.classList.remove("hidden");
    }
    var certBox = el("dashboard-cert-status");
    if (certBox) {
      var checks = capstoneChecks();
      var doneChecks = capstoneCompleteCount();
      if (count === TOTAL_DAYS && doneChecks === checks.length) {
        certBox.innerHTML = '<p><strong>Your certificate is ready.</strong> All 30 days are complete and every capstone check is ticked.</p><p><a class="btn" href="certificate.html">View your certificate</a></p>';
      } else {
        certBox.innerHTML = "<p>Certificate progress: " + count + " of " + TOTAL_DAYS + " days complete, "
          + doneChecks + " of " + checks.length + " capstone checks ticked.</p>"
          + '<p><a class="btn secondary" href="certificate.html">Check certificate status</a></p>';
      }
    }
    renderDashboardDayList();
  }

  function renderDashboardDayList() {
    var list = el("dashboard-day-list");
    if (!list || !days.length) return;
    var html = "";
    days.forEach(function (d) {
      var done = isDayComplete(d.day);
      html += '<li><span class="day-num">Day ' + d.day + "</span><div><h3>" + esc(d.title) + "</h3>"
        + (d.goal ? "<p>" + esc(d.goal) + "</p>" : "") + "</div>"
        + '<span class="day-status ' + (done ? "done" : "") + '">' + (done ? "Done" : "Not done") + "</span></li>";
    });
    list.innerHTML = html;
  }

  /* ---------- Learn page ---------- */
  function renderDayNav() {
    var list = el("day-nav-list");
    if (!list) return;
    var html = "";
    days.forEach(function (d) {
      var cls = "day-btn";
      if (d.day === currentDay) cls += " current";
      if (isDayComplete(d.day)) cls += " done";
      html += '<li><button type="button" class="' + cls + '" data-day="' + d.day + '">'
        + "<span>Day " + d.day + ": " + esc(d.title) + "</span>"
        + "<span>" + (isDayComplete(d.day) ? "Done" : "") + "</span></button></li>";
    });
    list.innerHTML = html;
    list.querySelectorAll("button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        showDay(Number(btn.getAttribute("data-day")));
      });
    });
  }

  function renderQuiz(day) {
    var box = el("quiz-box");
    if (!box) return;
    var quiz = day.quiz || [];
    if (!quiz.length) {
      box.innerHTML = "<p class=\"muted\">No quiz for this day.</p>";
      return;
    }
    quizState = { answers: {}, submitted: false, passed: false };
    var html = '<p class="small muted">Answer all ' + quiz.length + ' questions. You need '
      + Math.ceil(PASS_MARK * quiz.length) + " out of " + quiz.length
      + " correct (70 percent or more) to complete this day. You can retry as many times as you need.</p>";
    quiz.forEach(function (q, qi) {
      var text = typeof q === "string" ? q : (q.question || q.q || q.text || "");
      var options = (q && (q.options || q.choices)) || [];
      var correctIndex = typeof q.answer === "number" ? q.answer : (typeof q.correct === "number" ? q.correct : -1);
      html += '<div class="quiz-question" data-q="' + qi + '"><h3>Question ' + (qi + 1) + "</h3><p>" + esc(text) + "</p>";
      options.forEach(function (opt, oi) {
        html += '<button type="button" class="quiz-option" data-q="' + qi + '" data-o="' + oi + '" data-correct="' + (oi === correctIndex ? "1" : "0") + '">'
          + esc(String(opt)) + "</button>";
      });
      html += "</div>";
    });
    html += '<div id="quiz-result" class="hidden" style="margin-top:14px"></div>'
      + '<button type="button" class="btn" id="quiz-submit" style="margin-top:12px">Check my answers</button>'
      + '<button type="button" class="btn secondary hidden" id="quiz-retry" style="margin-top:12px">Try again</button>';
    box.innerHTML = html;

    box.querySelectorAll(".quiz-option").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (quizState.submitted) return;
        var q = btn.getAttribute("data-q");
        box.querySelectorAll('.quiz-option[data-q="' + q + '"]').forEach(function (b) { b.classList.remove("selected"); });
        btn.classList.add("selected");
        quizState.answers[q] = Number(btn.getAttribute("data-o"));
      });
    });
    var submit = el("quiz-submit");
    if (submit) submit.addEventListener("click", function () { submitQuiz(day); });
    var retry = el("quiz-retry");
    if (retry) retry.addEventListener("click", function () { renderQuiz(day); });
  }

  function submitQuiz(day) {
    var quiz = day.quiz || [];
    var answered = Object.keys(quizState.answers).length;
    var result = el("quiz-result");
    if (answered < quiz.length) {
      if (result) {
        result.className = "error";
        result.textContent = "Answer all " + quiz.length + " questions before checking your answers.";
      }
      return;
    }
    var correct = 0;
    quiz.forEach(function (q, qi) {
      var correctIndex = typeof q.answer === "number" ? q.answer : (typeof q.correct === "number" ? q.correct : -1);
      if (quizState.answers[String(qi)] === correctIndex) correct += 1;
    });
    var score = Math.round((correct / quiz.length) * 100);
    var passed = (correct / quiz.length) >= PASS_MARK;
    quizState.submitted = true;
    quizState.passed = passed;

    var box = el("quiz-box");
    if (box) {
      box.querySelectorAll(".quiz-option").forEach(function (btn) {
        btn.disabled = true;
        if (btn.getAttribute("data-correct") === "1") btn.classList.add("correct");
        else if (btn.classList.contains("selected")) btn.classList.add("wrong");
      });
      /* Show the explanation for each question, when the curriculum has one. */
      box.querySelectorAll(".quiz-question").forEach(function (qBox, qi) {
        var q = quiz[qi];
        if (q && q.explain && !qBox.querySelector(".quiz-explain")) {
          var p = document.createElement("p");
          p.className = "small muted quiz-explain";
          p.textContent = q.explain;
          qBox.appendChild(p);
        }
      });
    }
    if (result) {
      result.className = passed ? "success-box" : "error";
      result.textContent = passed
        ? "Passed: " + correct + " out of " + quiz.length + " correct (" + score + "%). Day " + day.day + " is complete."
        : "Not yet: " + correct + " out of " + quiz.length + " correct (" + score + "%). You need 70 percent or more. Try again.";
    }
    var submit = el("quiz-submit");
    if (submit) submit.classList.add("hidden");
    var retry = el("quiz-retry");
    if (retry && !passed) retry.classList.remove("hidden");

    if (passed) {
      saveDayComplete(day.day, score).then(function () {
        renderDayNav();
        var doneNote = el("day-complete-note");
        if (doneNote) doneNote.classList.remove("hidden");
        var markBtn = el("mark-complete-btn");
        if (markBtn) markBtn.classList.add("hidden");
        updateLearnProgress();
      });
    }
  }

  function updateLearnProgress() {
    var label = el("learn-progress-text");
    if (label) label.textContent = completedCount() + " of " + TOTAL_DAYS + " days complete (" + progressPercent() + "%)";
    var fill = el("learn-progress-fill");
    if (fill) fill.style.width = progressPercent() + "%";
  }

  function renderCapstonePanel(day) {
    var panel = el("capstone-panel");
    if (!panel) return;
    if (day.day < 22) { panel.classList.add("hidden"); panel.innerHTML = ""; return; }
    var checks = capstoneChecks();
    var cap = curriculum && curriculum.capstone ? curriculum.capstone : null;
    var html = "<h3>Capstone project checks</h3>"
      + (cap && cap.title ? "<p><strong>" + esc(cap.title) + "</strong></p>" : "")
      + (cap && cap.brief ? "<p>" + esc(cap.brief) + "</p>" : "")
      + "<p>Your certificate unlocks only when all 30 days are complete and every check below is ticked. Tick each one when it is truly done.</p>"
      + '<ul class="check-list">';
    checks.forEach(function (c) {
      html += '<li><input type="checkbox" id="cap-' + esc(c.id) + '" data-check="' + esc(c.id) + '"'
        + (capstoneDone[c.id] ? " checked" : "") + '>'
        + '<label for="cap-' + esc(c.id) + '" style="margin:0;font-weight:400">' + esc(c.label) + "</label></li>";
    });
    html += "</ul>"
      + (cap && cap.deliverables && cap.deliverables.length ? "<p><strong>Deliverables:</strong> " + cap.deliverables.map(function (d) { return esc(d); }).join(", ") + ".</p>" : "")
      + '<p class="small muted" id="capstone-count-text">' + capstoneCompleteCount() + " of " + checks.length + " checks ticked.</p>";
    panel.innerHTML = html;
    panel.classList.remove("hidden");
    panel.querySelectorAll("input[type=checkbox]").forEach(function (cb) {
      cb.addEventListener("change", function () {
        saveCapstoneCheck(cb.getAttribute("data-check"), cb.checked).then(function () {
          var t = el("capstone-count-text");
          if (t) t.textContent = capstoneCompleteCount() + " of " + capstoneChecks().length + " checks ticked.";
        });
      });
    });
  }

  function showDay(n) {
    var day = getDay(n);
    if (!day) return;
    currentDay = n;
    quizState = { answers: {}, submitted: false, passed: false };
    var setText = function (id, v) { var node = el(id); if (node) node.textContent = v; };
    setText("day-kicker", "Day " + day.day + " of 30" + (day.weekTitle ? " - Week " + day.week + ": " + day.weekTitle : ""));
    setText("day-title", day.title);
    setText("day-goal", day.goal || "");
    var doneNote = el("day-complete-note");
    if (doneNote) doneNote.classList.toggle("hidden", !isDayComplete(day.day));

    var videoBox = el("video-box");
    if (videoBox) {
      if (day.videoId) {
        var videoCaption = "";
        if (day.videoTitle) videoCaption = "<p class=\"small muted\">Video: " + esc(day.videoTitle) + (day.videoChannel ? " - " + esc(day.videoChannel) : "") + "</p>";
        videoBox.innerHTML = videoCaption + '<div class="video-wrap"><iframe src="https://www.youtube-nocookie.com/embed/'
          + esc(day.videoId) + '" title="Day ' + day.day + ' video: ' + esc(day.title)
          + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>';
      } else if (day.videoUrl) {
        videoBox.innerHTML = '<p><a class="btn secondary" href="' + esc(day.videoUrl) + '" target="_blank" rel="noopener">Watch the Day ' + day.day + " video</a></p>";
      } else {
        videoBox.innerHTML = '<p class="muted">No video link is set for this day yet.</p>';
      }
    }

    var stepsBox = el("steps-box");
    if (stepsBox) {
      stepsBox.innerHTML = (day.steps && day.steps.length)
        ? "<ol>" + day.steps.map(function (s) { return "<li>" + esc(String(s)) + "</li>"; }).join("") + "</ol>"
        : '<p class="muted">No practical steps listed for this day.</p>';
    }
    var taskBox = el("task-box");
    if (taskBox) taskBox.textContent = day.task || "No hands-on task listed for this day.";
    var challengeBox = el("challenge-box");
    if (challengeBox) challengeBox.textContent = day.challenge || "No daily challenge listed for this day.";

    var projectCard = el("weekly-project-card");
    if (projectCard) {
      if (day.weeklyProject && (day.day === 7 || day.day === 14 || day.day === 21)) {
        var p = day.weeklyProject;
        var pTitle = typeof p === "string" ? p : (p.title || "Weekly project");
        var pDesc = typeof p === "string" ? "" : (p.description || p.goal || p.brief || "");
        var pDeliver = typeof p === "string" ? [] : (p.deliverables || p.tasks || p.checks || []);
        projectCard.innerHTML = "<h3>Weekly project: " + esc(pTitle) + "</h3>"
          + (pDesc ? "<p>" + esc(pDesc) + "</p>" : "")
          + (pDeliver.length ? "<ul>" + pDeliver.map(function (x) { return "<li>" + esc(String(x)) + "</li>"; }).join("") + "</ul>" : "")
          + "<p class=\"small muted\">Finish the project, then pass the quiz below to complete Day " + day.day + ".</p>";
        projectCard.classList.remove("hidden");
      } else {
        projectCard.classList.add("hidden");
        projectCard.innerHTML = "";
      }
    }

    renderQuiz(day);
    renderCapstonePanel(day);
    renderDayNav();
    updateLearnProgress();
    var prev = el("prev-day-btn");
    var next = el("next-day-btn");
    if (prev) { prev.disabled = day.day <= 1; prev.onclick = function () { showDay(day.day - 1); }; }
    if (next) { next.disabled = day.day >= TOTAL_DAYS; next.onclick = function () { showDay(day.day + 1); }; }
    var url = new URL(window.location.href);
    url.searchParams.set("day", String(day.day));
    window.history.replaceState(null, "", url.toString());
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function dayFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var n = Number(params.get("day"));
    return (n >= 1 && n <= TOTAL_DAYS) ? n : nextIncompleteDay();
  }

  /* Public API used by the pages. */
  window.SkillCourse = {
    TOTAL_DAYS: TOTAL_DAYS,
    PASS_MARK: PASS_MARK,
    loadCurriculum: loadCurriculum,
    loadProgress: loadProgress,
    getDays: function () { return days; },
    getDay: getDay,
    courseTitle: courseTitle,
    completedCount: completedCount,
    isDayComplete: isDayComplete,
    progressPercent: progressPercent,
    calculateStreak: calculateStreak,
    nextIncompleteDay: nextIncompleteDay,
    capstoneChecks: capstoneChecks,
    capstoneCompleteCount: capstoneCompleteCount,
    capstoneDone: function () { return capstoneDone; },
    saveCapstoneCheck: saveCapstoneCheck,
    renderOutline: renderOutline,
    renderDashboard: renderDashboard,
    renderDayNav: renderDayNav,
    showDay: showDay,
    dayFromUrl: dayFromUrl
  };
})();
