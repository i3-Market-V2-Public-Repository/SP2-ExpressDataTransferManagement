"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const openid_client_1 = require("openid-client");
openid_client_1.Issuer.discover('https://oidc.i3m.gold.upc.edu/oidc').then(function (issuer) {
    console.log('Discovered issuer %s %O', issuer.issuer, issuer.metadata);
}).catch(err => { throw new Error(err); });
