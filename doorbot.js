const https = require('https');
const parse = require('url').parse;
const format = require('url').format;
const stringify = require('querystring').stringify;
const crypto = require("crypto");

const logger = require('debug')('doorbot');

const API_VERSION = 9;
const hardware_id = crypto.randomBytes(16).toString("hex");

const formatDates = (key, value) => {
    if (value && value.indexOf && value.indexOf('.000Z') > -1) {
        return new Date(value);
    }
    return value;
};

/*
 * This converts the ID to a string, they are using large numbers for their ID's
 * and that breaks in JS since it can't math too well..
 */
const scrub = (data) => {
    data = data.replace(/"id":(\d+),"created_at"/g, '"id":"$1","created_at"');
    return data;
};

const validate_number = (num) => {
    if (typeof num !== 'number') {
        throw new Error('Number argument required');
    }
};

const validate_device = (device) => {
    if (typeof device !== 'object' || !device) {
        throw new Error('Device needs to be an object');
    }
    if (device && !device.id) {
        throw new Error('Device.id not found');
    }
};

const validate_callback = (callback) => {
    if (typeof callback !== 'function') {
        throw new Error('Callback not defined');
    }
};

class Doorbot {
    constructor(options) {
        options = options || {};
        this.username = options.username || options.email;
        this.password = options.password;
        this.retries = options.retries || 0;
        this.timeout = options.timeout || (5 * 60 * 1000);
        this.counter = 0;
        this.userAgent = options.userAgent || 'android:com.ringapp:2.0.67(423)';
        this.token = options.token || null;
        this.api_version = options.api_version || API_VERSION;

        if (!this.username) {
            throw(new Error('username is required'));
        }
        if (!this.password) {
            throw(new Error('password is required'));
        }
        this.authenticating = false;
        this.authQueue = [];
    }

    fetch(method, url, query, body, callback) {
        logger('fetch:', this.counter, method, url);
        var d = parse('https://api.ring.com/clients_api' + url, true);
        logger('query', query);
        delete d.path;
        delete d.href;
        delete d.search;
        
        /*istanbul ignore next*/
        if (query) {
            Object.keys(query).forEach((key) => {
                d.query[key] = query[key];
            });
        }
    
        d = parse(format(d), true);
        logger('fetch-data', d);
        d.method = method;
        d.headers = d.headers || {};
        if (body) {
            body = stringify(body);
            d.headers['content-type'] = 'application/x-www-form-urlencoded';
            d.headers['content-length'] = body.length;
        }
        d.headers['user-agent'] = this.userAgent;
        logger('fetch-headers', d.headers);
        let timeoutP;
        const TIMEOUT = this.timeout;
        const req = https.request(d, (res) => {
            if (timeoutP) {
                return;
            }
            var data = '';
            res.on('data', (d) => {
                data += d;
            });
            /*istanbul ignore next*/
            res.on('error', (e) => {
                callback(e);
            });
            res.on('end', () => {
                req.setTimeout(0);
                logger('fetch-raw-data', data);
                var json,
                    e = null;
                try {
                    data = scrub(data);
                    json = JSON.parse(data, formatDates);
                } catch (e) {
                    json = data;
                }
                logger('fetch-json', json);
                if (json.error) {
                    e = json;
                    e.status = Number(e.status);
                    json = {};
                }
                if (res.statusCode >= 400) {
                    e = new Error(`API returned Status Code ${res.statusCode}`);
                    e.code = res.statusCode;
                }
                callback(e, json, res);
            });
        });
        req.on('error', callback);
        req.setTimeout(TIMEOUT, () => {
            timeoutP = true;
            callback(new Error('An API Timeout Occurred'));
        });
        if (method === 'POST') {
            logger('fetch-post', body);
            req.write(body);
        }
        req.end();
    }

    simpleRequest(url, method, data, callback) {
        if (typeof data === 'function') {
            callback = data;
            data = null;
        }
        /*istanbul ignore next*/
        if (data && !data.api_version) {
            data.api_version = this.api_version;
        }
        this.authenticate((e) => {
            if (e && !this.retries) {
                return callback(e);
            }
            this.fetch(method, url, {
                api_version: this.api_version,
                auth_token: this.token
            }, data, (e, res, json) => {
                /*istanbul ignore else - It's only for logging..*/
                if (json) {
                    logger('code', json.statusCode);
                    logger('headers', json.headers);
                }
                logger(e);
                if (e && e.code === 401 && this.counter < this.retries) {
                    logger('auth failed, retrying', e);
                    this.counter += 1;
                    var self = this;
                    setTimeout(() => {
                        logger('auth failed, retry', { counter: self.counter });
                        self.token = null;
                        self.authenticate(true, (e) => {
                            /*istanbul ignore next*/
                            if (e) {
                                return callback(e);
                            }
                            self.simpleRequest(url, method, callback);
                        });
                    }, 500);
                    return;
                }
                this.counter = 0;
                callback(e, res, json);
            });
        });
    }

    authenticate(retryP, callback) {
        if (typeof retryP === 'function') {
            callback = retryP;
            retryP = false;
        }
        if (!retryP) {
            if (this.token) {
                logger('auth skipped, we have a token');
                return callback();
            }
            if (this.authenticating) {
                logger('authenticate in progress, queuing callback');
                this.authQueue.push(callback);
                return;
            }
            this.authenticating = true;
        }
        logger('authenticating with oAuth...');
        const body = JSON.stringify({
            client_id: "ring_official_android",
            grant_type: "password",
            username: this.username,
            password: this.password,
            scope: "client"
        });
        const url = parse('https://oauth.ring.com/oauth/token');
        url.method = 'POST';
        url.headers = {
            'content-type': 'application/json',
            'content-length': body.length
        };
        logger('fetching access_token from oAuth token endpoint');
        const req = https.request(url, (res) => {
            logger('access_token statusCode', res.statusCode);
            logger('access_token headers', res.headers);
            let data = '';
            res.on('data', d => {return data += d;});
            res.on('end', () => {
                let e = null;
                let json = null;
                try {
                    json = JSON.parse(data);
                } catch (je) {
                    logger('JSON parse error', data);
                    logger(je);
                    e = new Error('JSON parse error from ring, check logging..');
                }
                let token = null;
                if (json && json.access_token) {
                    token = json.access_token;
                    logger('authentication_token', token);
                }
                if (!token || e) {
                    logger('access_token request failed, bailing..');
                    e = e || new Error('Api failed to return an authentication_token');
                    return callback(e);
                }
                const body = JSON.stringify({
                    device: {
                        hardware_id: hardware_id,
                        metadata: {
                            api_version: this.api_version,
                        },
                        os: "android"
                    }
                });
                logger('session json', body);
                const sessionURL = `https://api.ring.com/clients_api/session?api_version=${this.api_version}`;
                logger('sessionURL', sessionURL);
                const u = parse(sessionURL, true);
                u.method = 'POST';
                u.headers = {
                    Authorization: 'Bearer ' + token,
                    'content-type': 'application/json',
                    'content-length': body.length
                };
                logger('fetching token with oAuth access_token');
                const a = https.request(u, (res) => {
                    logger('token fetch statusCode', res.statusCode);
                    logger('token fetch headers', res.headers);
                    let data = '';
                    let e = null;
                    res.on('data', d => {return data += d;});
                    res.on('end', () => {
                        let json = null;
                        try {
                            json = JSON.parse(data);
                        } catch (je) {
                            logger('JSON parse error', data);
                            logger(je);
                            e = 'JSON parse error from ring, check logging..';
                        }
                        logger('token fetch response', json);
                        const token = json && json.profile && json.profile.authentication_token;
                        if (!token || e) {
                            /*istanbul ignore next*/
                            const msg = e || json && json.error || 'Authentication failed';
                            return callback(new Error(msg));
                        }
                        //Timeout after authentication to let the token take effect
                        //performance issue..
                        var self = this;
                        setTimeout(() => {
                            self.token = token;
                            self.authenticating = false;
                            if (self.authQueue.length) {
                                logger(`Clearing ${self.authQueue.length} callbacks from the queue`);
                                self.authQueue.forEach(_cb => {return _cb(e, token);});
                                self.quthQueue = [];
                            }
                            callback(e, token);
                        }, 1500);
                    });
                });
                a.on('error', callback);
                a.write(body);
                a.end();
            });
        });
        req.on('error', callback);
        req.write(body);
        req.end();
    }

    devices(callback) {
        validate_callback(callback);
        this.simpleRequest('/ring_devices', 'GET', callback);
    }

    history(limit, older_than, callback) {
        if (typeof older_than === 'function') {
            callback = older_than;
            older_than = null;
        }
        if (typeof limit === 'function') {
            callback = limit;
            limit = 20;
        }
        validate_number(limit);
        validate_callback(callback);
        const url = `/doorbots/history?limit=${limit}` + ((older_than) ? `&older_than=${older_than}` : '');
        this.simpleRequest(url, 'GET', callback);
    }

    dings(callback) {
        validate_callback(callback);
        this.simpleRequest('/dings/active', 'GET', callback);
    }

    lightOn(device, callback) {
        validate_device(device);
        validate_callback(callback);
        var url = `/doorbots/${device.id}/floodlight_light_on`;
        this.simpleRequest(url, 'PUT', callback);
    }

    lightOff(device, callback) {
        validate_device(device);
        validate_callback(callback);
        var url = `/doorbots/${device.id}/floodlight_light_off`;
        this.simpleRequest(url, 'PUT', callback);
    }

    lightToggle(device, callback) {
        validate_device(device);
        validate_callback(callback);
        var url = `/doorbots/${device.id}/floodlight_light_off`;
        if (device.hasOwnProperty('led_status') && device.led_status === 'off') {
            url = `/doorbots/${device.id}/floodlight_light_on`;
        }
        this.simpleRequest(url, 'PUT', callback);
    }

    vod(device, callback) {
        validate_device(device);
        validate_callback(callback);
        this.simpleRequest(`/doorbots/${device.id}/vod`, 'POST' , '', (e, json, res) => {
            if (e) return callback(e, res);

            this.dings((e, dings) => {
                if (e) return callback(e);

                for (let i = 0; i < dings.length; i++) {
                    const ding = dings[i];

                    if ((ding.doorbot_id === device.id) && (ding.kind === 'on_demand')) return callback(null, ding);
                }

                return callback(new Error('VOD not available'));
            });
        });
    }

    recording(id, callback) {
        validate_callback(callback);
        this.simpleRequest(`/dings/${id}/recording`, 'GET', (e, json, res) => {
            callback(e, res && res.headers && res.headers.location, res);
        });
    }

    set_chime_dnd(device, time, callback) {
        validate_device(device);
        validate_callback(callback);
        validate_number(time);
        var url = `/chimes/${device.id}/do_not_disturb`;
        this.simpleRequest(url, 'POST', {
            time: time
        }, callback);
    }

    get_chime_dnd(device, callback) {
        validate_device(device);
        validate_callback(callback);
        var url = `/chimes/${device.id}/do_not_disturb`;
        this.simpleRequest(url, 'GET', callback);
    }

    set_doorbot_dnd(device, time, callback) {
        validate_device(device);
        validate_callback(callback);
        validate_number(time);
        var url = `/doorbots/${device.id}/motion_snooze`;
        if (!time) {
            url = `/doorbots/${device.id}/motion_snooze/clear`;
        }
        this.simpleRequest(url, 'POST', {
            time: time
        }, callback);
    }
    
    health(device, callback) {
        validate_device(device);
        validate_callback(callback);
        this.simpleRequest(`/doorbots/${device.id}/health`, 'GET' , callback);
    }
}

module.exports = function(options) {
    return new Doorbot(options);
};
