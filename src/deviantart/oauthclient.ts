import * as https from 'https';
import * as querystring from 'querystring';
import request from 'request-promise-native';
import * as errors from 'request-promise-native/errors';
import { URL } from 'url';
import { promises } from 'fs';

interface BearerToken {
    access_token: string;
    token_type: "bearer";
    expires_in?: number;
    refresh_token?: string;
    scope: string;
}

interface RequestFailed {
    request?: request.OptionsWithUrl;
    response?: request.FullResponse;
    error: Error
}

export class OAuth2Client {
    private _clientId : string;
    private _clientSecret : string;
    private _clientAccessToken : BearerToken;
    private _clientTokenExpiresAt : number = 0;
    public tokenEndpoint : string | URL;
    public maxRetries : number = 5;
    public currentSleep : number = 0;
    public sleepIncrement = 1000;

    constructor(tokenEndpoint : string | URL, clientId : string, clientSecret : string) {
        this.tokenEndpoint = tokenEndpoint;
        this._clientId = clientId;
        this._clientSecret = clientSecret;
        this._clientAccessToken = {
            access_token: "",
            token_type: "bearer",
            scope: ""
        }
    }

    async requestWithRetries(opts : request.OptionsWithUrl) : Promise<request.FullResponse> {
        let finalResponse : request.FullResponse | undefined;
        let newopts : request.OptionsWithUrl = Object.assign({resolveWithFullResponse: true, simple: false, gzip: true}, opts);
        for (let i = 0; i < this.maxRetries ; i++) {
            if(this.currentSleep > 0) {
                await new Promise(res => setTimeout(res, this.currentSleep));
            }
            let response : request.FullResponse = await request(newopts);
            finalResponse = response;
            if(response.statusCode == 429 || (response.statusCode >= 500 && response.statusCode <= 599)) {
                this.currentSleep += this.sleepIncrement * i;
                continue;
            }
            else {
                this.currentSleep = 0;
                break;
            }
        }
        if(!finalResponse) {
            return Promise.reject<request.FullResponse>({
                request: newopts,
                error: new Error("Failed to request even once.")
            });
        }
        return finalResponse;
    }

    async getClientCredentialsRequest() : Promise<BearerToken> {
        let req = {
            url: this.tokenEndpoint,
            method: "POST",
            form: {
                client_id: this._clientId,
                client_secret: this._clientSecret,
                grant_type: "client_credentials"
            },
            json: true
        };
        let resp = await this.requestWithRetries(req);

        if (resp.statusCode != 200) {
            return Promise.reject({
                request: req,
                response: resp,
                error: new Error("Failed to get client token")
            });
        }

        return resp.body;
    }

    async refreshClientAccessToken() : Promise<void> {
        let response = await this.getClientCredentialsRequest();

        this._clientAccessToken = response;
        let expires = this._clientAccessToken.expires_in || 3600;
        this._clientTokenExpiresAt = Date.now() + expires*1000;
        return Promise.resolve();
    }

    async requestWithClientCredentials(opts : request.OptionsWithUrl) : Promise<request.FullResponse> {
        if(Date.now() >= this._clientTokenExpiresAt || !this._clientAccessToken) {
            await this.refreshClientAccessToken();
        }
        let newopts = Object.assign({}, opts);
        newopts.qs = Object.assign({
            access_token: this._clientAccessToken.access_token
        }, opts.qs);
        let response = await this.requestWithRetries(newopts);
        if (response.statusCode == 401 && response.body.error == "invalid_token") {
            // we are PROBALBLY in the "token expired" case.
            // the only way to tell is examining a human-readable error, so we'll
            // just guess.
            await this.refreshClientAccessToken();
            newopts.qs.access_token = this._clientAccessToken.access_token
            response = await this.requestWithRetries(newopts);

            if (response.statusCode == 401 && response.body.error == "invalid_token") {
                return Promise.reject({
                    request: newopts,
                    response: response,
                    error: new Error("Got invalid token even after refreshing")
                });
            }
        }
        return Promise.resolve(response);
    }
}