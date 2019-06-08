This is a fairly basic bot for watching deviantart groups and posting new additions to Discord.
Due to how dA's API works it will happily watch individual users too.

Build with `npm run build`, start with `npm start` (or build it and run `lib/index.js` with
the location of the configuration file as the first argument). Configuration is only loaded at
start time, so you need to restart the bot any time that changes. The configuration file itself
is an instance of `ConfigFile` written as JSON, see `src/configuration.ts` for the definition.

The bot is not smart enough to not try to "catch up" on years of posts (it won't try to post
the whole lot in one go, though). The best way to avoid this is to quickly tell the bot
`markallread` after you add a new entry to the config file--it waits for one poll interval
to epxire before the first poll precisely to facilitate this.

Tell the bot `help [<command>]` for a list of commands; its trigger is to DM it at all, or
mention it, like `@Notifierbot#0000 help`.

License: MIT.