# TYE Skill Certificate

Learn a skill in 30 days, get a certificate, show it to employers.

First course: **Full-Stack Web Development**. One lesson a day, with a video, a goal, practical steps, a hands-on task, a daily challenge, and a 3 question quiz. A day is complete only when its quiz is passed at 70 percent or more. The certificate unlocks only when all 30 days are complete and every capstone check is ticked.

Stack: plain HTML, CSS and JavaScript (no build step) plus Supabase for auth and Postgres. Deploy by dropping the site folder into Netlify Drop.

## Files

| File | What it does |
| --- | --- |
| `index.html` | Landing page: hero, how it works, 30 day outline from `curriculum.json`, certificate preview, sign-up CTA |
| `auth.html` | Sign in and sign up tabs, Google button, email and password forms |
| `dashboard.html` | Protected: progress bar, current day, streak, certificates, continue learning |
| `learn.html` | Protected: day selector 1 to 30, video, goal, steps, task, quiz, challenge, weekly project cards on days 7, 14 and 21, capstone panel on days 22 to 30 |
| `certificate.html` | Protected: certificate when unlocked, print button, shareable verification link |
| `verify.html` | Public: `?code=SC-...` looks up a certificate and shows valid or invalid with learner name, skill and issued date |
| `css/style.css` | All styles, responsive, print CSS for the certificate |
| `js/config.js` | Supabase URL and anon key (placeholders until you add real keys) |
| `js/app.js` | Supabase client, auth helpers, session persistence, route guards, sign out |
| `js/course.js` | Curriculum loading, day rendering, quiz logic, progress saving, streak |
| `js/certificate.js` | Capstone gate, certificate generation, verification lookup |
| `supabase/schema.sql` | Tables and Row Level Security |
| `curriculum.json` | **Not in this folder.** It is owned by a separate build step and loaded at runtime with `fetch('./curriculum.json')`. The site will not render the outline or lessons without it. |

## Curriculum format

`curriculum.json` is loaded at runtime. The loader accepts either shape:

```json
{
  "course": { "title": "Full-Stack Web Development" },
  "days": [
    {
      "day": 1,
      "week": 1,
      "title": "Your first web page",
      "goal": "Build a page with HTML and see it in a browser.",
      "video": { "channel": "freeCodeCamp.org", "title": "HTML Full Course", "youtube_id": "dQw4w9WgXcQ" },
      "steps": ["Step one.", "Step two."],
      "task": "Build a page about yourself.",
      "challenge": "Add one thing the lesson did not cover.",
      "quiz": [
        { "q": "What does HTML stand for?", "options": ["A", "B", "C"], "answer": 0, "explain": "HTML defines structure and content." }
      ],
      "project": null,
      "capstone_checks": null
    }
  ]
}
```

Notes:

- `video` is an object with `youtube_id`, `title` and `channel`. A plain `video_id` string or a `video_url` also works and the ID is extracted from it. Videos embed with `youtube-nocookie.com`.
- Quiz items use `q` for the question (`question` also works), `options`, `answer` as the zero based index of the correct option (`correct` is accepted as an alias), and an optional `explain` shown after the quiz is checked.
- The weekly project field is `project` (`weekly_project` also works). It is shown only on days 7, 14 and 21. It can be a string or an object with `title`, `brief` (or `description`) and `checks` (or `deliverables`).
- `capstone_checks` is used on days 22 to 30. It can be a list of strings or objects with `id` and `label`. If the curriculum lists none, the site uses a built-in 5 item capstone checklist.
- A `weeks` shape is also accepted: `{ "weeks": [ { "week": 1, "title": "...", "days": [ ... ] } ] }`.

## Setup

### 1. Create the Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project.
2. In the project dashboard go to Project Settings, then API.
3. Copy the Project URL and the `anon` public key.

### 2. Add the keys

Open `js/config.js` and replace the two placeholders:

```js
window.APP_CONFIG = {
  SUPABASE_URL: "https://your-project.supabase.co",
  SUPABASE_ANON_KEY: "your-anon-key"
};
```

Use only the `anon` public key here. Never put the `service_role` key in this file or anywhere in the frontend. It bypasses Row Level Security.

If the keys are still placeholders, the site shows a clear "Setup needed" message on every page instead of failing silently. The course outline still loads, and progress is kept in the browser only (localStorage) until Supabase is configured.

### 3. Run the SQL

1. In the Supabase dashboard go to SQL Editor, then New query.
2. Paste the whole contents of `supabase/schema.sql` and run it.
3. It creates four tables: `profiles`, `progress`, `capstone_checks`, `certificates`, plus indexes and Row Level Security policies.

Row Level Security summary:

- Users only see and change their own rows in `profiles`, `progress` and `capstone_checks`.
- Users only insert their own certificates.
- Anyone can read a certificate row for verification, which is what makes the public `verify.html` page work. No other table is publicly readable.

### 4. Turn off email confirmation (recommended for testing)

By default Supabase requires new users to confirm their email before they can sign in. For this course site, turn it off so sign-up goes straight to the dashboard:

1. In the Supabase dashboard go to Authentication, then Providers, then Email.
2. Turn off "Confirm email".
3. Save.

If you leave it on, sign-up still works, but the user must click the confirmation link in their email before signing in. The sign-up form says this on screen.

Email templates and the confirmation redirect can be left at the Supabase defaults for now. If you later set a Site URL in Authentication, URL Configuration, set it to the live site URL so email links return to the right place.

### 5. Turn on Google sign-in

1. In the Supabase dashboard go to Authentication, then Providers, then Google.
2. Turn on the Google provider.
3. You need a Google OAuth client ID and client secret. Create them in Google Cloud Console: create a project, go to APIs and Services, Credentials, create an OAuth client ID for a Web application.
4. In Google Cloud, add the Supabase callback URL as an authorized redirect URI. Supabase shows this URL on the Google provider settings page. It looks like `https://your-project.supabase.co/auth/v1/callback`.
5. Paste the client ID and secret into the Supabase Google provider settings and save.

The site calls `signInWithOAuth` with provider `google` and redirects to `/dashboard.html` on the same site after sign-in. The full name from Google is stored in user metadata and upserted into `profiles`.

## Run locally

```bash
cd skill-certificate-site
python3 -m http.server 8000
```

Then open `http://localhost:8000/`.

The site needs `curriculum.json` in the same folder to render lessons. Do not commit a test copy into the site folder. For local testing, copy the site to a temp folder and add a small mock `curriculum.json` there.

## Deploy

This is a static site with no build step. Deploy it in one step:

1. Make sure `curriculum.json` sits next to `index.html` in the deploy folder.
2. Drag the folder into Netlify Drop, or deploy the folder with the Netlify CLI.
3. Open the live URL and test sign-up, one lesson quiz, and the verify page.

One deployment only. Do not deploy from a folder without `curriculum.json`, or the outline and lessons will show a load error.

## Rules

- A day is complete only when its quiz is passed at 70 percent or more. With 3 questions, that means 3 out of 3 correct. Retries are unlimited.
- The certificate unlocks only when all 30 days are complete and every capstone check is ticked.
- Certificate codes look like `SC-2026-ABC123`: `SC`, the issue year, and 6 random uppercase letters or digits.
- Streak is consecutive calendar days with a completed day, counted back from today (or yesterday if nothing is done yet today), using the `completed_at` dates in `progress`.
- The certificate page has print CSS: printing shows the certificate only, not the header, footer or buttons.
- Copy is plain and direct. No em-dashes, no AI-sounding filler.
- No video generation is involved. Lesson videos are real YouTube embeds listed in `curriculum.json`.

## What still needs real Supabase keys

Without keys, the site loads and the course outline renders, but sign-up, sign-in, Google sign-in, progress saving across devices, certificate storage, and verification lookup do not work. Progress is kept in the browser only. Once keys are added and `schema.sql` has been run, all of those work with no code change.
