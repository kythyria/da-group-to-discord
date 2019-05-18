import * as Deviantart from './deviantart/api';
import { readConfig } from './configuration';
import * as Discord from 'discord.js';
import * as cd from './commanddispatcher';
import { simpleCommands, deviantartCommands } from './commands';

let config = readConfig();

let da = new Deviantart.Api(config.deviantart.clientId, config.deviantart.clientSecret);
let discord = new Discord.Client();
let dispatcher = new cd.CommandDispatcher(Array.prototype.concat(simpleCommands, deviantartCommands(da, config) ));

discord.on("ready", async () => {
    console.log(`Logged in as ${discord.user.tag}!`);
    let appinfo = await discord.fetchApplication();
    console.log(`Join URL: https://discordapp.com/api/oauth2/authorize?client_id=${appinfo.id}&scope=bot`);
    try {
        let dmchannel = await appinfo.owner.createDM();
        await dmchannel.send("Started!");
    }
    catch(e) {
        console.log("Couldn't send DM to owner. Do you have a guild in common?");
        console.log(e);
    }
});

discord.on("disconnect", (evt) => {
    console.log("Disconnected:", evt);
});

discord.on("message", (msg) => {
    if (msg.author.id == discord.user.id) { return; }
    dispatcher.onMessage(msg);
});

discord.login(config.discord.botToken);

async function getFirstThing() {
    try {
        let folders = await da.getGalleryFolders({ username: "captivecreatures" });
        console.log(folders);
        console.log(folders.results);
        console.log(folders.results[0]);
        let folder = await da.getFolder({username: "captivecreatures", folderid: folders.results[2].folderid});
        console.log(folder);
        let deviationFromApi = await da.getDeviation(folder.results[2].deviationid);
        console.log(deviationFromApi);
    }
    catch(reason) {
        console.log(reason);
    }
}

//getFirstThing();