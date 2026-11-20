// @provider {"id":"dizist", "name":"Dizist", "types":["tv"], "domain":"dizist.live", "version":"1.0.0", "description":"Dizist: Türkçe altyazılı/dublaj yabancı diziler (pichive HLS)."}
/*
 * MuratTv / NuvioTR Cloudstream dönüşümleri: ortak yardımcılar (her eklentinin başına eklenir).
 * Nuvio biçimi: module.exports = { getStreams(id, tür, sezon, bölüm) } → [{ name, title, url, quality, headers }].
 * Yalnızca fetch kullanılır (QuickJS: timer, Buffer, require yok); async/await yerine Promise zinciri.
 * Kaynak akışları BigBull CS (MIT, github.com/F0Rextasy/bigbullapp-cs) Kotlin eklentilerinden çevrildi.
 */
var UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function req(url, opts) {
  var o = opts || {};
  var headers = { "User-Agent": UA, "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8" };
  if (o.referer) headers.Referer = o.referer;
  if (o.headers) for (var k in o.headers) headers[k] = o.headers[k];
  return fetch(url, { method: o.method || "GET", headers: headers, body: o.body }).then(function (r) {
    if (!r.ok && !o.allowError) throw new Error("HTTP " + r.status + " " + url);
    return r.text();
  });
}

function reqJson(url, opts) {
  return req(url, opts).then(function (t) { return JSON.parse(t); });
}

function first(re, s) {
  var m = re.exec(String(s || ""));
  if (!m) return null;
  return m[1] === undefined ? m[0] : m[1];
}

function all(re, s) {
  var out = [], m, src = String(s || "");
  re.lastIndex = 0;
  while ((m = re.exec(src)) !== null) { out.push(m); if (m.index === re.lastIndex) re.lastIndex++; }
  return out;
}

function decode(s) {
  return String(s || "")
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(parseInt(d, 10)); })
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Bir JS dizgesi katmanını çözer: " → ", \/ → /, \\ → \ */
function jsUnescape(v) {
  return String(v || "").replace(/\\u([0-9a-fA-F]{4})|\\(.)/g, function (_, hex, c) {
    if (hex) return String.fromCharCode(parseInt(hex, 16));
    return c === "n" ? "\n" : c === "t" ? "\t" : c;
  });
}

function abs(base, href) {
  if (!href) return null;
  href = decode(String(href).trim());
  if (/^https?:/i.test(href)) return href;
  if (href.indexOf("//") === 0) return "https:" + href;
  var origin = /^(https?:\/\/[^/]+)/.exec(base);
  if (href.charAt(0) === "/") return origin ? origin[1] + href : href;
  return base.replace(/[^/]*$/, "") + href;
}

var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
/** base64 → metin (UTF-8). atob olmayan motorlar için. */
function b64decode(s) {
  s = String(s || "").replace(/[^A-Za-z0-9+/]/g, "");
  var bytes = [], buf = 0, bits = 0;
  for (var i = 0; i < s.length; i++) {
    buf = (buf << 6) | B64.indexOf(s.charAt(i));
    bits += 6;
    if (bits >= 8) { bits -= 8; bytes.push((buf >> bits) & 255); }
  }
  var out = "", j = 0;
  while (j < bytes.length) {
    var c = bytes[j++];
    if (c < 128) out += String.fromCharCode(c);
    else if (c < 224) out += String.fromCharCode(((c & 31) << 6) | (bytes[j++] & 63));
    else if (c < 240) out += String.fromCharCode(((c & 15) << 12) | ((bytes[j++] & 63) << 6) | (bytes[j++] & 63));
    else { j += 3; out += "?"; }
  }
  return out;
}

function norm(s) {
  return decode(s).toLowerCase()
    .replace(/[ıİ]/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g")
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[âàá]/g, "a").replace(/[éè]/g, "e")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(?:izle|film|filmi|dizi|dizisi|full|hd|1080p|720p|turkce|dublaj|altyazili|tum|bolumleri)\b/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ").trim()
    .replace(/^(?:the|a|an)\s+/, "");
}

/**
 * Arama sonuçlarından doğru yapımı seçer: başlıklardan biri birebir tutmalı; yıl biliniyorsa ±1 tutmalı.
 * items: [{ url, title, year? }]
 */
function pick(items, info) {
  var wants = [];
  for (var i = 0; i < info.titles.length; i++) { var w = norm(info.titles[i]); if (w && wants.indexOf(w) < 0) wants.push(w); }
  var loose = null;
  for (var j = 0; j < items.length; j++) {
    var it = items[j], have = norm(it.title);
    if (!have) continue;
    var yearOk = !info.year || !it.year || Math.abs(parseInt(it.year, 10) - info.year) <= 1;
    var exactYear = info.year && it.year && parseInt(it.year, 10) === info.year;
    for (var k = 0; k < wants.length; k++) {
      if (have === wants[k] && yearOk) return it;
      if (!loose && yearOk && it.year && have.indexOf(wants[k] + " ") === 0) loose = it;
      // "Matrix Resurrections" ↔ "Matrix 4 Resurrections": yıl birebir ve tüm kelimeler geçiyorsa
      if (!loose && exactYear && wants[k].split(" ").every(function (wd) { return (" " + have + " ").indexOf(" " + wd + " ") >= 0; })) loose = it;
    }
  }
  return loose;
}

var WD = "https://www.wikidata.org/w/api.php?format=json&origin=*";
function wdEntity(stmt) {
  var q = WD + "&action=query&list=search&srlimit=1&srsearch=" + encodeURIComponent("haswbstatement:" + stmt);
  var opts = { headers: { Accept: "application/json" } };
  // Wikidata ara ara boş/hatalı yanıt veriyor: bir kez daha denenir
  return reqJson(q, opts).then(function (j) {
    return (j && j.query && j.query.search && j.query.search.length) ? j : reqJson(q, opts);
  }, function () { return reqJson(q, opts); })
    .then(function (j) {
      var hits = (j && j.query && j.query.search) || [];
      if (!hits.length) return null;
      return reqJson(WD + "&action=wbgetentities&props=labels|aliases|claims&languages=tr|en&ids=" + hits[0].title, { headers: { Accept: "application/json" } });
    })
    .then(function (j) {
      var ents = (j && j.entities) || {};
      for (var k in ents) return ents[k];
      return null;
    })
    .catch(function () { return null; });
}

/**
 * Yapımın adları (Türkçe, İngilizce, Cinemeta) ve yılı. id: TMDB sayısı ya da IMDb "tt…".
 * Uygulama TMDB_API_KEY verirse TMDB'den, vermezse Wikidata'dan bulunur.
 */
function titlesFor(id, mediaType) {
  var raw = String(id || "").replace(/^tmdb:/, "");
  var tv = mediaType === "tv" || mediaType === "series";
  var info = { titles: [], year: null, imdb: /^tt\d+$/.test(raw) ? raw : null };
  function add(t) { t = String(t || "").replace(/\s*\([^)]*\)\s*$/, "").trim(); if (t && info.titles.indexOf(t) < 0) info.titles.push(t); }
  // Deneme kolaylığı: "q:Ad|Yıl" doğrudan başlıkla arar
  if (/^q:/.test(raw)) { var qp = raw.slice(2).split("|"); add(decodeURIComponent(qp[0])); info.year = qp[1] ? parseInt(qp[1], 10) : null; return Promise.resolve(info); }
  var key = typeof TMDB_API_KEY !== "undefined" ? TMDB_API_KEY : "";
  var tmdb = (/^\d+$/.test(raw) && key)
    ? reqJson("https://api.themoviedb.org/3/" + (tv ? "tv" : "movie") + "/" + raw + "?language=tr-TR&append_to_response=external_ids&api_key=" + encodeURIComponent(key))
        .then(function (j) {
          add(j.title || j.name); add(j.original_title || j.original_name);
          var d = j.release_date || j.first_air_date;
          if (d) info.year = parseInt(d.slice(0, 4), 10);
          if (j.external_ids && j.external_ids.imdb_id) info.imdb = j.external_ids.imdb_id;
        }).catch(function () {})
    : Promise.resolve();
  return tmdb.then(function () {
    var stmt = info.imdb ? "P345=" + info.imdb : (/^\d+$/.test(raw) ? (tv ? "P4983=" : "P4947=") + raw : null);
    return stmt ? wdEntity(stmt) : null;
  }).then(function (e) {
    if (e) {
      var l = e.labels || {}, a = e.aliases || {}, c = e.claims || {};
      if (l.tr) add(l.tr.value);
      if (l.en) add(l.en.value);
      for (var i = 0; i < (a.tr || []).length && i < 2; i++) add(a.tr[i].value);
      if (!info.imdb && c.P345 && c.P345[0]) info.imdb = c.P345[0].mainsnak.datavalue.value;
      if (!info.year && c.P577 && c.P577[0]) {
        var t = c.P577[0].mainsnak.datavalue && c.P577[0].mainsnak.datavalue.value.time;
        if (t) info.year = parseInt(t.slice(1, 5), 10);
      }
    }
    if (!info.imdb) return null;
    return reqJson("https://v3-cinemeta.strem.io/meta/" + (tv ? "series" : "movie") + "/" + info.imdb + ".json").catch(function () { return null; });
  }).then(function (j) {
    var m = j && j.meta;
    if (m) {
      add(m.name);
      if (!info.year) { var y = parseInt(String(m.releaseInfo || m.year || "").slice(0, 4), 10); if (y) info.year = y; }
    }
    return info;
  });
}

/** Nuvio yalnız progressive dosyayı indirir; HLS'yi işaretle ki sahte dosya inmesin. */
function hlsMark(url) {
  var u = String(url || "");
  if (/\.m3u8(\?|$)/i.test(u) || u.indexOf("#") !== -1) return u;
  return u + "#.m3u8";
}

/** Ortak çıktı satırı. lang: "dublaj" | "altyazi" | "" */
function row(provider, label, url, opts) {
  var o = opts || {};
  var tags = [];
  if (/dublaj|^tr$/i.test(o.lang || label || "")) tags.push("TR Dublaj");
  else if (/altyaz|^en$/i.test(o.lang || label || "")) tags.push("Altyazılı");
  var headers = { "User-Agent": UA };
  if (o.referer) headers.Referer = o.referer;
  if (o.origin) headers.Origin = o.origin;
  if (o.headers) for (var k in o.headers) headers[k] = o.headers[k];
  var q = o.quality || "auto";
  return {
    name: provider,
    title: provider + (label ? " - " + label : ""),
    url: o.hls ? hlsMark(url) : url,
    quality: tags.length ? q + " • " + tags.join(" • ") : q,
    headers: headers,
    subtitles: o.subtitles || []
  };
}

/** Promise listesini sırayla çalıştırır, hatalıları atlar. */
function seq(list, fn) {
  var out = [];
  var p = Promise.resolve();
  list.forEach(function (x, i) {
    p = p.then(function () { return fn(x, i); }).then(function (r) { if (r) out = out.concat(r); }, function () {});
  });
  return p.then(function () { return out; });
}

/** Birden çok başlıkla aramayı dener; ilk eşleşen yapımın adresini döner. */
function findByTitles(info, searchFn) {
  var tried = {};
  return info.titles.reduce(function (p, t) {
    return p.then(function (hit) {
      var q = String(t).replace(/^(?:the|a|an)\s+/i, "");
      if (hit || tried[norm(q)]) return hit;
      tried[norm(q)] = 1;
      return searchFn(q).then(function (items) { return pick(items || [], info); }, function () { return null; });
    });
  }, Promise.resolve(null));
}

/* ---------------------------------------------------------------- Oynatıcı çözücüleri
 * Her biri { file, subs, referer, headers? } ya da null döner. info: titlesFor çıktısı (ad denetimi için).
 */

/** JW Player setup(JSON.parse('…')) gömülü yapılandırma (hdload.top, vidload.top…). */
function exJwSetup(embed, referer) {
  return req(embed, { referer: referer }).then(function (e) {
    var cfg = first(/setup\(JSON\.parse\('([^']*)'\)/, e);
    if (!cfg) return null;
    var c = JSON.parse(jsUnescape(cfg));
    var file = c.file || (c.sources && c.sources[0] && c.sources[0].file);
    if (!file) return null;
    var subs = (c.tracks || []).filter(function (t) { return t.file && (!t.kind || t.kind === "captions"); }).map(function (t) {
      return { url: abs(embed, t.file), lang: "tr", label: t.label || "Türkçe" };
    });
    return { file: abs(embed, file), subs: subs, referer: embed };
  });
}

/** videoseyred: /embed/<id> → /playlist/<id>.json. Seri sayfaları diğer filmleri de verir: ad tutmalı. */
function exVideoseyred(embed, referer, info) {
  var id = first(/\/embed\/(\d+)/, embed);
  var origin = first(/^(https?:\/\/[^/]+)/, embed);
  if (!id) return Promise.resolve(null);
  return reqJson(origin + "/playlist/" + id + ".json", { referer: embed }).then(function (list) {
    var it = list && list[0];
    if (!it || !it.sources || !it.sources.length) return null;
    if (info && info.titles.length && it.title && !pick([{ title: it.title }], { titles: info.titles })) return null;
    var subs = (it.tracks || []).filter(function (t) { return t.kind === "captions" && t.file; }).map(function (t) {
      return { url: t.file, lang: /tur|t[uü]rk/i.test((t.language || "") + (t.label || "")) ? "tr" : (t.language || "tr"), label: t.label || "Türkçe" };
    });
    return { file: it.sources[0].file, subs: subs, referer: embed };
  });
}

/** vidmoly: sayfadaki sources: [{ file: '…m3u8' }]. */
function exVidmoly(embed, referer) {
  var url = embed.replace(/^\/\//, "https://");
  return req(url, { referer: referer, headers: { "Sec-Fetch-Dest": "iframe" } }).then(function (e) {
    var file = first(/sources\s*:\s*\[\s*\{\s*file\s*:\s*["']([^"']+)["']/, e) || first(/file\s*:\s*["'](https?:[^"']+\.m3u8[^"']*)["']/, e);
    if (!file) return null;
    var origin = first(/^(https?:\/\/[^/]+)/, url);
    return { file: file, subs: [], referer: origin + "/" };
  });
}

/** Bilinmeyen oynatıcı: sayfada geçen ilk m3u8/mp4. */
function exGeneric(embed, referer) {
  return req(embed, { referer: referer }).then(function (e) {
    var t = String(e).replace(/\\//g, "/");
    var file = first(/["'](https?:\/\/[^"'\s<>]+?\.(?:m3u8|mp4)(?:\?[^"'\s<>]*)?)["']/, t);
    return file ? { file: file, subs: [], referer: embed } : null;
  });
}

/** Oynatıcı adresine göre çözücü seçer. */
function extract(embed, referer, info) {
  var run = /videoseyred\./.test(embed) ? exVideoseyred(embed, referer, info)
    : /vidmoly\./.test(embed) ? exVidmoly(embed, referer)
    : /(?:hdload|vidload)\.top/.test(embed) ? exJwSetup(embed, referer)
    : exGeneric(embed, referer);
  return run.catch(function () { return null; });
}

/* ---------------------------------------------------------------- Laravel film/dizi altyapısı
 * FullHDFilm, HDFilmCehennemi2: /api/search?q= (meilisearch) ve sayfada
 * x-data="videoPlayerData(JSON.parse('…'))" → { dil: [{ template(base64 iframe), link, slug, quality, note, service_name }] }.
 */
function laravelSearch(base, wantSeries) {
  return function (q) {
    return reqJson(base + "/api/search?q=" + encodeURIComponent(q), { headers: { Accept: "application/json" } }).then(function (j) {
      return (j.data || []).filter(function (x) {
        return /Series/i.test(x.contentableType) === !!wantSeries;
      }).map(function (x) {
        return { url: base + "/" + String(x.slug || "").replace(/^\/+|\/+$/g, "") + "/", title: decode(x.title), year: x.releaseYear };
      });
    });
  };
}

function laravelPlayers(provider, base, pageUrl, info) {
  return req(pageUrl).then(function (html) {
    var payload = first(/x-data="videoPlayerData\(JSON\.parse\('([^']*)'\)/, html);
    if (!payload) return [];
    var videos = JSON.parse(jsUnescape(decode(payload)));
    var jobs = [];
    for (var lang in videos) (videos[lang] || []).forEach(function (it) { jobs.push({ lang: lang, it: it }); });
    return seq(jobs.slice(0, 10), function (job) {
      var markup = b64decode(job.it.template || "").replace(/\{slug\}/g, job.it.slug || "").replace(/\{url\}/g, job.it.link || "");
      var embed = abs(base, first(/(?:data-)?src="([^"]+)"/, markup));
      if (!embed) return [];
      return extract(embed, pageUrl, info).then(function (s) {
        if (!s) return [];
        var dual = job.lang === "dual" || /dual/i.test(job.it.note || "");
        var langTxt = dual ? "Dublaj & Altyazı" : job.lang === "tr" ? "Dublaj" : job.lang === "en" ? "Altyazı" : String(job.lang).toUpperCase();
        var label = [langTxt, job.it.service_name].filter(Boolean).join(" · ");
        return [row(provider, label, s.file, {
          referer: s.referer, hls: /\.m3u8|\/hls\/|\/list\//i.test(s.file), lang: job.lang === "en" ? "altyazi" : "dublaj",
          quality: job.it.quality || "auto", subtitles: s.subs,
        })];
      });
    });
  });
}

/** Addan site adresi parçası: "Kuruluş: Osman" → "kurulus-osman". */
function slugify(s) {
  return String(s || "").toLowerCase()
    .replace(/[ıİ]/g, "i").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ö/g, "o").replace(/ç/g, "c")
    .replace(/&/g, " and ").replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/* pichive oynatıcısı (RoketDizi, Dizist): NP_CONFIG + NP_GATE iş kanıtı imzası. CryptoJS gerekir. */
var CJ = typeof CryptoJS !== "undefined" ? CryptoJS : (typeof require === "function" ? require("crypto-js") : null);

/** Metindeki [marker]'dan sonraki ilk { … } JSON nesnesi (dizgeler içindeki ayraçlar sayılmaz). */
function jsonAfter(text, marker) {
  var at = text.indexOf(marker);
  if (at < 0) return null;
  var start = text.indexOf("{", at + marker.length);
  if (start < 0) return null;
  var depth = 0, inStr = false, esc = false;
  for (var i = start; i < text.length; i++) {
    var c = text.charAt(i);
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch (e) { return null; } } }
  }
  return null;
}

/** SHA-256 özetinin [idx]. 32 bitlik sözcüğü (işaretsiz). */
function shaWord(msg, idx) {
  var w = CJ.SHA256(msg).words[idx] || 0;
  return w >>> 0;
}

/** pichive NP_GATE iş kanıtı: koşulu sağlayan nonce bulunur (BigBull pichiveGateNonce çevirisi). */
function gateNonce(html) {
  var g = /"gate"\s*:\s*\{\s*"n"\s*:\s*"([^"]+)"(?:\s*,\s*"b"\s*:\s*(\d+))?/.exec(html);
  if (!g) return null;
  var n = g[1], bits = Math.min(22, Math.max(1, parseInt(g[2] || "12", 10)));
  var MAX = 2000000, i;
  var fn = /window\.NP_GATE\s*=\s*function\(\s*(\w+)\s*,\s*(\w+)\s*\)\s*\{([\s\S]*?)\};/.exec(html);
  if (!fn) {
    for (i = 0; i < MAX; i++) if ((shaWord(n + ":" + i, 0) >>> (32 - bits)) === 0) return String(i);
    return null;
  }
  var nVar = fn[1], body = fn[3];
  var cm = /var\s+(\w+)\s*=\s*String\.fromCharCode\(([\d,\s]+)\)/.exec(body);
  if (!cm) return null;
  var saltVar = cm[1];
  var salt = cm[2].split(",").map(function (x) { return String.fromCharCode(parseInt(x, 10)); }).join("");
  var nm = /var\s+(\w+)\s*=\s*(?:\w+\.toString\((\d*)\)|String\(\w+\))/.exec(body);
  if (!nm) return null;
  var nonceVar = nm[1], radix = Math.min(36, Math.max(2, parseInt(nm[2] || "10", 10) || 10));
  var im = /\(\s*\w+\(([^)]+)\)\[(\d+)\]\s*(>>>|&)\s*(\d+)\s*\)\s*===?\s*0/.exec(body);
  if (!im) return null;
  var parts = im[1].split("+").map(function (p) { return p.trim(); });
  var idx = parseInt(im[2], 10) || 0, op = im[3], rhs = parseInt(im[4], 10);
  for (i = 0; i < MAX; i++) {
    var nonce = i.toString(radix), msg = "";
    for (var k = 0; k < parts.length; k++) {
      var p = parts[k];
      msg += p === nVar ? n : p === saltVar ? salt : p === nonceVar ? nonce : p.replace(/^['"]|['"]$/g, "");
    }
    var w = shaWord(msg, idx);
    if (op === ">>>" ? (w >>> rhs) === 0 : ((w & rhs) >>> 0) === 0) return nonce;
  }
  return null;
}

function sign(html, url, nonce) {
  if (!/\/(nm|nsub)\.php/.test(url) || url.indexOf("&p=") >= 0 || !nonce) return url;
  return url + "&p=" + nonce;
}


/** pichive iframe.php → [{ label, url, subs }] (master imzalı). */
function pichive(player, referer) {
  return req(player, { referer: referer }).then(function (ph) {
    var cfg = jsonAfter(ph, "NP_CONFIG");
    if (!cfg) return [];
    var nonce = gateNonce(ph);
    var origin = first(/^(https?:\/\/[^/]+)/, player);
    var subs = (cfg.subtitles || []).map(function (t) {
      var raw = /^http/.test(t.url || "") ? t.url : t.tok ? origin + "/nsub.php?v=" + t.tok : null;
      return raw ? { url: sign(ph, raw, nonce), lang: /tr|t[uü]rk/i.test((t.lang || "") + (t.label || "")) ? "tr" : (t.lang || "tr"), label: t.label || "Altyazı" } : null;
    }).filter(Boolean);
    return (cfg.sources || []).filter(function (s) { return /^http/.test(s.master || ""); }).map(function (s) {
      return { label: String(s.title || "").trim(), url: sign(ph, s.master, nonce), subs: subs };
    });
  });
}

// @include pichive
var BASE = "https://dizist.live";

function getStreams(id, mediaType, season, episode) {
  if (!CJ || !(mediaType === "tv" || mediaType === "series") || !season || !episode) return Promise.resolve([]);
  var pageUrl;
  return titlesFor(id, mediaType).then(function (info) {
    var slugs = [];
    info.titles.forEach(function (t) { var s = slugify(t); if (s && slugs.indexOf(s) < 0) slugs.push(s); });
    // İlk açılan bölüm sayfası; sayfa başlığı dizinin adını taşımalı
    return slugs.reduce(function (p, slug) {
      return p.then(function (html) {
        if (html) return html;
        var url = BASE + "/izle/" + slug + "-" + season + "-sezon-" + episode + "-bolum";
        return req(url).then(function (h) {
          var title = decode(first(/<title>([^<]*)/, h) || "");
          if (!pick([{ title: title.replace(/\s+\d+\.\s*Sezon[\s\S]*$/i, "") }], info)) return null;
          pageUrl = url;
          return h;
        }, function () { return null; });
      });
    }, Promise.resolve(null));
  }).then(function (html) {
    if (!html) return [];
    var player = first(/<iframe[^>]+(?:data-src|data-lazy-src|src)="([^"]*iframe\.php[^"]*)"/, html);
    if (!player) return [];
    player = abs(BASE, player);
    return pichive(player, pageUrl).then(function (list) {
      return list.map(function (s) {
        return row("Dizist", s.label, s.url, { referer: player, hls: true, lang: /dublaj/i.test(s.label) ? "dublaj" : /altyaz|orijinal/i.test(s.label) ? "altyazi" : "", subtitles: s.subs });
      });
    });
  }).catch(function (e) { console.log("[dizist] " + (e && e.message)); return []; });
}

module.exports = { getStreams: getStreams };
