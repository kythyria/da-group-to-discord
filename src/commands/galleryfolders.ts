import { Description, Permission, Command, Ambient, Positional, nameParam, CommandEnvironment } from "../commandsystem/commandobjects";
import * as da from '../deviantart/api';
import { inspect } from "util";

@Description("Get the gallery folders for a particular deviantart user")
@Permission("anyone")
export class GalleryFolders implements Command {
    @Ambient()
    deviantart!: da.Api;

    @Positional(0, nameParam, "User to get the folder list of")
    user!: string;

    async run(env: CommandEnvironment) : Promise<void> {
        let params : da.GetFoldersOptions = {
            username: this.user,
            calculateSize: true
        }
        let res! : da.GetGalleryFoldersResult;
        try {
            res = await this.deviantart.getGalleryFolders(params);
        }
        catch(e) {
            env.reply("API call failed:\n```JSON\n" + inspect(e.response.body, { compact: false }) + "\n```");
            return;
        }

        if(res.results.length == 0) {
            env.reply(`${this.user} has no folders in their gallery`);
        }
        let resultText = `Folders for ${this.user}:`
        resultText += res.results.map(i=> `\n\t\`${i.folderid}\` ${i.name}` + (i.size ? `(${i.size})`: "" )).join("");
        env.reply(resultText);
    }
}