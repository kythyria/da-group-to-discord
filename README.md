This is a fairly basic bot for watching deviantart groups and posting new additions to Discord.
Due to how dA's API works it will happily watch individual users too. See the definition of
`ConfigFile` in `src/configuration.ts` for what to put in `config.json`.

Build with `npm run build`, start with `npm start` (or build it and run `lib/index.js` with
the location of the configuration file as the first argument)

The bot is probably quite fragile, and is not smart enough to not try to "catch up" on years of
posts (it won't try to post the whole lot in one go, though), so you'll probably need to prepopulate
the file `pollcache.json` in whatever the `dataDir` is set to. The format of this is an array of items,
each item being an array whose first element is the GUID of a deviantart collection, and the second
element is an array of deviation GUIDs:
```
[
  [ collection, [ deviation, deviation, ... ]],
  [ collection, [ deviation, deviation, ... ]]
]
```

The bot will not look further back in a collection than the deviations listed in this file (it updates
the file each time it posts a notification). The easiest way to get these IDs is the bot's own commands:
```
galleryfolders <username>
listfolder <username> <folderguid> [--offset <number>]
```

There's also `embeddeviation <deviationguid>` which invokes the same embed-generating logic as the polling
loop does, and `dopoll` (you need to be the bot owner for that one) that immediately invokes the entire
polling logic save for the timer.
