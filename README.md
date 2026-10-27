# Oliver Atwood · Story Planner

A private planning tool for Oliver Atwood’s stories, at **https://oliveratwood.com/planner**.

- **Grid:** parts across the top, plot threads down the side, scene cards you can drag around.
- **World:** characters, places, factions, magic systems, lore, or any entry types you invent, each with your own fields.
- **Continuity:** open setups, setups and payoffs, magic rules in the order readers learn them, loose ends in published parts.
- **Export:** turn a planned part into a draft episode file for the main site.

## How it works

The app is plain HTML, CSS and JavaScript in `app/` (no build step). Pushing to `main`
runs the **Publish planner** workflow, which uploads `app/` to Bluehost over FTP into
`planner/` next to the main site.

Projects are **not** stored in this repository (it’s public). `app/api.php` saves them on the
server in `planner/data/`, behind the planner password, and keeps rolling backups
(the last 40 saves, plus the first save of each day for four months). The upload never
touches that folder.

## Secrets (Settings → Secrets and variables → Actions)

| Secret | What it is |
|---|---|
| `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD` | Same as the main `oliveratwood` repo |
| `PLANNER_PASSWORD` | The password you type to open the planner |
| `FTP_SERVER_DIR` (optional) | Only if the main repo uses one; must end in `/` |

To **change the password**, update `PLANNER_PASSWORD` and run the workflow again
(Actions → Publish planner → Run workflow). Changing it signs out every device.

## Trying it locally

```sh
php -r 'file_put_contents("app/config.php", "<?php return [\"password_hash\" => " . var_export(password_hash("test", PASSWORD_DEFAULT), true) . "];");'
cd app && PLANNER_DATA_DIR=../.dev/data php -S 127.0.0.1:8765
```

Then open http://127.0.0.1:8765 and sign in with `test`. Adding `?demo` to the address
skips the server and saves in the browser only.
