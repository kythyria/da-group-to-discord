import { Result, BasicError, succeed } from "../../result";
import { URL } from "url";
import { tryParseURL } from "../../util";

export function extractAppUrl($ : CheerioStatic) : Result<URL> {
    let meta = $('meta[property="da:appurl"]');
    if(meta.length == 0) {
        return new BasicError("Couldn't find the meta tag with the deviation ID");
    }

    let content : string|undefined = meta.attr("content");
    if(!content) {
        return new BasicError("Page is malformed: <meta> missing @content");
    }

    let linkurl = tryParseURL(content);
    if(!linkurl) {
        return new BasicError("Page contained a malformed appurl.");
    }
    return succeed(linkurl);
}