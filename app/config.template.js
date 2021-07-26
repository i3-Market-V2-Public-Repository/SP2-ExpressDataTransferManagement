"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const port = Number(process.env.PORT) ?? 3000;
const server = {
    addr: '0.0.0.0',
    port,
    publicUri: process.env.PUBLIC_URI ?? `http://localhost:${port}` // It SHOULD BE https when using a public server
};
const oidcConfig = {
    providerUri: 'https://oidc.i3m.gold.upc.edu/oidc',
    client: {
        client_id: '<my_client_id>',
        client_secret: '<my_client_secret>',
        redirect_uris: [`${server.publicUri}/oidc/cb`],
        application_type: 'web',
        grant_types: ['authorization_code'],
        response_types: ['code'],
        token_endpoint_auth_method: 'client_secret_jwt',
        id_token_signed_response_alg: 'EdDSA' // One of 'HS256', 'PS256', 'RS256', 'ES256', 'EdDSA'
    }
};
const api = {
    allowedOrigin: server.publicUri // The domain allowed to connect to this sercer with JS, eg 'http://localhost:3000'
};
const jwt = {
    secret: crypto_1.randomFillSync(Buffer.alloc(32)).toString('base64'),
    iss: server.addr,
    aud: server.addr
};
exports.default = { server, oidc: oidcConfig, api, jwt };
