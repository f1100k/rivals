# Database rules
- Season finalization freezes stats and starts the next-numbered season (counting from now, with baselines) inside the same admin_finish_season transaction, so there is never a gap between seasons; it also resets player progress via season_reset_progress in that same transaction.
