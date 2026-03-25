# Retrieval — Science Retrieval Practice App

A spaced-repetition science retrieval practice app with AI marking, teacher dashboards, and class management.

## Features
- **Students**: Answer questions, get AI-marked instantly, spaced repetition scheduling
- **Teachers**: Create classes, manage question banks, unlock topics, view misconception dashboards
- **Join codes**: 6-character codes for students to self-enrol
- **AI marking**: Claude API marks short answers with tolerance for spelling/wording

## Tech Stack
- Next.js (React)
- Supabase (Postgres + Auth)
- Claude API (AI marking)

---

## Deploy to Vercel (Recommended — Free)

### Step 1: Push to GitHub
```bash
cd retrieval-app
git init
git add .
git commit -m "Initial commit"
```
Create a new repo on GitHub, then:
```bash
git remote add origin https://github.com/YOUR_USERNAME/retrieval-app.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click "Import Project" → select your `retrieval-app` repo
3. Click "Deploy" — no config needed, Vercel auto-detects Next.js
4. Your app will be live at `https://retrieval-app.vercel.app` (or similar)

### Step 3: Configure Supabase Auth
1. Go to your Supabase dashboard → `retrieval-app` project
2. **Auth → Settings → Email**: Disable "Confirm email" (for easier testing)
3. **Auth → URL Configuration**: Add your Vercel URL to "Redirect URLs"
4. **Settings → API**: Your project URL and anon key are already embedded in the code

---

## Local Development
```bash
npm install
npm run dev
```
Open http://localhost:3000

---

## Supabase Project Details
- **Project**: retrieval-app
- **Region**: eu-west-2 (London)
- **URL**: https://uvzukwoxqhcxaxtzrziy.supabase.co
- **Dashboard**: https://supabase.com/dashboard/project/uvzukwoxqhcxaxtzrziy

---

## Question Bank Format (Bulk Import)
One question per line, pipe-separated:
```
What is the powerhouse of the cell? | The mitochondria
What is osmosis? | Movement of water from dilute to concentrated through a partially permeable membrane
Define photosynthesis | The process by which plants use light energy to convert carbon dioxide and water into glucose and oxygen
```

---

## Architecture
- `schools` → `subjects` → `topics` → `questions`
- `classes` link a teacher + subject + year group
- `class_topics` controls which topics are visible per class
- `responses` stores every student answer with AI feedback
- Spaced repetition (SM-2) runs client-side based on response history
- Row Level Security ensures students only see their own data

