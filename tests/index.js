
const RingAPI = require('../doorbot.js');
const assert = require('assert');
const nock = require('nock');

describe('doorbot tests', () => {
    
    beforeEach(() => {
        nock.cleanAll();
    });

    it('should export stuff', () => {
        assert.ok(RingAPI);
    });
    
    it('authenticate', (done) => {
        nock('https://api.ring.com').post('/clients_api/session')
            .reply(200, {
                profile: {
                    authentication_token: 'TOKEN'
                }
            });
        const ring = RingAPI({
            email: 'test',
            password: 'test'
        });
        ring.authenticate((e, token) => {
            assert.equal(token, 'TOKEN');
            done();
        });
    });

    it('authenticate throw no username', () => {
        assert.throws(() => {
            RingAPI();
        }, /username is required/);
    });
    
    it('authenticate throw no password', () => {
        assert.throws(() => {
            RingAPI({ username: 'foo' });
        }, /password is required/);
    });
    
    it('authenticate failed', (done) => {
        nock('https://api.ring.com').post('/clients_api/session')
            .reply(500, '');
        const ring = RingAPI({
            username: 'asdf',
            password: 'asdf'
        });
        ring.authenticate((e, token) => {
            assert.equal(token, '');
            assert.equal(e.message, 'Api failed to return an authentication_token');
            done();
        });
    });
    
    it('get devices', (done) => {
        nock('https://api.ring.com').get('/clients_api/ring_devices')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200, [
                { device: 1, d: '2017-01-05T19:05:40.000Z' }
            ]);
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        ring.devices((e, json) => {
            assert.ok(json);
            assert.ok(Array.isArray(json));
            assert.equal(json[0].device, 1);
            assert.ok(json[0].d instanceof Date && isFinite(json[0].d));
            done();
        });
    });

    it('get devices error', (done) => {
        nock('https://api.ring.com').get('/clients_api/ring_devices')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200, {
                error: 'something happened'
            });
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        ring.devices((e) => {
            assert.equal(e.error, 'something happened');
            done();
        });
    
    });

    it('get history', (done) => {
        nock('https://api.ring.com').get('/clients_api/doorbots/history')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200, [
                { device: 1, d: '2017-01-05T19:05:40.000Z' }
            ]);
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        ring.history((e, json) => {
            assert.ok(json);
            assert.ok(Array.isArray(json));
            assert.equal(json[0].device, 1);
            assert.ok(json[0].d instanceof Date && isFinite(json[0].d));
            done();
        });
    });

    it('get dings', (done) => {
        nock('https://api.ring.com').get('/clients_api/dings/active')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200, [
                { device: 1, d: '2017-01-05T19:05:40.000Z' }
            ]);
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        ring.dings((e, json) => {
            assert.ok(json);
            assert.ok(Array.isArray(json));
            assert.equal(json[0].device, 1);
            assert.ok(json[0].d instanceof Date && isFinite(json[0].d));
            done();
        });
    });

    it('get recordings', (done) => {
        const URL = 'http://some.amazon.com/url/to/movie.mp4';
        nock('https://api.ring.com').get('/clients_api/dings/1/recording')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200, '', {
                location: URL
            });
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        ring.recording(1, (e, url) => {
            assert.equal(url, URL);
            done();
        });
    });

    it('turn on floodlight', (done) => {
        nock('https://api.ring.com').put('/clients_api/doorbots/12345/floodlight_light_on')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200);
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        const device = { id: '12345' };
        ring.lightOn(device, (e) => {
            assert.equal(e, null);
            done();
        });
    });

    it('turn off floodlight', (done) => {
        nock('https://api.ring.com').put('/clients_api/doorbots/12345/floodlight_light_off')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200);
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        const device = { id: '12345' };
        ring.lightOff(device, (e) => {
            assert.equal(e, null);
            done();
        });
    });

    it('toggle floodlight off -> on', (done) => {
        nock('https://api.ring.com').put('/clients_api/doorbots/12345/floodlight_light_on')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200);
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        const device = { id: '12345', led_status: 'off' };
        ring.lightToggle(device, (e) => {
            assert.equal(e, null);
            done();
        });
    });

    it('toggle floodlight on -> off', (done) => {
        nock('https://api.ring.com').put('/clients_api/doorbots/12345/floodlight_light_off')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200);
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        const device = { id: '12345', led_status: 'on' };
        ring.lightToggle(device, (e) => {
            assert.equal(e, null);
            done();
        });
    });

    it('Retry on error..', function(done) {
        this.timeout(100000);
        nock('https://api.ring.com').persist().post('/clients_api/session')
            .reply(200, {
                profile: {
                    authentication_token: 'TOKEN'
                }
            });
        nock('https://api.ring.com').persist().get('/clients_api/ring_devices')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(401, {
                error: 'Denied!!'
            });
        const ring = RingAPI({
            username: 'test',
            password: 'test',
            retries: 2
        });
        ring.token = 'TOKEN';
        ring.devices((e) => {
            assert.equal(e.message, 'API returned Status Code 401');
            done();
        });
    
    });

});
