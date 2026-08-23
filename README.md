# Tank Realms

Drive one tank across ten mutating worlds. Shoot, dodge, pick a card each level, and climb as far as you can.

Tank Realms is a **mobile-first 3D twin-stick survivor**. It runs in a phone browser, can be installed as an app, and does not need a download store.

**Latest build on this project: v29.3**

---

## Play

**This branch (latest):**  
https://raw.githack.com/misualpa54-gif/Tank-Thiltete/arena/01a02144-tank-thiltete/tank_realms_v29.3.html

Bookmark that link. After a new upload, wait about **five minutes**, then refresh hard.

**Public main** is still an older build. Use the link above unless main has been published.

On a phone you can **Add to Home Screen** when the page is served over https (the game registers a service worker).

Open `index.html` or `tank_realms_v29.3.html` in a browser to play on a computer. Use a real phone to judge feel.

---

## Controls

| What | Phone | Keyboard |
|---|---|---|
| Move | Left side of the screen (stick) | W A S D |
| Fire | Hold the right side | Space (only during a fight) |
| Pause | Top-right button | — |
| Aim | Auto-aim (Assist on = stickier turret) | Same |

Designed for a thumb and a hold. Mouse combat is not required.

---

## How a run works

1. **Casual** — endless climb, named saves, the full game.  
   **Levels** — same fight with sliders (how many enemies, Easy–Nightmare, start level). There is no “you win” screen.
2. Enemies spawn around you. Kill them for **score, coins, and XP**.
3. Each level-up: **three cards, pick one**. (Bosses and some crates can add an extra pick.)
4. Every **5th level** a **boss** arrives. Beat it for a heal and a bonus card.
5. From **level 4**, supply crates drop. Gold = random loot. Purple = **Black Market** (pay coins for one deal).
6. Die: **Revive** for 300 coins, then four times more each extra revive this run (1,200, 4,800…). Or open the Armory, or go Home.
7. Pause in Casual to **Save**. Load later: your tank, your cards, and the enemies that were still alive.

Standing still in a pack **costs health**. Regen from the shop **starts immediately** and is not capped.

---

## Worlds

The ground is endless hills (not a boxed map). Every few levels the **realm** slowly changes:

Enchanted Forest · Frozen Tundra · Volcanic Wasteland · Golden Desert · Mystic Swamp · Crystal Caverns · Autumn Grove · Sakura Valley · Blood Moon Canyon · Neon Void

Trees, rocks, and ground **stop bullets**. Camera sits you under the HUD so the bars do not cover the tank.

---

## Enemies (short)

**Early:** Scout, Soldier, then Heavy, Sniper, Medic, Skirmisher, Bomber, Berserker, Phantom.  
**Later:** Gunner, Wasp (packs), Raider, Juggernaut.  
**Variants you unlock as you climb:** Scouter, Soldierpro, Heavier, Picker, Squsasher, Deathbringer, Phantasm, Gunnier, TombRaider, Hammer.

Most guns shoot **straight**. Some curve (Phantom, Juggernaut, several variants, some bosses).  
**Gunnier** fires **one** seeking shot at a time. **Wasps** bend only a little.

**Bosses** (rotate): Warlord, Tempest, Colossus, Titan, Nova, Fortress.

First time you meet a type, a **NEW** toast names them. On the minimap: **red** = originals, **teal** = variants, **orange** = boss, gold/purple squares = crates.

---

## Shop and cards

- **Coins stay** between runs.
- **Armory:** tank skins, next-run consumables, capped upgrades, and unlimited tracks that get expensive (including Precision Optics and Blast Door).
- **Cards:** speed, damage, fire rate, hull, regen, armor, crit, extra shots, pierce, coins, heal-on-kill, XP, adrenaline, missiles, splash, shield.
- Extra Choice and Head Start give **rerolls**, not a pile of extra popups.
- **Field Revive** on the death screen. Pause shows how many you used this run.
- Black Market **+20% damage** lasts 60s of fight time; a toast says when it ends.

---

## What’s in this folder

| File | Role |
|---|---|
| `tank_realms_v29.3.html` | The whole game (graphics library + logic in one page) |
| `index.html` | Opens the game |
| `sw.js` | Offline / install cache |
| `manifest.webmanifest` | App name and icons |
| `icon-192.png`, `icon-512.png`, `icon-maskable-512.png` | Home-screen icons |

No install step for players: open the HTML or the play link.

---

## Settings worth knowing

- **Sound / Music** — music is a soft pad; your gun is the sharp shot. Idle is quiet.
- **Graphics** — Auto, High, Low. Auto can drop quality if the phone gets hot.
- **Camera** — Follow or Wide.
- **Assist** — changes how fast the turret sticks to a target.

---

## Notes for anyone editing the page

- Keep the game **one self-contained HTML** unless you also ship a bundled copy for phones.
- The 3D library is a **single huge line**. Do not search-replace across that line.
- After a change: syntax-check the game script, then test on a **real phone**. Device feel beats a desktop simulation.
- Casual field saves store up to 22 living tanks. Old saves with no field list still load as an empty arena.

---

## Credit

Tank Realms — a solo tank war across mutating realms.
