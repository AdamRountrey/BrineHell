# Brine Hell

Brine Hell is a browser-based vertical scrolling bullet hell built with Phaser 3, Vite, and TypeScript. It plays like an underwater 1942-style arcade shooter: pilot a top-down fish through shifting ocean biomes, collect stacking powerups, fight sea-creature waves, defeat bosses, rescue a mermaid, and then survive the twist.

## Features

- Top-down underwater shooter with auto-fire, keyboard movement, bombs, lives, checkpoints, and local save/continue support.
- Stylized raster art for the player fish, enemies, bosses, powerups, and scrolling biome backgrounds.
- Multiple biomes: sandy shallows, coral reef, kelp forest, open blue, deep trench, and abyss palace.
- Enemy families including fish swarms, crabs, shrimp, clams, pufferfish, sharks, jellyfish, eels, anglerfish, and armored shells.
- Boss phase system with charge-up super weapons, homing shots, cluster shots, looping difficulty, and second-loop baby boss support.
- Powerups for spread fire, piercing pearls, bubble streams, helper fish, shield, magnet, bombs, speed, extra lives, and a temporary shark ally.
- Procedural reggae-style chiptune music generated in-browser.
- Dev-only autoplay balance helper available with `?autoplay=1`.

## Controls

- `Arrow keys` or `WASD`: Swim
- Auto-fire is always on
- `B`: Whirlpool bomb
- `P`: Pause
- `M`: Mute or unmute music
- `Enter`: Continue from checkpoint
- `Space`: New run or return to main menu

During boss fights, moving the mouse over the canvas can temporarily steer the nearest boss for testing or chaos. Left click fires that boss's current pattern, right click charges a super weapon, and normal boss AI resumes after two seconds without mouse input.

## Getting Started

Install dependencies:

```sh
npm install
```

Start the local dev server:

```sh
npm run dev
```

Build a production bundle:

```sh
npm run build
```

Preview the production bundle:

```sh
npm run preview
```

## Project Structure

- `src/scenes/`: Phaser scenes for boot, menu, gameplay, HUD, and ending.
- `src/content/`: JSON-driven stage, enemy, boss, and powerup data.
- `src/save/`: Versioned checkpoint save state.
- `src/systems/`: Reusable systems such as object pools and generated music.
- `public/assets/`: Game sprites, backgrounds, UI assets, and manifest.

## License

Released under the MIT License. See [LICENSE](LICENSE).
