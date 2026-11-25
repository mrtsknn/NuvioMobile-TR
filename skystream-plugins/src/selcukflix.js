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
