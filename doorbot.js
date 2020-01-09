const https = require('https');
const parse = require('url').parse;
const format = require('url').format;
const stringify = require('querystring').stringify;
const crypto = require("crypto");
const io = require('socket.io-client');
const logger = require('debug')('doorbot');
const fs = require('fs');

const API_VERSION = 11;
let hardware_id = crypto.randomBytes(16).toString("hex");

const homeDir = require('os').homedir();
const path = require('path');
const cacheFile = ".ringAlarmCache";

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
        this.retries = options.retries || 10;
        this.counter = 0;
        this.userAgent = options.userAgent || 'Dalvik/2.1.0 (Linux; U; Android 8.1.0; LG-RS988 Build/OPM6.171019.030.H1)';
        this.token = options.token || null;
        this.oauthToken = options.oauthToken || null;
        this.alarmSockets = {};
        this.alarmCallbacks = {};
        this.api_version = options.api_version || API_VERSION;
        this.cacheDir = options.cacheDir || homeDir;


        if (!this.username) {
            throw(new Error('username is required'));
        }
        if (!this.password) {
            throw(new Error('password is required'));
        }

	this.loadingCache = false;
        this.cacheQueue = [];
        this.loadCache(this.cacheDir);

        this.authenticating = false;
        this.authQueue = [];
    }

    fetch(method, url, query, body, callback) {
        logger('fetch:', this.counter, method, url);
        var d = parse(url, true);
        if(url.indexOf('http') === -1)
            d = parse('https://api.ring.com/clients_api' + url, true);

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
        d.headers['Authorization'] = "Bearer " + this.oauthToken;
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

    loadCache(cacheDir){
        this.loadingCache = true;
        fs.readFile(path.join(cacheDir,cacheFile), 'utf8', (err, data) => {
            this.loadingCache = false;
            if(!err) {
                let jsonData = JSON.parse(data);
                hardware_id = jsonData.hardware_id;
                this.oauthToken = jsonData.oauthToken;
                this.refreshToken = jsonData.refreshToken;
                logger("found cached data: " + stringify(jsonData));
            }
            else
                logger('error loading cached data' + err);
            if (this.cacheQueue.length) {
                logger(`Clearing ${this.cacheQueue.length} callbacks from the cache queue`);
                this.cacheQueue.forEach(_cb => {
                    return _cb();
                });
                this.cacheQueue = [];
            }
        });
    }

    writeCache(){
        let outObj = {
            oauthToken: this.oauthToken,
            refreshToken: this.refreshToken,
            hardware_id: hardware_id
        };
        let outStr = JSON.stringify(outObj);
        fs.writeFile(path.join(this.cacheDir, cacheFile), outStr, 'utf8', (err) => {
            if(err) logger('failed to persist token data' + err);
            else logger('successfully saved token data');
        });
    }



    loginOauth(callback, type){
        logger('authenticating with oAuth...');
        let body;
        if(type === "login")
            body = JSON.stringify({
                client_id: "ring_official_android",
                grant_type: "password",
                username: this.username,
                password: this.password,
                scope: "client"
            });
        else if(type === "refresh")
            body = JSON.stringify({
                client_id: "ring_official_android",
                grant_type: "refresh_token",
                refresh_token: this.refreshToken,
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
                if (json && json.access_token && json.refresh_token) {
                    token = json.access_token;
                    this.oauthToken = token;
                    this.refreshToken = json.refresh_token;
                    logger('authentication_token', token);
                    this.writeCache();
                }
                if (!token || e) {
                    logger('access_token request failed, bailing..');
                    e = e || new Error('API failed to return an authentication_token');
                    return callback(e);
                }
                return callback(null, token);
            });
        });
        req.on('error', callback);
        req.write(body);
        req.end();

    }



    getOauthToken(callback){
	if(this.refreshToken){
            logger('found refresh token, attempting to refresh');
            this.loginOauth((e, token) => {
               if(e) {
                   logger("oAuth refresh failed, attempting login");
                   return this.loginOauth(callback, "login");
               }
               logger("successfully refreshed oAuth token");
               return callback(e, token);
            }, "refresh");
        }
        else{
            return this.loginOauth(callback, "login");
        }
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
                api_version: this.api_version
            }, data, (e, res, json) => {
                /*istanbul ignore else - It's only for logging..*/
                if (json) {
                    logger('code', json.statusCode);
                    logger('headers', json.headers);
                }
                logger('error', e);
                if (e && e.code === 401 && this.counter < this.retries) {
                    logger('auth failed, retrying', e);
                    this.counter += 1;
                    let self = this;
                    setTimeout(() => {
                        logger('auth failed, retry', { counter: self.counter });
                        self.token = self.oauthToken = null;
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
        if(this.loadingCache){
            logger("Cache read in progress. Queuing auth");
            this.cacheQueue.push(() => {
                this.authenticate(retryP, callback);
            });
            return;
        }
        if (!retryP) {
            if (this.oauthToken) {
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
        let self = this;
        this.getOauthToken((err, token) => {
            if(err)  return callback(err);
            self.authenticating = false;
            if (self.authQueue.length) {
		logger(`Clearing ${self.authQueue.length} callbacks from the queue`);
                self.authQueue.forEach(_cb => {
                    return _cb(err, token);
                });
                self.authQueue = [];
            }
            return callback(null, token);
        })

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

    subscribe(device, callback) {
        validate_device(device);
        validate_callback(callback);
        var url = `/doorbots/${device.id}/subscribe`;
        this.simpleRequest(url, 'POST',{}, callback);
    }

    subscribe_motion(device, callback){
        validate_device(device);
        validate_callback(callback);
        var url = `/doorbots/${device.id}/motions_subscribe`;
        this.simpleRequest(url, 'POST', {}, callback);
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

    initAlarmConnection(device, callback){
        validate_device(device);
        validate_callback(callback);
        if(this.alarmSockets[device.location_id] === undefined) {
            this.simpleRequest("https://app.ring.com/api/v1/rs/connections", "POST", { accountId: device.location_id }, (e, connection) => {
                logger('Connecting to Websocket');
                this.alarmSockets[device.location_id] = io.connect("wss://" + connection.server + "/?authcode=" + connection.authCode, {} );
                this.alarmSockets[device.location_id].on('connect', callback);
                this.alarmSockets[device.location_id].on('connect', () => {
                    this.registerAlarmCallback(device, 'message', (message) => {
                        logger("Generic Message Received");
                        if(this.alarmCallbacks[message.msg] !== undefined)
                            this.alarmCallbacks[message.msg](message);
                    });
                });
            });
        }
    }

    registerAlarmCallback(device, messageType, callback){
        validate_device(device);
        validate_callback(callback);
        this.alarmCallbacks[messageType] = callback;
        if(this.alarmSockets[device.location_id] !== undefined)
            return this.alarmSockets[device.location_id].on(messageType, callback);
        else
            this.initAlarmConnection(device, () => {
                logger('Connected to websocket');
                this.registerAlarmCallback(device, messageType, callback);
            });
    }

    sendAlarmMessage(device, messageType, messageBody){
        validate_device(device);
        if(this.alarmSockets[device.location_id] !== undefined)
            this.alarmSockets[device.location_id].emit(messageType, messageBody);
        else
            this.initAlarmConnection(device, () => {
                logger('Connected to websocket');
                this.sendAlarmMessage(device, messageType, messageBody);
            });
    }

    getAlarmDevices(alarmDevice, callback){
        validate_device(alarmDevice);
        validate_callback(callback);
        this.alarmCallbacks.DeviceInfoDocGetList = callback;
        this.sendAlarmMessage(alarmDevice, 'message', { msg: "DeviceInfoDocGetList", seq: 1 });
    }

    setAlarmMode(alarmDevice, alarmPanelId, alarmMode, bypassedSensors, callback){
        this.alarmCallbacks.DeviceInfoSet = callback;
        this.sendAlarmMessage(alarmDevice, 'message', {
            msg: "DeviceInfoSet",
            seq: 2,
            datatype: "DeviceInfoSetType",
            body: [
                {
                    zid: alarmPanelId,
                    command: {
                        v1: [
                            {
                                commandType: 'security-panel.switch-mode',
                                data: {
                                    mode: alarmMode,
                                    bypass: bypassedSensors
                                }
                            }
                        ]
                    }
                }
            ]
        });
    }

    closeAlarmConnection(device){
        this.alarmSockets[device.location_id].emit('terminate', {});
        this.alarmSockets[device.location_id].disconnect(true);
        this.alarmSockets[device.location_id].close();
    }

}

module.exports = function(options) {
    return new Doorbot(options);
};
