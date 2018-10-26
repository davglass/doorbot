
const RingAPI = require('../doorbot.js');
const assert = require('assert');
const nock = require('nock');

nock.disableNetConnect();

describe('doorbot tests', () => {
    
    beforeEach(() => {
        nock.cleanAll();
    });

    it('should export stuff', () => {
        assert.ok(RingAPI);
        assert.ok(RingAPI.Doorbot);
    });
    
    it('authenticate', (done) => {
        nock('https://oauth.ring.com').post('/oauth/token')
            .reply(200, {
                access_token: 'ACCESS_TOKEN'
            });
        nock('https://api.ring.com').post('/clients_api/session?api_version=11')
            .reply(200, {
                profile: {
                    authentication_token: 'TOKEN'
                }
            });
        const ring = new RingAPI.Doorbot({
            email: 'test',
            password: 'test',
            api_version: 11
        });
        ring.authenticate((e, token) => {
            assert.equal(token, 'TOKEN');
            done();
        });
    });
    
    it('should use auth queue for parallel calls', function(done) {
        nock('https://oauth.ring.com').post('/oauth/token')
            .reply(200, {
                access_token: 'ACCESS_TOKEN'
            });
        nock('https://api.ring.com').persist().post('/clients_api/session?api_version=9')
            .reply(200, {
                profile: {
                    authentication_token: 'TOKEN'
                }
            });
        const ring = RingAPI({
            email: 'test',
            password: 'test'
        });
        ring.authenticate(() => {});
        assert.ok(ring.authenticating);
        ring.authenticate(() => {});
        assert.equal(ring.authQueue.length, 1);
        ring.authenticate(() => {});
        assert.equal(ring.authQueue.length, 2);
        done();
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
    
    it('authenticate failed - no access_token', (done) => {
        nock('https://oauth.ring.com').post('/oauth/token')
            .reply(401, {
                error: 'You must log in'
            });
        const ring = RingAPI({
            username: 'asdf',
            password: 'asdf'
        });
        ring.devices((e, token) => {
            assert.equal(token, undefined);
            assert.equal(e.message, 'Api failed to return an authentication_token');
            done();
        });
    });
    
    it('authenticate failed - access_token bad json', (done) => {
        nock('https://oauth.ring.com').post('/oauth/token')
            .reply(500, '');
        const ring = RingAPI({
            username: 'asdf',
            password: 'asdf'
        });
        ring.devices((e, token) => {
            assert.equal(token, undefined);
            assert.equal(e.message, 'JSON parse error from ring, check logging..');
            done();
        });
    });
    
    it('authenticate failed - token bad json', (done) => {
        nock('https://oauth.ring.com').post('/oauth/token')
            .reply(200, {
                access_token: 'ACCESS_TOKEN'
            });
        nock('https://api.ring.com').post('/clients_api/session?api_version=9')
            .reply(500, '');
        const ring = RingAPI({
            username: 'asdf',
            password: 'asdf'
        });
        ring.devices((e, token) => {
            assert.equal(token, undefined);
            assert.equal(e.message, 'JSON parse error from ring, check logging..');
            done();
        });
    });
    
    it('authenticate failed', (done) => {
        nock('https://oauth.ring.com').post('/oauth/token')
            .reply(200, {
                access_token: 'ACCESS_TOKEN'
            });
        nock('https://api.ring.com').post('/clients_api/session?api_version=9')
            .reply(500, {
                error: 'Ring.com defined error message'
            });
        const ring = RingAPI({
            username: 'asdf',
            password: 'asdf'
        });
        ring.devices((e, token) => {
            assert.equal(token, undefined);
            assert.equal(e.message, 'Ring.com defined error message');
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
            .query({ auth_token: 'TOKEN', api_version: 9, limit: 20 })
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

    it('get history with limit', (done) => {
        nock('https://api.ring.com').get('/clients_api/doorbots/history')
            .query({ auth_token: 'TOKEN', api_version: 9, limit: 40 })
            .reply(200, [
                { device: 1, d: '2017-01-05T19:05:40.000Z' }
            ]);
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        ring.history(40, (e, json) => {
            assert.ok(json);
            assert.ok(Array.isArray(json));
            assert.equal(json[0].device, 1);
            assert.ok(json[0].d instanceof Date && isFinite(json[0].d));
            done();
        });
    });

    it('get history with limit and older_than', (done) => {
        nock('https://api.ring.com').get('/clients_api/doorbots/history')
            .query({ auth_token: 'TOKEN', api_version: 9, limit: 40, older_than: '12345678' })
            .reply(200, [
                { device: 1, d: '2017-01-05T19:05:40.000Z' }
            ]);
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        ring.history(40, '12345678', (e, json) => {
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

    it('start vod', (done) => {
        nock('https://api.ring.com').post('/clients_api/doorbots/1/vod')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200, {
            });
        nock('https://api.ring.com').get('/clients_api/dings/active')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200, [
              { doorbot_id: 2, kind: 'on_demand' },
              { doorbot_id: 1, kind: 'on_demand' }
            ]);
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        ring.vod({ id: 1 }, (e, json) => {
            assert.ok(json);
            assert.equal(json.doorbot_id, 1);
            assert.equal(json.kind, 'on_demand');
            done();
        });
    });

    it('start vod with error', (done) => {
        nock('https://api.ring.com').post('/clients_api/doorbots/1/vod')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200, {
            });
        nock('https://api.ring.com').get('/clients_api/dings/active')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200, []);
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        ring.vod({ id: 1 }, (e) => {
            assert.ok(e);
            done();
        });
    });

    it('start vod with vod error', (done) => {
        nock('https://api.ring.com').post('/clients_api/doorbots/1/vod')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(500, {
                error: new Error('Borked')
            });
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        ring.vod({ id: 1 }, (e) => {
            assert.ok(e);
            done();
        });
    });
    
    it('start vod with ding error', (done) => {
        nock('https://api.ring.com').post('/clients_api/doorbots/1/vod')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200, {
            });
        nock('https://api.ring.com').get('/clients_api/dings/active')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(500, {
                error: new Error('Borked')
            });
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        ring.vod({ id: 1 }, (e) => {
            assert.ok(e);
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
        nock('https://oauth.ring.com').persist().post('/oauth/token')
            .reply(200, {
                access_token: 'ACCESS_TOKEN'
            });
        nock('https://api.ring.com').persist().post('/clients_api/session?api_version=9')
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
    
    it('set chime do not disturb', (done) => {
        nock('https://api.ring.com').post('/clients_api/chimes/12345/do_not_disturb')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200);
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        const device = { id: '12345' };
        ring.set_chime_dnd(device, 180, (e) => {
            assert.equal(e, null);
            done();
        });
    });

    it('set chime do not disturb to off', (done) => {
        nock('https://api.ring.com').post('/clients_api/chimes/12345/do_not_disturb')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200);
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        const device = { id: '12345' };
        ring.set_chime_dnd(device, 0, (e) => {
            assert.equal(e, null);
            done();
        });
    });

    it('get chime do not disturb', (done) => {
        nock('https://api.ring.com').get('/clients_api/chimes/12345/do_not_disturb')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200);
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        const device = { id: '12345' };
        ring.get_chime_dnd(device, (e) => {
            assert.equal(e, null);
            done();
        });
    });

    it('set doorbot do not disturb', (done) => {
        nock('https://api.ring.com').post('/clients_api/doorbots/12345/motion_snooze')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200);
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        const device = { id: '12345' };
        ring.set_doorbot_dnd(device, 180, (e) => {
            assert.equal(e, null);
            done();
        });
    });
    
    it('set doorbot do not disturb to off', (done) => {
        nock('https://api.ring.com').post('/clients_api/doorbots/12345/motion_snooze/clear')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200);
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        const device = { id: '12345' };
        ring.set_doorbot_dnd(device, 0, (e) => {
            assert.equal(e, null);
            done();
        });
    });
    
    it('call the health check api', (done) => {
        nock('https://api.ring.com').get('/clients_api/doorbots/12345/health')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200, {
                device_health: {}
            });
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        const device = { id: '12345' };
        ring.health(device, (e, json) => {
            assert.equal(e, null);
            assert.ok(json.device_health);
            done();
        });
    });
    
    it('work for alarm API', (done) => {
        nock('https://app.ring.com').get('/api/v1/rs/connections')
            .matchHeader('Authorization', 'Bearer OAUTH_TOKEN')
            .reply(200, {
                foo: {}
            });
        const ring = RingAPI({
            username: 'test',
            password: 'test'
        });
        ring.token = 'TOKEN';
        ring.oauthToken = 'OAUTH_TOKEN';
        ring.fetch('GET', 'https://app.ring.com/api/v1/rs/connections', {}, null, (e, json) => {
            assert.equal(e, null);
            assert.ok(json.foo);
            done();
        });
    });
    
    it('should error on a timeout', (done) => {
        nock('https://api.ring.com').get('/clients_api/doorbots/12345/health')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .delay(2000)
            .reply(200, {
                device_health: {}
            });
        const ring = RingAPI({
            username: 'test',
            password: 'test',
            timeout: 100
        });
        ring.token = 'TOKEN';
        const device = { id: '12345' };
        ring.health(device, (e) => {
            assert.ok(e);
            assert.equal(e.message, 'An API Timeout Occurred');
            done();
        });
    });
    
    it('should error on no device object', () => {
        assert.throws(() => {
            const ring = RingAPI({
                username: 'test',
                password: 'test'
            });
            ring.set_doorbot_dnd(null);
        }, /Device needs to be an object/);
    });

    it('should error on bad device', () => {
        assert.throws(() => {
            const ring = RingAPI({
                username: 'test',
                password: 'test'
            });
            ring.set_doorbot_dnd({});
        }, /Device.id not found/);
    });

    it('should error on no callback', () => {
        assert.throws(() => {
            const ring = RingAPI({
                username: 'test',
                password: 'test'
            });
            ring.set_doorbot_dnd({ id: 1234 });
        }, /Callback not defined/);
    });

    it('should error on no number argument', () => {
        assert.throws(() => {
            const ring = RingAPI({
                username: 'test',
                password: 'test'
            });
            /*istanbul ignore next*/
            ring.set_doorbot_dnd({ id: 1234 }, null, () => {});
        }, /Number argument required/);
    });

});
