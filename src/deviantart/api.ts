import * as querystring from 'querystring';
import * as dt from './datatypes'
import * as request from 'request-promise-native';
import { OAuth2Client } from './oauthclient';
import { Partial } from '../util';
import { URL } from 'url';

export interface OffsetPaginatedResult<T> {
    has_more: boolean;
    next_offset: number;
    results: T[];
}

export interface GetGalleryFoldersItem {
    folderid: string;
    parent: string | null;
    name: string;
    size?: number;
    deviations?: dt.DeviationInfo[];
}

export interface HasMatureFilter {
    matureContent? : boolean;
}

export interface OffsetPaginatedRequest {
    offset : number;
    limit : number;
}

export interface GetFoldersOptions extends Partial<HasMatureFilter>, Partial<OffsetPaginatedRequest> {
    username? : string;
    calculateSize? : boolean;
    preload? : boolean;
}

export interface GetFolderContentsOptions extends Partial<HasMatureFilter>, Partial<OffsetPaginatedRequest> {
    username? : string;
    folderid : string;
}

export type GetFolderContentsResult = OffsetPaginatedResult<dt.DeviationInfo> & {
    name?: string
};
export type GetGalleryFoldersResult = OffsetPaginatedResult<GetGalleryFoldersItem>;

export interface ApiOptions {
    apiRoot : string,
    defaultMatureVisible : boolean,
    userAgent: string,
    oauthEndpoint: string
};

export interface DeviationMetadataOptions {
    ext_submission?: boolean,
    ext_camera?: boolean,
    ext_stats?: boolean,
    ext_collection?: boolean
}

export interface DeviationMetadataResponse {
    metadata: dt.DeviationMetadata[]
}

export class Api {
    private _clientId: string;
    private _clientSecret: string;
    private _accessToken : { token: string; expires: Date } | null = null;
    private _client : OAuth2Client;
    private _opts : ApiOptions

    readonly DEFAULT_OPTS : ApiOptions = {
        apiRoot: "https://www.deviantart.com/api/v1/oauth2/",
        oauthEndpoint: "https://www.deviantart.com/oauth2/token",
        defaultMatureVisible: true,
        userAgent: 'lightningphoenixs-deviantart-client/0.5'
    }
    readonly DEVIANTART_API_MINOR_VERSION = 20160316;
    readonly GETMETADATA_CHUNK_SIZE = 50;
    readonly GETMETADATA_EXTENDED_CHUNK_SIZE = 10;

    constructor(clientId: string, clientSecret: string, opts?: Partial<ApiOptions> ) {
        this._clientId = clientId;
        this._clientSecret = clientSecret;

        this._opts = Object.assign({}, this.DEFAULT_OPTS, opts);

        this._client = new OAuth2Client(this._opts.oauthEndpoint, this._clientId, this._clientSecret);
    }

    async getGalleryFolders(options : GetFoldersOptions) : Promise<GetGalleryFoldersResult> {
        let response =  await this._client.requestWithClientCredentials({
            url: new URL("./gallery/folders", this._opts.apiRoot),
            qs: options,
            json: true
        });
        
        if(response.statusCode != 200) {
            throw {
                response: response,
                error: new Error("DA API call failed")
            };
        }

        else {
            return Promise.resolve(response.body);
        }
    }

    async getFolder(options: GetFolderContentsOptions) : Promise<GetFolderContentsResult> {
        let newopts : any = Object.assign({}, options);
        delete newopts.folderid;
        let response =  await this._client.requestWithClientCredentials({
            url: new URL("./gallery/" + options.folderid, this._opts.apiRoot),
            qs: newopts,
            json: true
        });
        
        if(response.statusCode != 200) {
            throw {
                response: response,
                error: new Error("DA API call failed")
            };
        }

        else {
            return response.body;
        }
    }

    async getDeviation(id: string) : Promise<dt.DeviationInfo> {
        let response =  await this._client.requestWithClientCredentials({
            url: new URL("./deviation/" + id, this._opts.apiRoot),
            json: true
        });
        
        if(response.statusCode != 200) {
            throw {
                response: response,
                error: new Error("DA API call failed")
            };
        }

        else {
            return response.body;
        }
    }

    async getDeviationMetadata(ids: string[], opts: DeviationMetadataOptions) : Promise<DeviationMetadataResponse> {
        let querystring = Object.assign({deviationids: ids}, opts);

        let response =  await this._client.requestWithClientCredentials({
            url: new URL("./deviation/metadata", this._opts.apiRoot),
            qs: querystring,
            json: true
        });
        
        if(response.statusCode != 200) {
            throw {
                response: response,
                error: new Error("DA API call failed")
            };
        }

        else {
            return response.body;
        }
    }
}