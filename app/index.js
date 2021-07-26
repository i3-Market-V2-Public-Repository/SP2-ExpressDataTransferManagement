'use strict';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_session_1 = __importDefault(require("express-session"));
const passport_1 = __importDefault(require("./passport"));
const http_1 = __importDefault(require("http"));
const morgan_1 = __importDefault(require("morgan"));
const routes_1 = __importDefault(require("./routes"));
const config_1 = __importDefault(require("./config"));
const crypto_1 = __importDefault(require("crypto"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const yamljs_1 = __importDefault(require("yamljs"));
const main = async function () {
    const app = express_1.default();
    const passport = await passport_1.default();
    const swaggerDocument = yamljs_1.default.load('./swagger/swagger.yaml');
    app.use(express_session_1.default({
        secret: crypto_1.default.randomBytes(32).toString('base64'),
        resave: false,
        saveUninitialized: false
    }));
    app.use(express_1.default.json());
    app.use(express_1.default.urlencoded({ extended: false }));
    app.use(morgan_1.default('dev'));
    app.use(passport.initialize());
    // app.use(passport.session())
    app.use('/api/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(swaggerDocument));
    // Load routes
    app.use('/', await routes_1.default());
    /**
     * Listen on .env SERVER_PORT or 3000/tcp, on all network interfaces.
     */
    const server = http_1.default.createServer(app);
    const { addr, port } = config_1.default.server;
    server.listen(port, addr);
    /**
     * Event listener for HTTP server "listening" event.
     */
    server.on('listening', function () {
        console.log(`Listening on http://localhost:${config_1.default.server.port}`);
        console.log(`Listening on public ${config_1.default.server.publicUri}`);
    });
};
main().catch(err => { throw new Error(err); });
