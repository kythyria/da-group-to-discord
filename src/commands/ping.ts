import { Description, Permission, Command, CommandEnvironment } from "../commandsystem/commandobjects";

@Description("Responds")
@Permission("anyone")
export class Ping implements Command {
    async run(env: CommandEnvironment) : Promise<void> {
        await env.reply("Pong!");
    }
}