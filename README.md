Ring.com Doorbell API [![Build Status](https://travis-ci.org/davglass/doorbot.svg?branch=master)](https://travis-ci.org/davglass/doorbot)
=====================
I built this because of this [tweet](https://twitter.com/ring/status/816752533137977344).

I have nothing to do with Ring.com, they just annoyed me with that tweet, so I figured out their api..

**doorbot 2.x has an API change**

usage
-----

`npm i doorbot --save`

```js
const RingAPI = require('doorbot');

const ring = RingAPI({
    email: 'your@email.com'
    password: '12345',
    reties: 20, //optional, defaults to 15
    userAgent: 'My User Agent' //optional, defaults to @nodejs-doorbot
});

ring.devices((e, devices) => {
    console.log(e, devices);
    ring.history((e, history) => {
        console.log(e, history);
        ring.recording(history[0].id, (e, recording) => {
            console.log(e, recording);
            const check = () => {
                console.log('Checking for ring activity..');
                ring.dings((e, json) => {
                    console.log(e, json);
                });
            };
            setInterval(check, 30 * 1000);
            check();
        });
    });
});
```

api
---

Get a list of your devices:

`ring.devices(token, callback) => (error, array)`

Get your ring history:

`ring.history(token, callback) => (error, array)`

Get a URL to a recording:

`ring.recording(token, id, callback) => (error, url)`

debugging
---------

I've added the `debug` module, so you can run this with `export DEBUG=doorbot` and it will print some helpful logs.
