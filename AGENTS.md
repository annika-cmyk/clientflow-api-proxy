# AGENTS.md

## Deploy

Deploya alltid. Användarvända ändringar ska mergas till `main` så fort de är klara, utan att vänta på en extra begäran. Lämna dem inte bara på en feature-gren.

Minibok läser uppdrag och AML via den här proxyn. Ändringar som Minibok behöver live ska alltså också in på `main`.

Force-pusha aldrig `main`.
