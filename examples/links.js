#!/usr/bin/env node

/*
 *
 * To use this: npm install async doorbot
 *
 */

const RingAPI = require('doorbot');
const async = require('async');

const ring = RingAPI({
    email: 'your@email.com',
    password: '12345'
});

ring.history((e, history) => {
    const fetch = (info, callback) => {
        ring.recording(info.id, (e, recording) => {
            callback(null, recording);
        });
    };

    async.map(history, fetch, (e, data) => {
        console.log(data.join('\n'));
    });
});
