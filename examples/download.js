#!/usr/bin/env node

/*
 *
 * To use this: npm install async request doorbot
 *
 */

const RingAPI = require('doorbot');
const async = require('async');
const fs = require('fs');
const path = require('path');
const url = require('url');
const request = require('request');

const ring = RingAPI({
    email: 'your@email.com'
    password: '12345'
});

const base = path.join(__dirname, 'downloads');

fs.mkdir(base, () => { //ignoring if it exists..
    ring.history((e, history) => {
        const fetch = (info, callback) => {
            ring.recording(info.id, (e, recording) => {
                const file = path.join(base, '.', url.parse(recording).pathname);
                console.log('Fetching file', file);
                const writer = fs.createWriteStream(file);
                writer.on('close', () => {
                    console.log('Done writing', file);
                    callback();
                });
                request(recording).pipe(writer);
            });
        };

        async.eachLimit(history, 10, fetch, () => {
            console.log('done');
        });
    });
});
