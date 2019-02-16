import * as deviantart from './deviantart/api';
import { readFileSync } from 'fs';

interface ConfigFile {
    dataDirectory: string;
    deviantart: { clientID: string, clientSecret: string };
    discord: { clientID: string, clientSecret: string };
}

let configfile = process.argv[2];
let configdata = readFileSync(configfile, "utf8");
let config : ConfigFile = JSON.parse(configdata);

let da = new deviantart.Api(config.deviantart.clientID, config.deviantart.clientSecret);

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

getFirstThing();