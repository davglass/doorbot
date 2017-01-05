Ring.com Doorbell API [![Build Status](https://travis-ci.org/davglass/doorbot.svg?branch=master)](https://travis-ci.org/davglass/doorbot)
=====================
I built this because of this [tweet](https://twitter.com/ring/status/816752533137977344).

I have nothing to do with Ring.com, they just annoyed me with that tweet, so I figured out their api..

usage
-----

`npm i doorbot --save`

```js
const ring = require('doorbot');

const email = 'your@email.com';
const password = '12345';

ring.authenticate(email, password, (e, token) => {
    console.log(e, token);
    ring.devices(token, (e, devices) => {
        console.log(e, devices);
        ring.history(token, (e, history) => {
            console.log(e, history);
            ring.recording(token, history[0].id, (e, recording) => {
                console.log(e, recording);
                const check = () => {
                    console.log('Checking for ring activity..');
                    ring.dings(token, (e, json) => {
                        console.log(e, json);
                    });
                };
                setInterval(check, 30 * 1000);
                check();
            });
        });
    });
});
```

api
---

Get an access token from their API

`ring.authenticate(email, pass) => (error, token)`

Get a list of your devices:

`ring.devices(token, callback) => (error, array)`

Get your ring history:

`ring.history(token, callback) => (error, array)`

Get a URL to a recording:

`ring.recording(token, id, callback) => (error, url)`
