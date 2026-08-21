# Tank Realms — headless verification harness

Run: `cd devtools/harness && npm i jsdom@24 && node harness.js`

Boots the REAL game (../../tank_realms_latest.html) in jsdom with a virtual
60fps clock, permissive WebGL proxy, and a recording 2D-canvas stub, then runs
~40 checks: boot cleanliness, difficulty scaling, wasp packs, boss chain
(out-of-band + splash kills), card-choice watchdog, regen / heal-on-kill,
HP bars + names, surge cycle, and a 60s lv15 soak. Exits non-zero on any
failure and prints every console error/warning/uncaught exception.

Note: this directory is tracked in git on purpose (files here persist between
work sessions); node_modules/ is ignored.
