// Bu dosya build.py ile üretilir; src/ altındaki kaynakları düzenleyin.
(function () {
/*
 * NuvioTR SkyStream ortak yardımcıları ve oynatıcı çözücüleri.
 * build.py bu dosyayı her eklentinin başına ekler. SkyStream shim'i (SkyStreamShim.kt) üzerinde çalışır:
 * http_get / http_post / parseHtml / StreamResult / CryptoJS globalleri kullanılır.
 */
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function hdr(extra) {
  var h = { 'User-Agent': UA, 'Accept-Language': 'tr-TR,tr;q=0.9,en;q=0.8' };
  if (extra) for (var k in extra) if (extra[k] !== undefined && extra[k] !== null) h[k] = extra[k];
  return h;
}

/** GET → metin ('' hata durumunda). */
async function getText(url, extra) {
  var res = await http_get(url, hdr(extra));
  var st = Number(res && res.status);
  if (st && (st < 200 || st >= 400)) return '';
  return String((res && res.body !== undefined) ? res.body : (res || ''));
}

async function postText(url, body, extra) {
  var res = await http_post(url, hdr(extra), body);
  var st = Number(res && res.status);
  if (st && (st < 200 || st >= 400)) return '';
  return String((res && res.body !== undefined) ? res.body : (res || ''));
}

async function getJson(url, extra) {
  try { return JSON.parse(await getText(url, extra)); } catch (e) { return null; }
}

function first(re, s) {
  var m = re.exec(String(s || ''));
  if (!m) return null;
  return m[1] === undefined ? m[0] : m[1];
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}

function clean(s) { return decodeHtml(String(s || '')).replace(/\s+/g, ' ').trim(); }

function originOf(url) { return first(/^(https?:\/\/[^/]+)/, url) || ''; }

function absUrl(base, href) {
  if (!href) return null;
  href = decodeHtml(String(href).trim());
  if (/^https?:/i.test(href)) return href;
  if (href.indexOf('//') === 0) return 'https:' + href;
  if (href.charAt(0) === '/') return originOf(base) + href;
  return base.replace(/[^/]*$/, '') + href;
}

/** JS dizge kaçışlarını çözer: \/ → /, & → & */
function jsUnescape(v) {
  return String(v || '').replace(/\\u([0-9a-fA-F]{4})|\\x([0-9a-fA-F]{2})|\\(.)/g, function (_, u, x, c) {
    if (u) return String.fromCharCode(parseInt(u, 16));
    if (x) return String.fromCharCode(parseInt(x, 16));
    return c === 'n' ? '\n' : c === 't' ? '\t' : c;
  });
}

var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64decode(s) {
  s = String(s || '').replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/]/g, '');
  var bytes = [], buf = 0, bits = 0;
  for (var i = 0; i < s.length; i++) {
    buf = (buf << 6) | B64.indexOf(s.charAt(i)); bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((buf >> bits) & 255); }
  }
  try { return decodeURIComponent(bytes.map(function (b) { return '%' + ('0' + b.toString(16)).slice(-2); }).join('')); }
  catch (e) { return bytes.map(function (b) { return String.fromCharCode(b); }).join(''); }
}

/** Dean Edwards packer çözücü (eval(function(p,a,c,k,e,d)…)). Sayfadaki tüm paketleri açar. */
function unpackAll(source) {
  var text = String(source || ''), out = [];
  var re = /\}\s*\(\s*'([\s\S]*?)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'([\s\S]*?)'\.split\('\|'\)/g, m;
  var digits = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  while ((m = re.exec(text)) !== null) {
    var payload = m[1].replace(/\\'/g, "'"), radix = parseInt(m[2], 10), words = m[4].split('|');
    out.push(payload.replace(/\b\w+\b/g, function (w) {
      var v = 0;
      for (var i = 0; i < w.length; i++) { var d = digits.indexOf(w.charAt(i)); if (d < 0 || d >= radix) return w; v = v * radix + d; }
      return v < words.length && words[v] ? words[v] : w;
    }));
  }
  return out.join('\n');
}

/** Metindeki [marker]'dan sonraki ilk { … } JSON nesnesi. */
function jsonAfter(text, marker) {
  var at = text.indexOf(marker);
  if (at < 0) return null;
  var start = text.indexOf('{', at + marker.length);
  if (start < 0) return null;
  var depth = 0, inStr = false, esc = false;
  for (var i = start; i < text.length; i++) {
    var c = text.charAt(i);
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch (e) { return null; } } }
  }
  return null;
}

/** Ad karşılaştırması için sadeleştirme. */
function normTitle(s) {
  return String(s || '').toLowerCase()
    .replace(/[ıİ]/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/&/g, 've').replace(/[^a-z0-9]+/g, '');
}

/** Başlıktaki yıl / "izle" eklerini atar: "Başlangıç (2010) izle" → "Başlangıç". */
function stripTitle(s) {
  return clean(s).replace(/\s+(full\s*hd\s*)?(türkçe\s*(dublaj|altyazılı)\s*)?(izle|izleyin)$/i, '').replace(/\s*\(\d{4}\)\s*$/, '').trim();
}

function yearOf(s) { var y = first(/\b(19\d{2}|20\d{2})\b/, s); return y ? parseInt(y, 10) : undefined; }

function qualityOf(label) {
  var q = first(/(2160|1440|1080|720|480|360)\s*p?/i, label);
  return q ? q + 'p' : 'Auto';
}

/* ------------------------------------------------------------------ Oynatıcı çözücüleri
 * Her çözücü: (embedUrl, referer) → [{ url, quality, headers, subtitles, label }]
 */

function streamRow(url, referer, quality, subs, label) {
  var o = originOf(referer || url);
  return {
    url: url, quality: quality || 'Auto', label: label || '',
    headers: { 'Referer': referer || (o + '/'), 'Origin': o, 'User-Agent': UA },
    subtitles: subs || []
  };
}

/** FirePlayer (dtpasn, contentx, hotlinger…): /player/index.php?data=ID&do=getVideo */
async function exFirePlayer(embed, referer) {
  var id = first(/\/(?:video|v|e|embed)\/([a-f0-9]{16,})/i, embed) || first(/[?&]data=([a-f0-9]{16,})/i, embed);
  if (!id) return [];
  var origin = originOf(embed);
  var body = 'hash=' + id + '&r=' + encodeURIComponent(referer || '');
  var txt = await postText(origin + '/player/index.php?data=' + id + '&do=getVideo', body, {
    'X-Requested-With': 'XMLHttpRequest', 'Referer': embed, 'Origin': origin,
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
  });
  var j; try { j = JSON.parse(txt); } catch (e) { return []; }
  var file = j && (j.securedLink || j.videoSource);
  if (!file) return [];
  return [streamRow(file, embed, 'Auto')];
}

/* pichive oynatıcısı (Dizilla vb.): NP_CONFIG + NP_GATE iş kanıtı imzası. */
function shaWord(msg, idx) { return (CryptoJS.SHA256(msg).words[idx] || 0) >>> 0; }

function pichiveNonce(html) {
  var g = /"gate"\s*:\s*\{\s*"n"\s*:\s*"([^"]+)"(?:\s*,\s*"b"\s*:\s*(\d+))?/.exec(html);
  if (!g) return null;
  var n = g[1], bits = Math.min(22, Math.max(1, parseInt(g[2] || '12', 10)));
  var MAX = 2000000, i;
  var fn = /window\.NP_GATE\s*=\s*function\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*\{([\s\S]*?)\};/.exec(html);
  if (!fn) {
    for (i = 0; i < MAX; i++) if ((shaWord(n + ':' + i, 0) >>> (32 - bits)) === 0) return String(i);
    return null;
  }
  var nVar = fn[1], body = fn[3];
  var cm = /var\s+(\w+)\s*=\s*String\.fromCharCode\(([\d,\s]+)\)/.exec(body);
  if (!cm) return null;
  var saltVar = cm[1];
  var salt = cm[2].split(',').map(function (x) { return String.fromCharCode(parseInt(x, 10)); }).join('');
  var nm = /var\s+(\w+)\s*=\s*(?:\w+\.toString\((\d*)\)|String\(\w+\))/.exec(body);
  if (!nm) return null;
  var nonceVar = nm[1], radix = Math.min(36, Math.max(2, parseInt(nm[2] || '10', 10) || 10));
  var im = /\(\s*\w+\(([^)]+)\)\[(\d+)\]\s*(>>>|&)\s*(\d+)\s*\)\s*===?\s*0/.exec(body);
  if (!im) return null;
  var parts = im[1].split('+').map(function (p) { return p.trim(); });
  var idx = parseInt(im[2], 10) || 0, op = im[3], rhs = parseInt(im[4], 10);
  for (i = 0; i < MAX; i++) {
    var nonce = i.toString(radix), msg = '';
    for (var k = 0; k < parts.length; k++) {
      var p = parts[k];
      msg += p === nVar ? n : p === saltVar ? salt : p === nonceVar ? nonce : p.replace(/^['"]|['"]$/g, '');
    }
    var w = shaWord(msg, idx);
    if (op === '>>>' ? (w >>> rhs) === 0 : ((w & rhs) >>> 0) === 0) return nonce;
  }
  return null;
}

function pichiveSign(url, nonce) {
  if (!/\/(nm|nsub)\.php/.test(url) || url.indexOf('&p=') >= 0 || !nonce) return url;
  return url + '&p=' + nonce;
}

async function exPichive(embed, referer) {
  var ph = await getText(embed, { 'Referer': referer, 'Sec-Fetch-Dest': 'iframe' });
  var cfg = jsonAfter(ph, 'NP_CONFIG');
  if (!cfg) return [];
  var nonce = /\/(nm|nsub)\.php/.test(ph) ? pichiveNonce(ph) : null;
  var origin = originOf(embed);
  var subs = (cfg.subtitles || []).map(function (t) {
    var raw = /^http/.test(t.url || '') ? t.url : t.tok ? origin + '/nsub.php?v=' + t.tok : null;
    return raw ? { url: pichiveSign(raw, nonce), lang: 'tr', label: t.label || 'Türkçe' } : null;
  }).filter(Boolean);
  return (cfg.sources || []).filter(function (s) { return /^http/.test(s.master || ''); }).map(function (s) {
    return streamRow(pichiveSign(s.master, nonce), embed, qualityOf(s.title), subs, clean(s.title));
  });
}

/** jwplayer / sources: [{file:…}] / packed betikler. */
function filesInScript(text) {
  var t = String(text || '') + '\n' + unpackAll(text);
  t = t.replace(/\\\//g, '/');
  var found = [], re = /(?:file|src|source|hls|videoUrl)\s*["']?\s*[:=]\s*["'](https?:\/\/[^"'\s]+?\.(?:m3u8|mp4)[^"'\s]*)["']/gi, m;
  while ((m = re.exec(t)) !== null) if (found.indexOf(m[1]) < 0) found.push(m[1]);
  if (!found.length) {
    var re2 = /["'](https?:\/\/[^"'\s<>]+?\.(?:m3u8)(?:\?[^"'\s<>]*)?)["']/gi;
    while ((m = re2.exec(t)) !== null) if (found.indexOf(m[1]) < 0) found.push(m[1]);
  }
  return found;
}

function subsInScript(text, base) {
  var t = String(text || '').replace(/\\\//g, '/'), out = [], m;
  var re = /\{[^{}]*?file\s*["']?\s*:\s*["']([^"']+\.(?:vtt|srt)[^"']*)["'][^{}]*?\}/gi;
  while ((m = re.exec(t)) !== null) {
    var label = first(/label\s*["']?\s*:\s*["']([^"']+)["']/i, m[0]) || 'Türkçe';
    out.push({ url: absUrl(base, m[1]), lang: /ing|eng/i.test(label) ? 'en' : 'tr', label: label });
  }
  return out;
}

async function exScript(embed, referer) {
  var html = await getText(embed, { 'Referer': referer, 'Sec-Fetch-Dest': 'iframe' });
  if (!html) return [];
  var subs = subsInScript(html, embed);
  return filesInScript(html).map(function (f) { return streamRow(f, embed, qualityOf(f), subs); });
}

/** RapidVid / atom oynatıcısı: window._p8 = ters base64 → "K9L" kaydırması → base64 JSON { cm: m3u8, ct: altyazılar }. */
function decodeP8(p8) {
  var rev = String(p8 || '').split('').reverse().join('');
  var bytes = b64latin1(rev), n = '';
  for (var i = 0; i < bytes.length; i++) n += String.fromCharCode(bytes.charCodeAt(i) - ('K9L'.charCodeAt(i % 3) % 5 + 1));
  try { return JSON.parse(b64decode(n)); } catch (e) { return null; }
}

function b64latin1(s) {
  s = String(s || '').replace(/[^A-Za-z0-9+/]/g, '');
  var out = '', buf = 0, bits = 0;
  for (var i = 0; i < s.length; i++) {
    buf = (buf << 6) | B64.indexOf(s.charAt(i)); bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((buf >> bits) & 255); }
  }
  return out;
}

async function exRapidVid(embed, referer, html) {
  var page = html || await getText(embed, { 'Referer': referer, 'Sec-Fetch-Dest': 'iframe' });
  var p8 = first(/_p8\s*=\s*'([^']+)'/, page);
  var cfg = p8 && decodeP8(p8);
  if (!cfg || !cfg.cm) return [];
  var subs = (cfg.ct || []).filter(function (t) { return t.file; }).map(function (t) {
    return { url: t.file, lang: /ing|eng/i.test(t.label || '') ? 'en' : 'tr', label: clean(t.label) || 'Türkçe' };
  });
  return [streamRow(cfg.cm, originOf(embed) + '/', '1080p', subs)];
}

/** Oynatıcı adresine göre çözücü seçer; hiçbirini tanımazsa sayfadaki m3u8/mp4'ü arar. */
async function resolveEmbed(embed, referer) {
  if (!embed || /youtube\.com|youtu\.be/.test(embed)) return [];
  embed = absUrl(referer || '', embed);
  try {
    if (/\.m3u8(\?|$)/i.test(embed)) return [streamRow(embed, referer, 'Auto')];
    if (/pichive\./i.test(embed)) return await exPichive(embed, referer);
    var list = [];
    if (/\/video\/[a-f0-9]{16,}|\/player\/index\.php|\/(?:v|e)\/[a-f0-9]{24,}/i.test(embed)) list = await exFirePlayer(embed, referer);
    if (!list.length) {
      var html = await getText(embed, { 'Referer': referer, 'Sec-Fetch-Dest': 'iframe' });
      if (/_p8\s*=/.test(html)) list = await exRapidVid(embed, referer, html);
      if (!list.length) {
        var subs = subsInScript(html, embed);
        list = filesInScript(html).map(function (f) { return streamRow(f, embed, qualityOf(f), subs); });
      }
    }
    return list;
  } catch (e) {
    return [];
  }
}

/** Akış satırlarını SkyStream StreamResult'a çevirir. */
function toResults(provider, rows, extraLabel) {
  return rows.map(function (r) {
    var label = [provider, extraLabel, r.label].filter(Boolean).join(' · ');
    return new StreamResult({ url: r.url, source: label, quality: r.quality, headers: r.headers, subtitles: r.subtitles });
  });
}

/** Sırayla çalıştırır (aynı anda çok istek QuickJS'te yavaş/kararsız). */
async function seqMap(items, fn) {
  var out = [];
  for (var i = 0; i < items.length; i++) {
    try { var r = await fn(items[i], i); if (r && r.length) out = out.concat(r); } catch (e) {}
  }
  return out;
}

/** domains.json'dan güncel alan adı. */
async function domainFor(key, fallback) {
  if (typeof manifest !== 'undefined' && manifest && manifest.baseUrl) return String(manifest.baseUrl).replace(/\/+$/, '');
  try {
    var d = await getJson('https://raw.githubusercontent.com/manitux-app/cs-plugins/main/domains.json');
    if (d && d[key]) return String(d[key]).replace(/\/+$/, '');
  } catch (e) {}
  return fallback;
}

/* SelcukFlix: Next.js (Dizilla altyapısı). Arama /kesfet?s=; bölümler JSON-LD;
 * bölüm sayfasında "player":{ sources:[{label, href(?player=…)}], enc:{ciphertext, iv, salt}, k }
 * enc = AES-256-CBC, anahtar PBKDF2-SHA512(k, salt(hex), 999 tur) → pichive iframe adresi. */
var DEFAULT_DOMAIN = 'https://selcukflix.app';

function sxCards(doc, base) {
  var out = [], seen = {};
  doc.querySelectorAll('a[href^="/dizi/"], a[href^="/film/"]').forEach(function (a) {
    var href = absUrl(base, a.getAttribute('href'));
    if (!/\/(dizi|film)\/[^/?#]+$/.test(href) || seen[href]) return;
    var aria = clean(a.getAttribute('aria-label'));
    var img = a.querySelector('img');
    var title = stripTitle(img && img.getAttribute('alt')) || (aria && !/^\d+\.\s*sırada/i.test(aria) ? aria.split(/,\s*/)[0] : '');
    if (!title) return;
    seen[href] = 1;
    out.push(new MultimediaItem({
      url: href, title: title, type: /\/film\//.test(href) ? 'movie' : 'series', year: yearOf(aria),
      posterUrl: img ? (img.getAttribute('data-src') || img.getAttribute('src')) : null
    }));
  });
  return out;
}

globalThis.getHome = async function () {
  var base = await domainFor('selcukflix', DEFAULT_DOMAIN);
  var items = sxCards(await parseHtml(await getText(base + '/')), base);
  return items.length ? { 'Öne Çıkanlar': items.slice(0, 40) } : {};
};

globalThis.search = async function (query) {
  var base = await domainFor('selcukflix', DEFAULT_DOMAIN);
  return sxCards(await parseHtml(await getText(base + '/kesfet?s=' + encodeURIComponent(query))), base);
};

globalThis.load = async function (url) {
  var html = await getText(url);
  var re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g, m, ld = null;
  while ((m = re.exec(html)) !== null) {
    try { var j = JSON.parse(m[1]); if (j && (j.containsSeason || j['@type'] === 'Movie' || j['@type'] === 'TVSeries')) { ld = j; if (j.containsSeason) break; } } catch (e) {}
  }
  ld = ld || {};
  var episodes = [];
  (ld.containsSeason || []).forEach(function (s) {
    (s.episode || []).forEach(function (e) {
      var sm = /\/sezon-(\d+)\/bolum-(\d+)/.exec(e.url || '');
      if (!sm) return;
      episodes.push(new Episode({
        url: e.url, season: parseInt(sm[1], 10), episode: Number(e.episodeNumber) || parseInt(sm[2], 10),
        name: clean(e.name) || (sm[2] + '. Bölüm'), description: clean(e.description)
      }));
    });
  });
  return new MultimediaItem({
    url: url, title: clean(ld.name) || 'SelcukFlix', type: /\/film\//.test(url) ? 'movie' : 'series',
    description: clean(ld.description), posterUrl: ld.image, episodes: episodes
  });
};

function decryptPlayer(t) {
  var em = /"enc":\{"ciphertext":"([^"]+)","iv":"([0-9a-f]+)","salt":"([0-9a-f]+)"\},"k":"([^"]+)"/.exec(t);
  if (!em) return null;
  try {
    var key = CryptoJS.PBKDF2(em[4], CryptoJS.enc.Hex.parse(em[3]), { keySize: 8, iterations: 999, hasher: CryptoJS.algo.SHA512 });
    var plain = CryptoJS.AES.decrypt({ ciphertext: CryptoJS.enc.Base64.parse(em[1]) }, key,
      { iv: CryptoJS.enc.Hex.parse(em[2]), mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).toString(CryptoJS.enc.Utf8);
    plain = String(plain || '').trim();
    if (plain.indexOf('//') === 0) plain = 'https:' + plain;
    return /^https?:\/\//.test(plain) ? plain : null;
  } catch (e) { return null; }
}

function unescRsc(html) { return String(html || '').replace(/\\"/g, '"').replace(/\\\//g, '/'); }

globalThis.loadStreams = async function (url) {
  var base = originOf(url);
  var t = unescRsc(await getText(url));
  var sources = [], seen = {};
  var block = first(/"sources":(\[[^\]]*\])/, t);
  try { (JSON.parse(block || '[]') || []).forEach(function (s) { if (s.href && !seen[s.href]) { seen[s.href] = 1; sources.push(s); } }); } catch (e) {}
  if (!sources.length) sources.push({ label: '', href: url.replace(base, '') });
  return seqMap(sources.slice(0, 6), async function (s, i) {
    var pageUrl = absUrl(base + '/', s.href);
    var pt = (i === 0 && s.on) || pageUrl === url ? t : unescRsc(await getText(pageUrl, { 'Referer': url }));
    var embed = decryptPlayer(pt);
    if (!embed) return [];
    var rows = await resolveEmbed(embed, pageUrl);
    rows.forEach(function (r) { r.label = ''; if (r.quality === 'Auto' && s.quality) r.quality = String(s.quality).toLowerCase(); });
    return toResults('SelcukFlix', rows, clean(s.label));
  });
};

})();
