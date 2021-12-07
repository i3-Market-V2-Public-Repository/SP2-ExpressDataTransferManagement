#!/bin/bash

if [ -z "$(ls -A ./node_modules 2>/dev/null)"  ]; then
    echo "Installing dependencies"
    npm install
fi

exec "$@"