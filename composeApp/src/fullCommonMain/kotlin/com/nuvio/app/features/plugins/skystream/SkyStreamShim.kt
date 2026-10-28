package com.nuvio.app.features.plugins.skystream

/**
 * Runs SkyStream (`.sky`) plugins on the Nuvio plugin runtime.
 *
 * SkyStream plugins expose `getHome`, `search`, `load` and `loadStreams` with node-style callbacks
 * and expect the SkyStream SDK globals (`http_get`, `parseHtml`, `MultimediaItem`, ...). This
 * prelude provides those globals on top of the Nuvio runtime (`fetch`, Ksoup DOM bridge,
 * CryptoJS) and publishes the Nuvio entry points the app calls:
 *
 *  - `getHomeFeed()`  -> `{ categories: [{ id, name, items }] }`
 *  - `search({ query })` -> `{ items }`
 *  - `getMeta({ url })` -> `{ episodes, description, ... }`
 *  - `getStreams(tmdbId, type, season, episode, url)` -> Nuvio stream results
 *
 * The JS below must not contain a dollar sign: it is a Kotlin raw string.
 */
internal object SkyStreamShim {
    fun wrap(manifestJson: String, pluginCode: String): String = buildString {
        append("var manifest = ")
        append(manifestJson)
        append(";\n")
        append(PRELUDE)
        append("\n;(function() {\n")
        append(pluginCode)
        append("\n})();\n")
        append(ADAPTER)
    }

    private val PRELUDE = """
        globalThis.manifest = manifest;
        var __skyPrefs = {};
        try { __skyPrefs = JSON.parse(typeof SCRAPER_SETTINGS === 'string' ? SCRAPER_SETTINGS : JSON.stringify(SCRAPER_SETTINGS || {})) || {}; } catch (e) { __skyPrefs = {}; }

        class Actor { constructor(p) { Object.assign(this, p); } }
        class Trailer { constructor(p) { Object.assign(this, p); } }
        class NextAiring { constructor(p) { Object.assign(this, p); } }
        class MultimediaItem {
            constructor(params) {
                Object.assign(this, { type: 'movie', status: 'unknown', playbackPolicy: 'none', isAdult: false, streams: [], syncData: {} }, params || {});
            }
        }
        class Episode {
            constructor(params) {
                Object.assign(this, { season: 0, episode: 0, dubStatus: 'none', playbackPolicy: 'none', streams: [] }, params || {});
            }
        }
        class StreamResult {
            constructor(p) {
                p = p || {};
                this.url = p.url; this.source = p.source || 'Auto'; this.quality = p.quality;
                this.headers = p.headers; this.subtitles = p.subtitles;
                this.drmKid = p.drmKid; this.drmKey = p.drmKey; this.licenseUrl = p.licenseUrl;
            }
        }
        globalThis.Actor = Actor;
        globalThis.Trailer = Trailer;
        globalThis.NextAiring = NextAiring;
        globalThis.MultimediaItem = MultimediaItem;
        globalThis.Episode = Episode;
        globalThis.StreamResult = StreamResult;
        globalThis.CloudStream = { getLanguage: function() { return 'tr'; }, getRegion: function() { return 'TR'; } };

        function __skyHybrid(status, body, headers) {
            var hybrid = new String(body || '');
            Object.defineProperty(hybrid, 'status', { value: status, enumerable: false });
            Object.defineProperty(hybrid, 'statusCode', { value: status, enumerable: false });
            Object.defineProperty(hybrid, 'code', { value: status, enumerable: false });
            Object.defineProperty(hybrid, 'body', { value: body || '', enumerable: false });
            Object.defineProperty(hybrid, 'headers', { value: headers || {}, enumerable: false });
            return hybrid;
        }

        async function __skyHttp(method, url, headers, body) {
            if (method === 'POST' && headers && typeof headers === 'object' && !body && (headers.body || headers.headers)) {
                body = headers.body; headers = headers.headers;
            }
            var options = { method: method, headers: headers || {} };
            if (body !== undefined && body !== null) {
                options.body = typeof body === 'string' ? body : JSON.stringify(body);
            }
            try {
                var response = await fetch(url, options);
                var text = await response.text();
                var raw = (response.headers && response.headers.raw) || {};
                return __skyHybrid(response.status, text, raw);
            } catch (e) {
                return __skyHybrid(0, '', {});
            }
        }

        globalThis.http_get = function(url, headers, cb) {
            return __skyHttp('GET', url, headers, null).then(function(res) {
                if (typeof cb === 'function') cb(res);
                return res;
            });
        };
        globalThis.http_post = function(url, headers, body, cb) {
            return __skyHttp('POST', url, headers, body).then(function(res) {
                if (typeof cb === 'function') cb(res);
                return res;
            });
        };
        globalThis.http_parallel = function(requests) {
            return Promise.all((requests || []).map(function(r) {
                if (typeof r === 'string') return __skyHttp('GET', r, {}, null);
                return __skyHttp((r.method || 'GET').toUpperCase(), r.url, r.headers, r.body);
            }));
        };
        globalThis._fetch = function(url) { return http_get(url, {}); };

        function __skyUnpack(source) {
            var text = String(source || '');
            var match = text.match(/\}\s*\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/);
            if (!match) return text;
            var payload = match[1].replace(/\\'/g, "'");
            var radix = parseInt(match[2], 10);
            var words = match[4].split('|');
            var digits = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
            function decode(word) {
                var value = 0;
                for (var i = 0; i < word.length; i++) {
                    var d = digits.indexOf(word.charAt(i));
                    if (d < 0 || d >= radix) return -1;
                    value = value * radix + d;
                }
                return value;
            }
            return payload.replace(/\b\w+\b/g, function(word) {
                var index = decode(word);
                return index >= 0 && index < words.length && words[index] ? words[index] : word;
            });
        }
        globalThis.getAndUnpack = __skyUnpack;

        function __skyNodeData(id) {
            try { return JSON.parse(__dom_node_info(id) || '{}'); } catch (e) { return {}; }
        }
        class JSNode {
            constructor(docId, nodeId, data) {
                this.docId = docId; this.nodeId = nodeId; this.data = data || {};
                this.textContent = this.data.textContent || '';
                this.innerText = this.textContent;
                this.innerHTML = this.data.innerHTML || '';
                this.outerHTML = this.data.outerHTML || '';
                this.tagName = (this.data.tagName || '').toUpperCase();
            }
            get className() { return this.getAttribute('class') || ''; }
            get id() { return this.getAttribute('id') || ''; }
            getAttribute(name) { return this.data.attributes && name in this.data.attributes ? this.data.attributes[name] : null; }
            hasAttribute(name) { return this.getAttribute(name) !== null; }
            __ids(query) {
                var json = this.nodeId === this.docId
                    ? __cheerio_select(this.docId, query)
                    : __cheerio_find(this.docId, this.nodeId, query);
                try { return JSON.parse(json) || []; } catch (e) { return []; }
            }
            querySelectorAll(query) {
                var docId = this.docId;
                return this.__ids(query).map(function(id) { return new JSNode(docId, id, __skyNodeData(id)); });
            }
            querySelector(query) {
                var ids = this.__ids(query);
                return ids.length ? new JSNode(this.docId, ids[0], __skyNodeData(ids[0])) : null;
            }
        }
        class JSDocument extends JSNode {
            constructor(docId) { super(docId, docId, {}); }
            get body() { return this.querySelector('body'); }
            get title() { var t = this.querySelector('title'); return t ? t.textContent : ''; }
        }
        globalThis.parseHtml = async function(html) { return new JSDocument(__cheerio_load(String(html || ''))); };
        globalThis.JSDOM = class JSDOM {
            constructor(html) { this.window = { document: new JSDocument(__cheerio_load(String(html || ''))) }; }
            async waitForInit() { return this; }
        };
        globalThis.parse_html = async function(html, selector, attr) {
            var doc = new JSDocument(__cheerio_load(String(html || '')));
            return doc.querySelectorAll(selector).map(function(node) {
                return attr ? node.getAttribute(attr) : node.textContent;
            });
        };

        globalThis.nativeRegex = function(text, pattern, group, caseSensitive) {
            var flags = caseSensitive === false ? 'gi' : 'g';
            var re; try { re = new RegExp(pattern, flags); } catch (e) { return []; }
            var out = []; var m;
            while ((m = re.exec(String(text || ''))) !== null) {
                out.push(m[group || 0] || '');
                if (m.index === re.lastIndex) re.lastIndex++;
            }
            return out;
        };
        globalThis.nativeJsonExtract = function(jsonStr, paths) {
            var root; try { root = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr; } catch (e) { return {}; }
            var out = {};
            (paths || []).forEach(function(path) {
                var cur = root;
                String(path).split('.').forEach(function(part) { cur = cur == null ? undefined : cur[part]; });
                out[path] = cur === undefined ? null : cur;
            });
            return out;
        };

        globalThis.setPreference = function(key, value) { __skyPrefs[key] = value; };
        globalThis.getPreference = function(key) { return Promise.resolve(key in __skyPrefs ? __skyPrefs[key] : null); };
        globalThis.solveCaptcha = function() { return Promise.reject('Captcha is not supported in Nuvio TR'); };

        var __skyCrypto = globalThis.crypto || {};
        __skyCrypto.decryptAES = async function(data, key, iv, options) {
            var mode = (options && options.mode) === 'ecb' ? CryptoJS.mode.ECB : CryptoJS.mode.CBC;
            var params = { mode: mode, padding: CryptoJS.pad.Pkcs7 };
            if (iv) params.iv = CryptoJS.enc.Utf8.parse(iv);
            var plain = CryptoJS.AES.decrypt(data, CryptoJS.enc.Utf8.parse(key), params);
            return plain.toString(CryptoJS.enc.Utf8);
        };
        __skyCrypto.pbkdf2 = async function(password, salt, iterations, keyLength) {
            return CryptoJS.PBKDF2(password, salt, { keySize: (keyLength || 32) / 4, iterations: iterations || 10000 }).toString();
        };
        globalThis.crypto = __skyCrypto;
    """.trimIndent()

    private val ADAPTER = """
        function __skyCall(fn, args) {
            return new Promise(function(resolve) {
                if (typeof fn !== 'function') { resolve(null); return; }
                var done = false;
                function finish(res) { if (!done) { done = true; resolve(res); } }
                try {
                    var returned = fn.apply(null, (args || []).concat([finish]));
                    if (returned && typeof returned.then === 'function') {
                        returned.then(function(value) { if (value) finish(value); }, function() { finish(null); });
                    }
                } catch (e) {
                    finish(null);
                }
            });
        }
        function __skyData(res) {
            if (!res) return null;
            if (res.success === false) return null;
            return res.data !== undefined ? res.data : res;
        }
        function __skyType(type) {
            var t = String(type || 'movie').toLowerCase();
            if (t === 'series' || t === 'anime' || t === 'tv' || t === 'show') return 'series';
            if (t === 'movie') return 'movie';
            return null;
        }
        function __skyItem(item) {
            if (!item || !item.url || !item.title) return null;
            var type = __skyType(item.type);
            if (!type) return null;
            var sync = item.syncData || {};
            return {
                id: item.url, url: item.url, name: item.title, type: type,
                year: item.year, poster: item.posterUrl, background: item.bannerUrl, logo: item.logoUrl,
                description: item.description, genres: item.tags || [],
                externalIds: { tmdbId: sync.tmdb ? String(sync.tmdb) : undefined, imdbId: sync.imdb ? String(sync.imdb) : undefined }
            };
        }
        function __skyStream(stream) {
            if (!stream || !stream.url) return null;
            var quality = stream.quality === undefined || stream.quality === null ? undefined : String(stream.quality);
            return {
                name: stream.source || manifest.name,
                title: [stream.source || manifest.name, quality].filter(Boolean).join(' · '),
                url: stream.url, quality: quality, headers: stream.headers, provider: manifest.name,
                subtitles: (stream.subtitles || []).filter(function(s) { return s && s.url; }).map(function(s) {
                    return { url: s.url, language: s.lang || s.label || 'Unknown', name: s.label };
                })
            };
        }
        async function __skyLoad(url) { return __skyData(await __skyCall(globalThis.load, [url])); }
        async function __skyStreams(url) { return __skyData(await __skyCall(globalThis.loadStreams, [url])) || []; }

        async function __skyResolveStreams(url, season, episode) {
            var item = await __skyLoad(url);
            var target = url;
            var streams = [];
            if (item) {
                var episodes = item.episodes || [];
                if (season !== undefined && season !== null && episodes.length) {
                    var ep = episodes.filter(function(e) {
                        return Number(e.season) === Number(season) && Number(e.episode) === Number(episode);
                    })[0];
                    if (!ep) return [];
                    if (ep.streams && ep.streams.length) streams = ep.streams; else target = ep.url;
                } else if (item.streams && item.streams.length) {
                    streams = item.streams;
                }
            }
            if (!streams.length) streams = await __skyStreams(target);
            return streams.map(__skyStream).filter(Boolean);
        }

        async function __skyFindByTmdb(tmdbId, mediaType) {
            if (!tmdbId || !/^\d+/.test(String(tmdbId)) || typeof globalThis.search !== 'function') return null;
            var kind = mediaType === 'tv' ? 'tv' : 'movie';
            var res = await fetch('https://api.themoviedb.org/3/' + kind + '/' + String(tmdbId).match(/^\d+/)[0] + '?language=tr-TR&api_key=' + TMDB_API_KEY);
            var info = await res.json();
            if (!info) return null;
            var titles = [info.title, info.name, info.original_title, info.original_name].filter(Boolean);
            var year = String(info.release_date || info.first_air_date || '').slice(0, 4);
            function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9ğüşıöç]+/g, ''); }
            for (var i = 0; i < titles.length; i++) {
                var found = __skyData(await __skyCall(globalThis.search, [titles[i], 1])) || [];
                var wanted = kind === 'tv' ? 'series' : 'movie';
                var candidates = found.filter(function(item) { return item && __skyType(item.type) === wanted; });
                var exact = candidates.filter(function(item) {
                    return norm(item.title) === norm(titles[i]) && (!item.year || !year || String(item.year) === year);
                })[0];
                if (exact) return exact.url;
            }
            return null;
        }

        module.exports.getHomeFeed = async function() {
            var home = __skyData(await __skyCall(globalThis.getHome, [])) || {};
            var categories = Object.keys(home).map(function(name) {
                var items = (home[name] || []).map(__skyItem).filter(Boolean);
                return { id: name, name: name, items: items };
            }).filter(function(c) { return c.items.length > 0; });
            return { categories: categories };
        };
        module.exports.search = async function(args) {
            var found = __skyData(await __skyCall(globalThis.search, [args.query, 1])) || [];
            return { items: found.map(__skyItem).filter(Boolean) };
        };
        module.exports.getMeta = async function(args) {
            var item = await __skyLoad(args.url);
            if (!item) return {};
            return {
                description: item.description, poster: item.posterUrl, background: item.bannerUrl, year: item.year,
                episodes: (item.episodes || []).map(function(e) {
                    return { season: Number(e.season) || 1, episode: Number(e.episode) || 0, name: e.name, description: e.description, thumbnail: e.posterUrl };
                })
            };
        };
        module.exports.getStreams = async function(tmdbId, mediaType, season, episode, url) {
            var target = url || await __skyFindByTmdb(tmdbId, mediaType);
            if (!target) return [];
            return __skyResolveStreams(target, mediaType === 'tv' ? season : null, episode);
        };
    """.trimIndent()
}
