import { Description, Permission, Ambient, Positional, nameParam, UUIDParam, Named, intParam, CommandEnvironment, Command } from "../commandsystem/commandobjects";
import { inspect } from "util";
import * as da from '../deviantart/api'

@Description("List the contents of a gallery folder, or everything")
@Permission("anyone")
export class ListFolder implements Command {
    @Ambient()
    deviantart!: da.Api;

    @Positional(0, nameParam, "User to examine the gallery of")
    user!: string;

    @Positional(1, UUIDParam, "UUID of folder to list (use `galleryfolders` to find)")
    galleryId! : string;

    @Named(intParam, "How far into the gallery to start listing")
    offset? : number;
    
    async run(env: CommandEnvironment) : Promise<void> {
        let params : da.GetFolderContentsOptions = {
            username: this.user,
            folderid: this.galleryId,
            offset: this.offset || 0
        };
        let res! : da.GetFolderContentsResult;
        try {
            res = await this.deviantart.getFolder(params);
        }
        catch(e) {
            await env.reply("API call failed:\n```JSON\n" + inspect(e.response.body, { compact: false }) + "\n```");
            return;
        }

        if(res.results.length == 0) {
            await env.reply(`${this.user} has nothing in that folder.`);
            return;
        }

        let out = env.replyLong();
        out.write(`Deviations in gallery \`${this.galleryId}\` belonging to ${this.user}:`);
        
        let lines = res.results.map(i => `\n\t\u201C${i.title}\u201D <${i.url}> (\`${i.deviationid}\`)`);
        out.write(lines);

        if(res.has_more) {
            out.write(`\nMore results: \`--offset ${res.next_offset}\``);
        }

        await out.flush();
    }
}