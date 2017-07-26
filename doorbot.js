const https = require('https');
const parse = require('url').parse;
const format = require('url').format;
const stringify = require('querystring').stringify;

const logger = require('debug')('doorbot');

const API_VERSION = 9;

const formatDates = (key, value) => {
    if (value && value.indexOf && value.indexOf('.000Z') > -1) {
        return new Date(value);
    }
    return value;
};

const scrub = (data) => {
    data = data.replace(/"id":(\d+),"created_at"/g, '"id":"$1","created_at"');
    return data;
};

class Doorbot {
    constructor(options) {
        options = options || {};
        this.username = options.username || options.email;
        this.password = options.password;
        this.retries = options.retries || 15;
        this.counter = 0;
        this.userAgent = options.userAgent || '@nodejs-doorbot';
        this.token = null;

        if (!this.username) {
            throw(new Error('username is required'));
        }
        if (!this.password) {
            throw(new Error('password is required'));
        }
    }

    fetch(method, url, data, callback) {
        logger('fetch:', this.counter, method, url);
        var d = parse('https://api.ring.com/clients_api' + url, true);
        delete d.path;
        delete d.href;
        if (method === 'GET') {
            Object.keys(data).forEach((key) => {
                d.query[key] = data[key];
            });
        }
        d = parse(format(d), true);
        logger('fetch-data', d);
        d.method = method;
        d.headers = d.headers || {};
        if (this.username && this.password && !this.token) {
            d.headers['Authorization'] = 'Basic ' + new Buffer(this.username + ':' + this.password).toString('base64');
        }
        if (method !== 'GET') {
            data = stringify(data);
            d.headers['content-type'] = 'application/x-www-form-urlencoded';
            d.headers['content-length'] = data.length;
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
            logger('fetch-post', data);
            req.write(data);
        }
        req.end();
    }

    simpleGet(url, callback) {
        this.authenticate(() => {
            this.fetch('GET', url, {
                api_version: API_VERSION,
                auth_token: this.token
            }, (e, res, json) => {
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
                            this.simpleGet(url, callback);
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
        logger('authenticating..');
        this.fetch('POST', '/session', {
            username: this.username,
            password: this.password,
            'device[os]': 'ios',
            'device[hardware_id]': 'https://twitter.com/ring/status/816752533137977344', //Because I can..
            api_version: API_VERSION
        }, (e, json) => {
            this.token = json && json.profile && json.profile.authentication_token;
            logger('authentication_token', this.token);
            if (!this.token) {
                e = new Error('Api failed to return an authentication_token');
            }
            callback(e, this.token);
        });
    }

    devices(callback) {
        this.simpleGet('/ring_devices', callback);
    }

    history(callback) {
        this.simpleGet('/doorbots/history', callback);
    }

    dings(callback) {
        this.simpleGet('/dings/active', callback);
    }

    recording(id, callback) {
        this.simpleGet(`/dings/${id}/recording`, (e, json, res) => {
            callback(e, res && res.headers && res.headers.location, res);
        });
    }
}

module.exports = function(options) {
    return new Doorbot(options);
};
