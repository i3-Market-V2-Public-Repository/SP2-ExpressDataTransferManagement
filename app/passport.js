'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const passport_1 = __importDefault(require("passport"));
const passport_jwt_1 = require("passport-jwt");
const openid_client_1 = require("openid-client");
const config_1 = __importDefault(require("./config"));
exports.default = async () => {
    const issuer = await openid_client_1.Issuer.discover(config_1.default.oidc.providerUri);
    console.log('Discovered issuer %s %O', issuer.issuer, issuer.metadata);
    const client = new issuer.Client(config_1.default.oidc.client);
    /**
     * JWT strategies differ in how the token is got from the request:
     * either cookies or the HTTP bearer authorization header
     */
    passport_1.default.use('jwtBearer', new passport_jwt_1.Strategy({
        jwtFromRequest: passport_jwt_1.ExtractJwt.fromAuthHeaderAsBearerToken(),
        secretOrKey: config_1.default.jwt.secret
    }, (jwtPayload, done) => {
        return done(null, jwtPayload);
    }));
    passport_1.default.use('oidc', new openid_client_1.Strategy({
        client,
        usePKCE: false
    }, (token, done) => {
        return done(null, token);
    }));
    return passport_1.default;
};
