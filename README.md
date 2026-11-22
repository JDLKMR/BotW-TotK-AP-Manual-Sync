# BotW/TotK AP Manual Sync

A companion program for my Breath of the Wild and Tears of the Kingdom Archipelago Manual APWorlds that automatically adds received items to the game save, skipping the need to manually edit it. All you have to do is save the game and reload.

## How It Works
1. Connects to the Archipelago room and tracks received items.
2. Watches for changes to `game_data.sav` (BotW) / `progress.sav` (TotK) in the folder you set (polling mtime+size, so UNC paths, mapped drives and SSHFS mounts work).
3. When you save in-game and there is something new to apply, the program backs up your save, loads it into Marc Robledo's editor(s) built into the program, and applies the changes.
4. Reloading the save then reflects the changes.

The settings, ledger, and backups can be found in your user data folder (Windows: `%APPDATA%\BotW-TotK AP Manual Sync`, Linux: `~/.config/BotW-TotK AP Manual Sync`).

## Launch Arguments
```
--server <server>:<port>        Archipelago server and port
--botw-slot <slot>              BotW slot name
--totk-slot <slot>              TotK slot name
--password <password>           Room password
--enable-botw <true/false>      Turn BotW syncing on/off
--enable-totk <true/false>      Turn TotK syncing on/off
```
`--flag=value` also works.

## Run/Build from Source
```
npm install
npm start
npm run dist:win         # Windows executable
npm run dist:linux       # Linux AppImage
npm test                 # needs both APWorld repos: APWORLD_REPOS=/path/containing/both
```

## Credits
`vendor/savegame-editors` is Marc Robledo's savegame-editors (MIT, see its LICENSE).

## AI Disclosure
All programming is done using Claude. However, features are thoroughly tested and built with care. All testing, art, documentation, and any other writing is done by me.