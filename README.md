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
    email: 'your@email.com',
    password: '12345',
    retries: 10, //authentication retries, optional, defaults to 0
    userAgent: 'My User Agent', //optional, defaults to @android:com.ringapp:2.0.67(423)
    api_version: 11, //optional in case you need to change it from the default of 9
    timeout: (10 * 60 * 1000) //Defaults to 5 minutes
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

    //floodlights are under the stickups_cams prop
    if (devices.hasOwnProperty('stickup_cams') && 
        Array.isArray(devices.stickup_cams) &&
        devices.stickup_cams.length > 0) {
        
        ring.lightToggle(devices.stickup_cams[0], (e) => {
            //Light state has been toggled
        });
    }
});
```

api
---

Get a list of your devices:

`ring.devices(callback) => (error, array)`

Device Health:
`ring.health(device, callback) => (error, json)`

Get your ring history:

`ring.history(callback) => (error, array)`
`ring.history(limit, callback) => (error, array)` - `limit` - The `Number` of items to return from the history.
`ring.history(limit, older_than, callback) => (error, array)` - `limit` - The `Number` of items to return from the history. `older_than` - The ID of the latest history item to start with when going backward.

Get a URL to a recording:

`ring.recording(id, callback) => (error, url)`

Get information for video on demand:

`ring.vod(device, callback) => (error, json)`

Turn on floodlights

`ring.lightOn(device, callback) => (error)`

Turn off floodlights

`ring.lightOff(device, callback) => (error)`

Toggle floodlights

`ring.lightToggle(device, callback) => (error)`

Set Chime Do Not Disturb

`ring.set_chime_dnd(device, minutes, callback) => (error, json)`

* on: `ring.set_chime_dnd(device, 15, callback) => (error, json)`
* off: `ring.set_chime_dnd(device, 0, callback) => (error, json)`

Get Chime Do Not Disturb

`ring.get_chime_dnd(device, callback) => (error, json)`

Set Doorbot Do Not Disturb (motion snooze)

`ring.set_doorbot_dnd(device, minutes, callback) => (error, json)`

* on: `ring.set_doorbot_dnd(device, 60, callback) => (error, json)`
* off: `ring.set_doorbot_dnd(device, 0, callback) => (error, json)`

*The Get API call for the doorbot DND returned a 404, not sure how to get the current time*

debugging
---------

I've added the `debug` module, so you can run this with `export DEBUG=doorbot` and it will print some helpful logs.
