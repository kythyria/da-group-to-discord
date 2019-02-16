import * as deviantart from './deviantart/api';
import { readFileSync } from 'fs';
import * as Discord from 'discord.js';

interface ConfigFile {
    dataDirectory: string;
    deviantart: { clientID: string, clientSecret: string };
    discord: { clientID?: string, clientSecret?: string, botToken: string };
}

let configfile = process.argv[2];
let configdata = readFileSync(configfile, "utf8");
let config : ConfigFile = JSON.parse(configdata);

let da = new deviantart.Api(config.deviantart.clientID, config.deviantart.clientSecret);
let discord = new Discord.Client();

discord.on("ready", async () => {
    console.log(`Logged in as ${discord.user.tag}!`);
    let appinfo = await discord.fetchApplication();
    console.log(`Join URL: https://discordapp.com/api/oauth2/authorize?client_id=${appinfo.id}&scope=bot&permissions=1`);
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
})

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