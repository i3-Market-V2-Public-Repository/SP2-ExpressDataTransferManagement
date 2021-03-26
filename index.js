const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const swaggerUI = require("swagger-ui-express");
const swaggerJsDoc = require("swagger-jsdoc");
const resourceRouter = require("./routes/resource");
const winston = require('winston');

const options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "DataTransferManagement API",
            version: "1.0.0",
            descripion: "Express DataTrasnferManagement API"
        },
        servers: [
            {
                url: "http://localhost:3001"
            },
        ],
    },
    apis: ["./routes/*.js"],
};

const specs = swaggerJsDoc(options)

// Logger configuration
const logConfiguration = {
    'transports': [
        new winston.transports.File({
            filename: './logs/server.log'
        })
    ]
};

// Create logger
const logger = winston.createLogger(logConfiguration);

// environment variables
const server_port = process.env.SERVER_PORT || 3001;

const app = express();

app.use("/api-docs", swaggerUI.serve, swaggerUI.setup(specs))
app.use(cors())
app.use(express.json())
app.use(morgan("dev"))
app.use("/resource", resourceRouter)

app.listen(server_port, () => {
    logger.info(`Listening to port ${server_port}...`);
})