
const ring = require('../doorbot.js');
const assert = require('assert');
const nock = require('nock');

describe('doorbot tests', () => {
    
    beforeEach(() => {
        nock.cleanAll();
    });

    it('should export stuff', () => {
        assert.ok(ring);
    });

    it('authenticate', (done) => {
        nock('https://api.ring.com').post('/clients_api/session')
            .reply(200, {
                profile: {
                    authentication_token: 'TOKEN'
                }
            });
        ring.authenticate('test', 'test', (e, token) => {
            assert.equal(token, 'TOKEN');
            done();
        });
    });

    it('authenticate failed', (done) => {
        nock('https://api.ring.com').post('/clients_api/session')
            .reply(500, '');
        ring.authenticate('', '', (e, token) => {
            assert.equal(token, '');
            assert.equal(e.message, 'API returned Status Code 500');
            done();
        });
    });

    it('get devices', (done) => {
        nock('https://api.ring.com').get('/clients_api/ring_devices')
            .query({ auth_token: 'TOKEN', api_version: 9 })
            .reply(200, [
                { device: 1, d: '2017-01-05T19:05:40.000Z' }
            ]);
        ring.devices('TOKEN', (e, json) => {
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
        ring.devices('TOKEN', (e) => {
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
        ring.history('TOKEN', (e, json) => {
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
        ring.dings('TOKEN', (e, json) => {
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
        ring.recording('TOKEN', 1, (e, url) => {
            assert.equal(url, URL);
            done();
        });
    });

});
