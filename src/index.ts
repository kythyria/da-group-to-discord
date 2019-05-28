import * as Deviantart from './deviantart/api';
import { readConfig } from './configuration';
import * as Discord from 'discord.js';
import * as cd from './commanddispatcher';
import { simpleCommands, deviantartCommands } from './commands';
import { Poller } from './poller';

let config = readConfig();

let da = new Deviantart.Api(config.deviantart.clientId, config.deviantart.clientSecret);
let discord = new Discord.Client();
let dispatcher = new cd.CommandDispatcher(Array.prototype.concat(simpleCommands, deviantartCommands(da, config) ));

let dmchannel : Discord.DMChannel | undefined = undefined;

let poller = new Poller(config, discord, da);
function dopoll() {
    console.log("Polling...")
    console.time("poll");
    poller.poll().then(() => {
        console.timeEnd("poll");
        console.log("Poll complete");
    });
};

let timer : NodeJS.Timer | undefined = undefined;

discord.on("ready", async () => {
    console.log(`Logged in as ${discord.user.tag}!`);
    let appinfo = await discord.fetchApplication();
    dispatcher.ownerId = appinfo.owner.id;
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
        dopoll();
        if(!timer) {
            timer = discord.setInterval(dopoll, config.pollInterval);
        }
    }
});

discord.on("disconnect", (evt) => {
    console.log("Disconnected: %o", evt);
});

discord.on("message", (msg) => {
    if (msg.author.id == discord.user.id) { return; }
    dispatcher.onMessage(msg);
});

discord.on("error", e => {
    console.log("Websocket error: %o",e);
});

discord.login(config.discord.botToken);