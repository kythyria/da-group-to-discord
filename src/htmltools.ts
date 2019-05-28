import { Node, Element, Document, DefaultTreeDocument, DefaultTreeElement } from "parse5";

export function getMeta(d: Document, name?: string) : DefaultTreeElement[] {
    let html : any = (<DefaultTreeDocument>d).childNodes.find(i => i.nodeName == "html");
    if(!html) { return []; }

    let head = html.childNodes.find((i : any) => i.nodeName == "head");
    if(!head) { return []; }

    let metas : DefaultTreeElement[] = [];

    for(let i of head.childNodes) {
        if(i.nodeName == "meta") {
            metas.push(i);
        }
    }

    if(!name) {
        return metas;
    }

    let result : DefaultTreeElement[] = [];
    for(let i of metas) {
        let nameattr = i.attrs.find(i => i.name == "name" || i.name == "property");
        if(nameattr && nameattr.value == name) {
            result.push(i);
        }
    }

    return result;
}