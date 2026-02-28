# Contributing To Commy

Thanks for contributing.

This project is optimized for rapid iteration, but we still require strong reliability for generation, persistence, and export paths.

## Guiding Principles
- Keep changes small and composable.
- Preserve end-to-end behavior.
- Add diagnostics where behavior can fail.
- Prefer deterministic fallback behavior over silent failure.

## Development Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment:
   ```bash
   cp .env.example .env
   ```
3. Start full local integration stack:
   ```bash
   npm run dev
   ```

## Branch And Commit Workflow
1. Sync main:
   ```bash
   git pull --rebase origin main
   ```
2. Create a branch:
   ```bash
   git checkout -b your-branch-name
   ```
3. Make focused edits.
4. Run validation:
   ```bash
   npm test
   npm run build
   ```
5. Commit with a clear message:
   ```bash
   git commit -m "fix: describe the bug and fix scope"
   ```
6. Push and open PR.

## Required Checks Before PR
- `npm test` passes.
- `npm run build` passes.
- Manual smoke flow passes:
  - chat prompt to generation
  - project persistence after refresh
  - export/download behavior
- No secrets added to code, logs, or docs.

## Code Standards
- TypeScript first; avoid `any` unless unavoidable.
- Keep functions single-responsibility.
- Add comments only where logic is non-obvious.
- Prefer explicit error handling with actionable messages.
- Do not remove existing diagnostics unless replaced with better diagnostics.

## UI/UX Standards
- Verify desktop and mobile behavior.
- Do not regress the chat panel behavior.
- Keep controls disabled when actions are invalid (with clear tooltip/text).
- Preserve accessibility basics: semantic controls, readable states, clear feedback.

## Pipeline And Provider Changes
When touching generation/provider code:
- Add stage-level pipeline logs (`info`/`warn`/`error`).
- Include enough context to debug (scene id/order, provider status, fallback reason).
- Preserve recoverable behavior when a provider partially fails.
- Ensure persistence mapping remains valid for refreshed sessions.

## Database And API Changes
When touching schema/routes:
- Update `server/schema.sql` and matching route queries.
- Keep API response fields backward compatible when possible.
- Update frontend hydration mapping in `apiClient.ts`.
- Add tests for new mapping/behavior.

## Testing Guidance
- Existing tests live under `src/**/*.test.ts`.
- Add tests for:
  - new branch logic
  - error/fallback behavior
  - data mapping and hydration

## PR Description Template
Please include:
1. What changed.
2. Why it changed.
3. Risk areas.
4. Validation steps run locally.
5. Screenshots/video for UI changes.

## Security
- Never commit `.env`.
- Never hardcode API keys.
- If you find a security issue, report privately to maintainers instead of opening a public exploit PR.

## License
By contributing, you agree your contributions are licensed under the project MIT License.
