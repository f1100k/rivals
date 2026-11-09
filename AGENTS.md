<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Avatar uploads save a square client-side crop, and Avatar clips only the photo layer so decorative frames remain visible.
- Avatar frame exceptions use owner-readable per-frame grants enforced by the frame RPC; global fit editing is limited to the `can_edit_frame_fits()` DB allowlist (checked in set_avatar_frame_fit and gating the Profile editor) and never resets existing fits on page load.
- Rank labels and progress use the same pure helpers in inhouse.ts across all screens so division boundaries cannot diverge.
- Competitive scoring and protection are transactional database RPCs with immutable base loss and an owner-readable ledger; finalization remains centralized, rank rewards use named-tier high-water marks, and confirmed trolling revokes/refunds protection before applying its additional penalty.

- The root URL redirects to the authenticated home (/inicio) with profile, rank progress and a join-queue button, no promotional landing page, to keep the site focused on play.
- Shared room-code editing lives in RoomCode with an async success contract; retain entered text on failed saves and disable duplicate submissions.

- The in-house queue is the 5v5 captain flow (`*_gk` DB functions: position on join, captains chosen by the two highest MMR in opposite teams, fixed A-B-B-A-A-B-B-A draft, room code, winner voting). The legacy mode/region queue functions (`join_queue`, `match_report`, …) are deprecated — extend the `_gk` functions, never revive the old flow.
- Match result: participant votes use `vote_result_gk`; staff resolution uses `admin_resolve_match`. All paths finalize only through `finalize_match_gk` (locks the row, applies Elo once); `vote_match` remains deprecated. Keep score confirmation functions only for compatibility, not the normal player UI.
- Active-match navigation uses the shared queue query in SiteNav and the pure active-match helper; resolve the current user's protected role before enforcing navigation and exempt admins so they can moderate and return without leaving the match. Queue RPCs enforce membership independently, and ghost triggers never manufacture result votes.
- Participant ballots use `vote_result_gk`, `vote_cancel_match_gk`, and `withdraw_match_vote_gk` under the same match-row lock as finalization; winner and cancellation ballots are mutually exclusive, withdrawal clears both before a new choice, and compatibility abandon delegates to cancellation voting.
- Staff permissions use `user_roles` + `is_staff`/`has_role` checked inside SECURITY DEFINER functions; every staff action writes `mod_actions`.
- Immediate match cancellation checks `has_role(auth.uid(), 'admin')` in the database and locks the match row before cancellation; the admin UI mirrors that permission to prevent moderator bypass and finalization races.
- Draft turn, remaining picks and timeout handling share the database draft_step helper so manual picks and automatic picks obey the same schedule.
- Goalkeepers are drafted last: draft_phase/draft_target_ok keep the line round open until every non-keeper slot is filled (one slot reserved per side without a keeper), and draft_turn applies the shared rhythm over all picks.
- Queue polling recovers queued matches before the draft tick; matchmaking has its own try-lock key, while finalization/protection/reports lock per player so rooms never block each other.
- Player reporting uses authenticated RPCs with participant validation, per-target cycle locks and queue enforcement. Reporter identities are projected only through the database admin-checked reporting RPC, never public/player/moderator reads; sanctions are separate from user-editable profiles to prevent self-unbanning.
- Shared seasonal background decoration is rendered once in the root behind controls, ignores pointer events and respects reduced-motion preferences.
- Queue alerts derive from polled state transitions through a pure event helper, never repeated polls; Web Audio is unlocked by user interaction and can be muted without suppressing visible alerts.
- Discord announcements normalize stored team letters, check read errors and send results/ranking independently; bot votes performed outside the site's server function require an explicit announcement because direct database changes do not call the site publisher.
- Player profiles use a shared public safe-column RPC and shared statistics display; preference positions are owner-editable profile fields, separate from per-match queue positions, and every ranking opens the same profile dialog.
- Admin queue testing uses server-created ghost accounts and admin-checked enqueue RPCs; forced winner resolution delegates to admin_resolve_match/finalize_match_gk and publishes Discord results without fabricating participant ballots.
- Discord voice cleanup accepts only persisted completed/cancelled matches, runs after result/cancel finalization, moves linked occupants back before deletion and leaves failed cleanup pending for retry; never expire active calls by age.
- Discord queue buttons use signed guild/channel-scoped interactions, derive identity from discord_links and call an idempotent service-only wrapper delegating to GK queue RPCs; preserve inactivity rules via explicit presence confirmation.
- Discord queue message cleanup rechecks persisted terminal match state, preserves bot-authored queue panels and messages newer than closure, and saves its retry cursor on the panel so repeated voice syncs never clear the next match's conversation.
- Rating changes are Elo on the five-player averages (K=32) plus a winning-run bonus, both applied once inside the finalizing RPC; the bonus ceiling and rewarded-streak length come from the admin-editable `win_streak_settings` row, so no client value may decide a payout.
- Personal scoring exceptions are allowlisted in `loss_shield_owners`; finalization advances paired-loss state only for competitive results and resets on wins. Personal ledger entries in `mod_actions` are owner-only through restrictive RLS and admin RPC filtering; public results stay truthful. Manual arming is deprecated.
