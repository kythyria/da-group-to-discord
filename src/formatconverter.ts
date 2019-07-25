import * as p5 from 'parse5';
import cheerio from 'cheerio';

export let emojiByDaEmoticon : Map<string, string> = new Map([
    ["https://e.deviantart.net/emoticons/b/biggrin.gif", "😀"],
    ["https://e.deviantart.net/emoticons/h/heart.gif", "❤️"],
]);

const DA_EMOTICON_SERVER = "https://e.deviantart.net/";

interface daHtmlState {
    strong: boolean;
    emph: boolean;
    remainingChars: number;
}

function* mapStateMany<TItem, TResult, TState>(items: Iterable<TItem>, state: TState, func : (item : TItem, state: TState) => IterableIterator<TResult>) : IterableIterator<TResult> {
    for(let i of items) {
        yield* func(i, state);
    }
}

function enforceTruncation(characters: number, lines: number, strings: IterableIterator<string>) {
    let buf = "";
    for(let i of strings) {
        if(buf.length + i.length > characters) { break; }
        buf += i;
    }
    buf = buf.replace(/\n\n\n+/, "\n\n");
    let count = 0;
    let lastidx = buf.length;
    for(let i = 0; i < buf.length; i++) {
        if(buf[i] == "\n") { count++; }
        if(count > lines) {
            lastidx = i;
            break;
        }
    }
    return buf.slice(0, lastidx);
}

function escapeText(txt : string) {
    const reMagicSymbols = /[*_`<:~]/;
    return txt.replace(reMagicSymbols, "\\$&");
}

export function daHtmlToDfm(input: string) {
    let $ = cheerio.load(input);

    let inbody = $("body");

    return(enforceTruncation(768, 15, convertElement(inbody)));
}

function *convertElement(el: Cheerio) : IterableIterator<string> {
    if(el.is("br")) {
        yield "\n";
    }
    else if(el.is("img")) {
        // @types/cheerio is wrong about the signature.
        let alt : string|undefined = el.attr("alt");
        let src : string|undefined = el.attr("src");
        let m = /:icon(.*):/.exec(alt);

        if(m) {
            yield escapeText(m[1])
        }
        else if(src && src.startsWith(DA_EMOTICON_SERVER)) {
            yield escapeText(alt);
        }
        else {
            yield "[image]";
        }
    }
    else if(el.is("em") || el.is("i")) {
        yield "_";
        yield* convertChildren(el);
        yield "_";
    }
    else if(el.is("strong") || el.is("b")) {
        yield "**";
        yield* convertChildren(el);
        yield "**";
    }
    else {
        yield* convertChildren(el);
    }
}

function* convertChildren(parent: Cheerio) : IterableIterator<string> {
    let childs = parent.children();
    for(let i = 0; i < childs.length; i++) {
        let el = childs[i];
        switch(el.type) {
            case "text":
                yield escapeText(el.data || "");
                break;
            case "tag":
                yield* convertChildren(cheerio(el));
                break;
        }
    }
}

export function daHtmlToDfm1(input: string) : string {
    let inTree : any = p5.parse(input); // It's DOM-like, but with a typing that obscures this so you can't look at the children of a #text

    let inBody = inTree.childNodes[0].childNodes[1];
    let outText = "";

    let state : daHtmlState = {
        strong: false,
        emph: false,
        remainingChars: 768
    }

    // TODO: Complete rewrite to actually emit markdown correctly rahter than just strip everything.
    // TODO: End the truncation with a "..."

    

    function* palpableItem(i: any, state : daHtmlState) : IterableIterator<string> {
        if(state.remainingChars <= 0) { return; }
        switch(i.nodeName) {
            case "#text":
                let txt = escapeText(i.value);
                state.remainingChars -= txt.length;
                yield txt;
                break;
            case "#comment":
                break;            
            case "br":
                state.remainingChars--;
                yield "\n";
                break;
            case "img":
                let alt = i.attrs.find((j :any) => j.name == "alt");
                let src = i.attrs.find((j :any) => j.name == "src");
                if(alt) {
                    let m = /:icon(.*):/.exec(alt.value);
                    if (m) {
                        state.remainingChars -= m[1].length;
                        yield m[1];
                    }
                    else if(src && (src.value as string).startsWith(DA_EMOTICON_SERVER)) {
                        state.remainingChars -= alt.value.length;
                        yield escapeText(alt.value);
                    }
                    else {
                        state.remainingChars -= "[image]".length;
                        yield "[image]";
                    }
                }
                else {
                    state.remainingChars -= "[image]".length;
                    yield "[image]";
                }
                break;
            default:
                yield* mapStateMany(i.childNodes, state, palpableItem);
                break;
        }   
    }

    let result = Array.from(mapStateMany(inBody.childNodes, state, palpableItem));
    if(state.remainingChars <= 0) {
        result.push("...");
    }
    return result.join("");
}