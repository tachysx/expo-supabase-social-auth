# AGENTS.md

This repository is a playbook plus templates for adding **Sign in with Apple and Google to an Expo + Supabase app**.
It is meant to be used *from another project*. Don't build or run anything in this repo itself, except the checks in
`scripts/` and the Deno test in `templates/`.

## If you are an AI coding agent (Codex, Claude Code, Cursor, Gemini, …)

When the user asks you to add Apple/Google sign-in, social login or OAuth to their Expo + Supabase project:

1. Read [`SKILL.md`](SKILL.md) completely. It is the phased playbook: what you do, what the human does in the
   Google and Apple consoles, the checkpoints, and when to stop for approval.
2. Use [`docs/`](docs/) for the detail behind each phase, and [`docs/11-troubleshooting.md`](docs/11-troubleshooting.md)
   when something fails.
3. Copy code from [`templates/`](templates/) into the user's project and adapt it to their structure and design
   system. Don't import from this repo at runtime.
4. Run the helpers in [`scripts/`](scripts/) (Node 18+, no dependencies) for Supabase config and verification. They
   dry-run unless given `--apply`.

Rules that matter:
- Never echo secrets (Google client secret, Apple `.p8` key, Supabase service role key) into chat or commits. Read
  them from the user's env file or key path.
- Get the user's explicit OK before changing production: Supabase auth config, secrets, function deploys, merges
  that deploy, store submissions.
- Prove every step with a check (script output, curl, type check, bundle grep) before calling it done.

## If you are a human
Start with [`README.md`](README.md). To hand the whole job to an agent, open your app's repo in your agent and say:

> Add Sign in with Apple and Google to this app using the playbook at `<path to this repo>/SKILL.md`.
