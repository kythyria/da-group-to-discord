import { Description, Permission, Command, CommandEnvironment, Ambient } from "../commandsystem/commandobjects";
import { Client, Channel, TextBasedChannelFields, TextChannel, DMChannel } from "discord.js";

@Description("Forces the bot to stop typing in all channels")
@Permission("listedAdmin")
export class StopTyping implements Command {
    @Ambient()
    discord! : Client;

    run(env: CommandEnvironment) : Promise<void> {
        this.discord.channels.forEach(i => {
            let chan : TextBasedChannelFields;
            if(i.type == "text") {
                chan = <TextChannel>i;
                chan.stopTyping(true);
            }
            else if (i.type == "dm") {
                chan = <DMChannel>i;
                chan.stopTyping(true);
            }
        });
        return Promise.resolve();
    }
}