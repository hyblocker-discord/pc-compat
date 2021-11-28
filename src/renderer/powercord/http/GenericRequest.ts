const querystring = require('querystring');
const https = require('https');
const http = require('http');
const url = require('url');

class HTTPError extends Error {
    constructor(message, res) {
        super(message);
        Object.assign(this, res);
        this.name = this.constructor.name;
    }
}

interface GenericRequest {
    opts: {
        method: String,
        uri: String,
        query: Object,
        headers: Object,
        data?: any;
    },
    _res: any;
}

class GenericRequest {
    constructor(method, uri) {
        this.opts = {
            method,
            uri,
            query: {},
            headers: {
                'User-Agent': navigator.userAgent
            }
        };
    }

    _objectify(key, value) {
        return key instanceof Object
            ? key
            : { [key]: value };
    }

    query(key, value) {
        Object.assign(this.opts.query, this._objectify(key, value));
        return this;
    }

    set(key, value) {
        Object.assign(this.opts.headers, this._objectify(key, value));
        return this;
    }

    send(data) {
        if (data instanceof Object) {
            const serialize = this.opts.headers['Content-Type'] === 'application/x-www-form-urlencoded'
                ? querystring.encode
                : JSON.stringify;

            this.opts.data = serialize(data);
        } else {
            this.opts.data = data;
        }

        return this;
    }

    execute() {
        return new Promise((resolve, reject) => {
            const opts = Object.assign({}, this.opts);
            console.debug('%c[Powercord:HTTP]', 'color: #7289da', 'Performing request to', opts.uri);
            const { request } = opts.uri.startsWith('https')
                ? https
                : http;

            if (Object.keys(opts.query)[0]) {
                opts.uri += `?${querystring.encode(opts.query)}`;
            }

            const options = Object.assign({}, opts, url.parse(opts.uri));

            const req = request(options, (res) => {
                const data = [];

                res.on('data', (chunk) => {
                    data.push(chunk);
                });

                res.once('error', reject);

                res.once('end', () => {
                    const raw = Buffer.concat(data);

                    const result = {
                        raw,
                        body: (() => {
                            if ((/application\/json/).test(res.headers['content-type'])) {
                                try {
                                    return JSON.parse(raw);
                                } catch (_) { }
                            }

                            return raw;
                        })(),
                        ok: res.statusCode >= 200 && res.statusCode < 400,
                        statusCode: res.statusCode,
                        statusText: res.statusMessage,
                        headers: res.headers
                    };

                    if (result.ok) {
                        resolve(result);
                    } else {
                        reject(new HTTPError(`${res.statusCode} ${res.statusMessage}`, result));
                    }
                });
            });

            req.once('error', reject);

            if (this.opts.data) {
                req.write(this.opts.data);
            }

            req.end();
        });
    }

    then(resolver, rejector) {
        if (this._res) {
            return this._res.then(resolver, rejector);
        }

        return (
            this._res = this.execute().then(resolver, rejector)
        );
    }

    catch(rejector) {
        return this.then(null, rejector);
    }
}

export default GenericRequest;
