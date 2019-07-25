export type Result<S,F extends BasicError = BasicError> = {result: "success", value: S} | F;

export class BasicError extends Error {
    result: "fail" = "fail";
    innerError: Error | undefined;

    constructor(message: string, opts?: {innerError?: Error}) {
        super(message);
        if(opts) {
            this.innerError = opts.innerError;
        }
    }
}

export function succeed<T>(result: T) : Result<T> {
    return {result: "success", value: result};
}