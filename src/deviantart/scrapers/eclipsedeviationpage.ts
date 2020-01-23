import * as ts from "typescript";
import * as cheerio from 'cheerio';
import { Result, BasicError, succeed } from "../../result";

export interface DeviationInfo {
    deviationId: number,
    typeId: number,
    printId: any | null,
    url: string,
    title: string,
    isJournal: boolean,
    isPurchasable: boolean,
    publishedTime: string,
    isTextEditable: boolean,
    legacyTextEditUrl: string,
    isShareable: boolean;
    isCommentable: string;
    isFavourited: boolean,
    isDeleted: boolean,
    isMature: boolean,
    isDownloadable: boolean,
    isAntisocial: boolean,
    isBlocked: boolean,
    isPublished: boolean,
    blockReason: "strict-age" | string,
    author: number,
    stats: { comments: number, favourites: number },
    files: FileInfo[],
    media: MediaInfo,
    extended: number,
    entityId: number
}

export interface DeviationExtended {
    groupListUrl: string,
    description: string,
    originalFile: Pick<FileInfo, "filesize"|"type"|"height"|"width">,
    tags: TagInfo,
    typeFacet: Facet,
    categoryFacet: Facet,
    contentFacet: Facet,
    license: "none" | string,
    download: FileInfo,
    relatedStreams: {
        gallery: number[],
        recommended: number[],
        collections: RelatedCollection[],
        groups: number[]
    },
    stats: {
        views: number,
        today: number,
        shares: number,
        downloads: number,
        groups: number
    },
    reportUrl: string,
    parentDeviationEntityId: number
}

export interface TagInfo {
    name: string,
    url: string
}

export interface Facet {
    linkTo: string,
    urlFragment: string,
    displayNameEn: string
}

export interface FileInfo {
    type: string,
    src: string,
    height: number,
    width: number,
    transparency?: boolean,
    isDefault?: boolean,
    filesize?: number
}

export interface MediaInfo {
    baseUri: string,
    prettyName: string,
    token: string[],
    types: MediaInfoEntry[]
}
export interface MediaInfoEntry {
    c?: string,
    h: number,
    r: number,
    t: string,
    w: number,
    s?: string
}

export interface RelatedCollectionInfo {
    folderId: number,
    parentId: number | null,
    type: "collection" | string,
    description: string,
    owner: number,
    commentCount: number,
    size: number
}

export interface RelatedCollection {
    collection: RelatedCollectionInfo,
    deviations: number[]
}

export interface AuthorInfo {
    userId: number,
    useridUuid: string,
    username: string,
    usericon: string,
    type: "regular" | "group" | "premium" | string
    isNewDeviant: boolean
}

function tsParse(scriptText : string) {
    let sf = ts.createSourceFile("deviationInfo.js", scriptText, ts.ScriptTarget.ES2018, false, ts.ScriptKind.JS);
    return sf;
}

function stringifyObjectPath(expr: ts.Expression) : string {
    if(ts.isPropertyAccessExpression(expr)) {
        let rhs = expr.name.text;
        let lhsNode = expr.expression;
        let lhs : string;
        if(ts.isIdentifier(lhsNode)) {
            lhs = lhsNode.text;
        }
        else {
            lhs = stringifyObjectPath(lhsNode);
        }
        return `${lhs}.${rhs}`;
    }
    else if (ts.isElementAccessExpression(expr)) {
        let lhsNode = expr.expression;
        let lhs: string;
        if(ts.isIdentifier(lhsNode)) {
            lhs = lhsNode.text;
        }
        else {
            lhs = stringifyObjectPath(lhsNode);
        }
        let rhs: string;
        if(ts.isNumericLiteral(expr.argumentExpression)){
            rhs = expr.argumentExpression.text;
        }
        else {
            throw new BasicError("Encountered something that isn't a number in an otherwise object path.");
        }
        return `${lhs}[${rhs}]`;
    }
    else {
        throw new BasicError("Encountered something that isn't an object path");
    }
}

function catchStringifyObjectPath(expr: ts.Expression) : Result<string> {
    try {
        return { result: "success", value: stringifyObjectPath(expr) };
    }
    catch(e) {
        return e;
    }
}

export interface ExtractRawDataOutput {
    deviation: DeviationInfo,
    extended: DeviationExtended,
    author: AuthorInfo
};

export function extractRawData($ : CheerioStatic) : Result<ExtractRawDataOutput> {
    // We know that the data we want is //div[@id="root"]/following::script[0].
    // Or in css `div#root + script`

    let scriptElement = $("div#root + script");
    let scriptText = scriptElement.html();

    if(!scriptText) {
        return new BasicError("Place where the info should be is empty.")
    }

    let scriptAst = tsParse(scriptText);

    type exprEV = {name: ts.Expression, value: ts.Expression}
    type exprNV = {name: ts.PropertyAccessExpression, value: ts.Expression};

    let expressions = scriptAst.statements
        .filter(ts.isExpressionStatement)
        .map(s => s.expression)
        .filter(ts.isBinaryExpression)
        .filter(e => e.operatorToken.kind == ts.SyntaxKind.EqualsToken)
        .map((e) : exprEV => ({name: e.left, value: e.right}))
        .filter((i) : i is exprNV => ts.isPropertyAccessExpression(i.name))
        .map(({name, value}) => ({name: stringifyObjectPath(name), value}));

    let interesting = expressions.find(i => i.name == "window.__INITIAL_STATE__");
    if(!interesting) {
        return new BasicError("Couldn't find the __INITIAL_STATE__ in the page");
    }

    let ce = interesting.value
    if(!ts.isCallExpression(ce)) {
        return new BasicError("The __INITIAL_STATE__ wasn't a call at all.");
    }

    let callPath : string;
    try {
        callPath = stringifyObjectPath(ce.expression);
    }
    catch(e) {
        return new BasicError("Deviation info in unexpected format (expected a simple method call)", {
            innerError: e
        });
    }

    if(callPath != "JSON.parse") {
        return new BasicError("Deviation info in unexpected format (expected JSON.parse)");
    }

    if(ce.arguments.length == 0) {
        return new BasicError("Deviation info missing from JSON.parse");
    }

    let arg = ce.arguments[0];
    if(!ts.isStringLiteral(arg)) {
        return new BasicError("Deviation info mangled: string expected, got something else.");
    }

    let initialState = JSON.parse(arg.text);

    let currentItemId = initialState["@@DUPERBROWSE"].rootStream.currentOpenItem.toString();
    let currentItem : DeviationInfo = initialState["@@entities"].deviation[currentItemId];
    let result : ExtractRawDataOutput = {
        deviation: currentItem,
        extended: initialState["@@entities"].deviationExtended[currentItemId],
        author: initialState["@@entities"].user[currentItem.author]
    }

    if(!result.deviation || !result.extended) {
        return new BasicError("Not all deviation info present in the page!")
    }

    return succeed(result);
}