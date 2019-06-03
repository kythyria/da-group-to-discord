import { Description, Permission, Ambient, CommandEnvironment, Command } from "../commandsystem/commandobjects";
import { Poller } from "../poller";

@Description("Immediately check for un-notified deviations")
@Permission("owner")
export class PollNow implements Command {
    @Ambient()
    poller!: Poller

    async run(env: CommandEnvironment) : Promise<void> {
        await this.poller.poll();
    }
}