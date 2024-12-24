import * as Deviantart from './deviantart/api';
import { readConfig } from './configuration';
import * as Discord from 'discord.js';
import { Poller, DiscordPollLog } from './poller';
import { CommandRegistry } from './commandsystem/registry';
import { DiscordCommandFrontend } from './commandsystem/discordfrontend';
import requireDir from 'require-dir';
import { DiscordLogThing } from './discordlogthing';

let config = readConfig();

let da = new Deviantart.Api(config.deviantart.clientId, config.deviantart.clientSecret);
let discord = new Discord.Client({
    // Try to curb the client's enthusiasm for keeping track of old messages.
    messageCacheMaxSize: 2,
    messageCacheLifetime: 20,
    messageSweepInterval: 20
});
let logthing = new DiscordLogThing(discord, config.logChannel);
let logthing2 = new DiscordPollLog(discord, config.logChannel);
let poller = new Poller(config, discord, da, logthing, logthing2);

let commandRegistry = new CommandRegistry();
commandRegistry.registerDirectory(requireDir('./commands'));

let dmchannel : Discord.DMChannel | undefined = undefined;
let commandFrontend : DiscordCommandFrontend | undefined = undefined;

interface AmbientParameters {
    deviantart: Deviantart.Api;
    poller: Poller;
    commandRegistry : CommandRegistry;
    discord: Discord.Client;
}
let ambientParameters : AmbientParameters = {
    deviantart: da,
    poller: poller,
    commandRegistry,
    discord
}

let timer : NodeJS.Timer | undefined = undefined;

discord.on("ready", async () => {
    console.log(`Logged in as ${discord.user.tag}!`);
    let appinfo = await discord.fetchApplication();

    commandFrontend = new DiscordCommandFrontend(discord.user.id, appinfo.owner.id, commandRegistry, ambientParameters, config.admins, logthing);

    console.log(`Join URL: https://discordapp.com/api/oauth2/authorize?client_id=${appinfo.id}&scope=bot`);
    try {
        //logthing.log("Started!")
    }
    catch(e) {
        console.log("Couldn't send a message to the log channel.");
        console.log(e);
    }
    if(!process.argv.includes("--noPoll")) {
        poller.start();
    }
});

discord.on("disconnect", (evt) => {
    console.log("Disconnected: %o", evt);
});

discord.on("message", (msg) => {
    if (msg.author.id == discord.user.id) { return; }
    if(commandFrontend) {
        commandFrontend.onMessage(msg);
    }
});

discord.on("error", e => {
    console.log("Websocket error: %o",e);
});

discord.login(config.discord.botToken)
.then(str => {
    console.log("Client.login() done");
}).catch(err => {
    console.log("Loginfail: %o", err);
    process.exit(1);
});