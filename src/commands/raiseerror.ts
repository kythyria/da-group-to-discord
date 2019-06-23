import { Description, Permission, Command, CommandEnvironment } from "../commandsystem/commandobjects";

@Description("Throws an error")
@Permission("listedAdmin")
export class RaiseError implements Command {
    run(env: CommandEnvironment) : Promise<void> {
        throw new Error("Error command invoked");
    }
}