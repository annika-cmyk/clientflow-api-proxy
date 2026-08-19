# AGENTS.md

## Deploy

Deploya alltid. Användarvända ändringar ska mergas till `main` så fort de är klara, utan att vänta på en extra begäran. Lämna dem inte bara på en feature-gren.

Minibok läser uppdrag och AML via den här proxyn. Ändringar som Minibok behöver live ska alltså också in på `main`.

Force-pusha aldrig `main`.

## Dashboard – senaste ändringar

När du släpper en användarvänd ändring: lägg en post överst i `WHATS_NEW_ENTRIES` i `lib/whats-new.js` (`date` som `YYYY-MM-DD`, `title`, `summary`, `importance` 1–5). Dashboarden visar automatiskt de 5 viktigaste posterna från den senaste månaden.
