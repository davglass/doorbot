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

class Doorbot {
    constructor(options) {
        options = options || {};
        this.username = options.username || options.email;
        this.password = options.password;
        this.retries = options.retries || 0;
        this.counter = 0;
        this.userAgent = options.userAgent || '@nodejs-doorbot';
        this.token = null;

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

        if (query) {
            Object.keys(query).forEach((key) => {
                d.query[key] = query[key];
            });
        }
    
        d = parse(format(d), true);
        logger('fetch-data', d);
        d.method = method;
        d.headers = d.headers || {};
        if (this.username && this.password && !this.token) {
            d.headers['Authorization'] = 'Basic ' + new Buffer(this.username + ':' + this.password).toString('base64');
        }
        if (body) {
            body = stringify(body);
            d.headers['content-type'] = 'application/x-www-form-urlencoded';
            d.headers['content-length'] = body.length;
        }
        d.headers['user-agent'] = this.userAgent;
        logger('fetch-headers', d.headers);
        const req = https.request(d, (res) => {
            var data = '';
            res.on('data', (d) => {
                data += d;
            });
            /*istanbul ignore next*/
            res.on('error', (e) => {
                callback(e);
            });
            res.on('end', () => {
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
        if (method === 'POST') {
            logger('fetch-post', body);
            req.write(body);
        }
        req.end();
    }

    simpleRequest(url, method, callback) {
        this.authenticate(() => {
            this.fetch(method, url, {
                api_version: API_VERSION,
                auth_token: this.token
            }, null, (e, res, json) => {
                if (e && e.code === 401 && this.counter < this.retries) {
                    logger('auth failed, retrying');
                    this.counter += 1;
                    setTimeout(() => {
                        this.token = null;
                        this.authenticate((e) => {
                            /*istanbul ignore next*/
                            if (e) {
                                return callback(e);
                            }
                            this.simpleRequest(url, method, callback);
                        });
                    }, 500);
                    return;
                }
                this.counter = 0;
                callback(e, res, json);
            });
        });
    }

    authenticate(callback) {
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
        logger('authenticating..');
        
        this.fetch('POST', '/session', null, {
            username: this.username,
            password: this.password,
            'device[os]': 'ios',
            'device[hardware_id]': hardware_id,
            api_version: API_VERSION
        }, (e, json) => {
            const token = json && json.profile && json.profile.authentication_token;
            logger('authentication_token', token);
            if (!token) {
                e = new Error('Api failed to return an authentication_token');
            }
            //Timeout after authentication to let the token take effect
            //performance issue..
            setTimeout(() => {
                this.token = token;
                this.authenticating = false;
                if (this.authQueue.length) {
                    logger(`Clearing ${this.authQueue.length} callbacks from the queue`);
                    this.authQueue.forEach(_cb => {return _cb(e, token);});
                }
                callback(e, token);
            }, 1500);
        });
    }

    devices(callback) {
        this.simpleRequest('/ring_devices', 'GET', callback);
    }

    history(limit, callback) {
        if (typeof limit === 'function') {
            callback = limit;
            limit = 20;
        }
        const url = `/doorbots/history?limit=${limit}`;
        this.simpleRequest(url, 'GET', callback);
    }

    dings(callback) {
        this.simpleRequest('/dings/active', 'GET', callback);
    }

    lightOn(device, callback) {
        var url = `/doorbots/${device.id}/floodlight_light_on`;
        this.simpleRequest(url, 'PUT', callback);
    }

    lightOff(device, callback) {
        var url = `/doorbots/${device.id}/floodlight_light_off`;
        this.simpleRequest(url, 'PUT', callback);
    }

    lightToggle(device, callback) {
        var url = `/doorbots/${device.id}/floodlight_light_off`;
        if (device.hasOwnProperty('led_status') && device.led_status === 'off') {
            url = `/doorbots/${device.id}/floodlight_light_on`;
        }
        this.simpleRequest(url, 'PUT', callback);
    }

    recording(id, callback) {
        this.simpleRequest(`/dings/${id}/recording`, 'GET', (e, json, res) => {
            callback(e, res && res.headers && res.headers.location, res);
        });
    }
}

module.exports = function(options) {
    return new Doorbot(options);
};
