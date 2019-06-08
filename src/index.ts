import * as Deviantart from './deviantart/api';
import { readConfig } from './configuration';
import * as Discord from 'discord.js';
import { Poller } from './poller';
import { CommandRegistry } from './commandsystem/registry';
import { DiscordCommandFrontend } from './commandsystem/discordfrontend';
import requireDir from 'require-dir';

let config = readConfig();

let da = new Deviantart.Api(config.deviantart.clientId, config.deviantart.clientSecret);
let discord = new Discord.Client();
let poller = new Poller(config, discord, da);

let commandRegistry = new CommandRegistry();
commandRegistry.registerDirectory(requireDir('./commands'));

let dmchannel : Discord.DMChannel | undefined = undefined;
let commandFrontend : DiscordCommandFrontend | undefined = undefined;

interface AmbientParameters {
    deviantart: Deviantart.Api;
    poller: Poller;
    commandRegistry : CommandRegistry
}
let ambientParameters : AmbientParameters = {
    deviantart: da,
    poller: poller,
    commandRegistry,
}

let timer : NodeJS.Timer | undefined = undefined;

discord.on("ready", async () => {
    console.log(`Logged in as ${discord.user.tag}!`);
    let appinfo = await discord.fetchApplication();

    commandFrontend = new DiscordCommandFrontend(discord.user.id, appinfo.owner.id, commandRegistry, ambientParameters);

    console.log(`Join URL: https://discordapp.com/api/oauth2/authorize?client_id=${appinfo.id}&scope=bot`);
    try {
        dmchannel = await appinfo.owner.createDM();
        await dmchannel.send("Started!");
    }
    catch(e) {
        console.log("Couldn't send DM to owner. Do you have a guild in common?");
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