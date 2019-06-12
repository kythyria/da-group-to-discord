import { Description, Permission, Ambient, CommandEnvironment, Command } from "../commandsystem/commandobjects";
import { Poller } from "../poller";

@Description("Immediately check for un-notified deviations")
@Permission("listedAdmin")
export class PollNow implements Command {
    @Ambient()
    poller!: Poller

    async run(env: CommandEnvironment) : Promise<void> {
        await this.poller.poll();
        return env.reply("Done");
    }
}

@Description("Tell the polling system to start checking automatically (this doesn't run one immediately)")
@Permission("listedAdmin")
export class PollStart implements Command {
    @Ambient()
    poller!: Poller

    async run(env: CommandEnvironment) : Promise<void> {
        this.poller.start();
    }
}

@Description("Tell the polling system to stop checking automatically")
@Permission("listedAdmin")
export class PollStop implements Command {
    @Ambient()
    poller!: Poller

    async run(env: CommandEnvironment) : Promise<void> {
        this.poller.stop();
    }
}

@Description("Check for new deviations but don't notify them, just remember they've been seen.")
@Permission("listedAdmin")
export class MarkAllRead implements Command {
    @Ambient()
    poller!: Poller
    
    async run(env: CommandEnvironment) : Promise<void> {
        await this.poller.markRead();
        return env.reply("Done");
    }
}