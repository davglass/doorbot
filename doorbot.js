const https = require('https');
const parse = require('url').parse;
const format = require('url').format;
const stringify = require('querystring').stringify;

const API_VERSION = 9;

const formatDates = (key, value) => {
    if (value && value.indexOf && value.indexOf('.000Z') > -1) {
        return new Date(value);
    }
    return value;
};

const fetch = (method, url, data, callback) => {
    var d = parse('https://api.ring.com/clients_api' + url, true);
    delete d.path;
    delete d.href;
    if (method === 'GET') {
        Object.keys(data).forEach((key) => {
            d.query[key] = data[key];
        });
    }
    d = parse(format(d), true);
    d.method = method;
    d.headers = d.headers || {};
    if (data.username && data.password) {
        d.headers['Authorization'] = 'Basic ' + new Buffer(data.username + ':' + data.password).toString('base64');
        delete data.username;
        delete data.password;
    }
    if (method !== 'GET') {
        data = stringify(data);
        d.headers['content-type'] = 'application/x-www-form-urlencoded';
        d.headers['content-length'] = data.length;
    }
    d.headers['user-agent'] = '@nodejs-doorbot';
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
            var json,
                e = null;
            try {
                json = JSON.parse(data, formatDates);
            } catch (e) {
                json = data;
            }
            if (json.error) {
                e = json;
                e.status = Number(e.status);
                json = {};
            }
            if (!e && res.statusCode >= 400) {
                e = new Error(`API returned Status Code ${res.statusCode}`);
            }
            callback(e, json, res);
        });
    });
    req.on('error', callback);
    if (method === 'POST') {
        req.write(data);
    }
    req.end();
};

exports.fetch = fetch;

const simpleGet = (token, url, callback) => {
    fetch('GET', url, {
        api_version: API_VERSION,
        auth_token: token
    }, callback);
};

const devices = (token, callback) => {
    simpleGet(token, '/ring_devices', callback);
};

exports.devices = devices;

const history = (token, callback) => {
    simpleGet(token, '/doorbots/history', callback);
};

exports.history = history;

const dings = (token, callback) => {
    simpleGet(token, '/dings/active', callback);
};

exports.dings = dings;

const recording = (token, id, callback) => {
    simpleGet(token, `/dings/${id}/recording`, (e, json, res) => {
        callback(e, res && res.headers && res.headers.location, res);
    });
};

exports.recording = recording;

const authenticate = (username, password, callback) => {
    fetch('POST', '/session', {
        username: username,
        password: password,
        'device[os]': 'ios',
        'device[hardware_id]': 'https://twitter.com/ring/status/816752533137977344', //Because I can..
        api_version: API_VERSION
    }, (e, json) => {
        callback(e, json && json.profile && json.profile.authentication_token);
    });
};

exports.authenticate = authenticate;
