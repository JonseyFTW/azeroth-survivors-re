# Controls

**Azeroth Survivors** — top-down, one hand on WASD, the other on the wheel.

| When | Key / Input | Action |
|---|---|---|
| Menu | Click a race, gender, class and zone | make your pick (**Randomize** rolls one) |
| Menu | **Enter** (or **Enter World**) | start the run; the world travels to the zone picked |
| Playing | **W / S / A / D** or **arrow keys** | move the hero (locked camera: the hero faces the cursor, backpedals and strafes) |
| Playing | **Space** | jump |
| Playing | **F** (from level 5) | your class's movement spell: Blink, Charge… aim at the cursor |
| Playing | **C** | unlock / lock the camera |
| Any | **G** | toggle the picture polish (`?grade=0` starts it off) |
| Playing | **mouse wheel** | zoom, from over the shoulder out to 70 yd |
| Playing | **drag** (camera unlocked) | swing and tilt the camera |
| Playing | **Esc** | pause |
| Playing | — | abilities cast themselves (no aim) |
| Level up | **1 / 2 / 3** (or click a card) | pick an upgrade |
| Paused | **Esc** | resume |
| Game over | **Enter** (or **Play again**) | back to the menu |
| Any | minimap **+ / −** / minimize | minimap zoom / collapse |

The camera follows the hero, locked top-down by default (laptop-friendly). **C** unlocks it so a
mouse drag swings and tilts it; **C** again snaps it back. In the menu it slowly orbits the
preview hero. Your race, gender, class and zone are remembered across reloads.

## On a phone

On a touch screen the page draws controls over the game (`web/touch.js`): drag anywhere on the
lower half of the stick side to move (the hero faces the way you push), **F** casts the
movement spell that way, **⏸** pauses and resumes, **⇄** at the top swaps the stick to the
other side (remembered on that phone). Tap cards and menu items as usual. `?touch=0` hides the
controls; `?touch=1` shows them on a desktop. Needs a browser with WebGPU (iOS 26+ Safari or
Chrome).
