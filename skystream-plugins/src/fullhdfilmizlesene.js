/* FullHDFilmizlesene: kartlar li.film (span.film-title, span.kt orijinal ad, span.film-yil).
 * Film sayfasında scx = { anahtar: { tt: base64 ad, sx: { t: [ROT13+base64 oynatıcı adresi] } } }. */
var DEFAULT_DOMAIN = 'https://www.fullhdfilmizlesene.now';

function filmCards(doc, base) {
  var out = [], seen = {};
  doc.querySelectorAll('li.film').forEach(function (li) {
    var a = li.querySelector('a[href*="/film/"]');
    if (!a) return;
    var href = absUrl(base, a.getAttribute('href'));
    if (seen[href]) return;
    seen[href] = 1;
    var t = li.querySelector('.film-title'), y = li.querySelector('.film-yil'), img = li.querySelector('img');
    var title = clean(t && t.textContent) || stripTitle(a.textContent).split(' - ')[0];
    out.push(new MultimediaItem({
      url: href, title: title, type: 'movie',
      year: y ? parseInt(clean(y.textContent), 10) || undefined : undefined,
      posterUrl: img ? (img.getAttribute('data-src') || img.getAttribute('src')) : null
    }));
  });
  return out;
}

globalThis.getHome = async function () {
  var base = await domainFor('fullhdfilmizlesene', DEFAULT_DOMAIN);
  var items = filmCards(await parseHtml(await getText(base + '/')), base);
  return items.length ? { 'Son Eklenen Filmler': items.slice(0, 40) } : {};
};

globalThis.search = async function (query) {
  var base = await domainFor('fullhdfilmizlesene', DEFAULT_DOMAIN);
  var doc = await parseHtml(await getText(base + '/arama/' + encodeURIComponent(query)));
  var items = filmCards(doc, base);
  // Orijinal adla da eşleşebilsin: span.kt ayrı kayıt olarak eklenir
  doc.querySelectorAll('li.film').forEach(function (li) {
    var kt = li.querySelector('.kt'), a = li.querySelector('a[href*="/film/"]');
    var y = li.querySelector('.film-yil');
    if (kt && a && clean(kt.textContent)) {
      items.push(new MultimediaItem({
        url: absUrl(base, a.getAttribute('href')), title: clean(kt.textContent), type: 'movie',
        year: y ? parseInt(clean(y.textContent), 10) || undefined : undefined
      }));
    }
  });
  return items;
};

globalThis.load = async function (url) {
  var doc = await parseHtml(await getText(url));
  var h1 = doc.querySelector('h1');
  var og = doc.querySelector('meta[property="og:image"]');
  var desc = doc.querySelector('meta[name="description"]');
  var title = clean(h1 && h1.textContent);
  return new MultimediaItem({
    url: url, title: stripTitle(title.split(' - ')[0]) || 'FullHDFilmizlesene', type: 'movie', year: yearOf(title),
    description: clean(desc && desc.getAttribute('content')), posterUrl: og ? og.getAttribute('content') : null
  });
};

function rot13(s) {
  return String(s || '').replace(/[a-zA-Z]/g, function (c) {
    var b = c <= 'Z' ? 65 : 97;
    return String.fromCharCode((c.charCodeAt(0) - b + 13) % 26 + b);
  });
}

globalThis.loadStreams = async function (url) {
  var html = await getText(url);
  var scx = jsonAfter(html, 'scx =') || jsonAfter(html, 'scx=');
  if (!scx) return [];
  var players = [];
  Object.keys(scx).forEach(function (k) {
    var e = scx[k] || {}, sx = e.sx || {};
    var name = e.tt ? b64decode(e.tt) : k;
    var list = [].concat(sx.t || []);
    (sx.p || []).forEach(function (p) {
      if (typeof p === 'string') list.push(p);
      else if (p && typeof p === 'object') Object.keys(p).forEach(function (kk) { if (typeof p[kk] === 'string') list.push(p[kk]); });
    });
    list.forEach(function (enc) {
      var link = b64decode(rot13(enc));
      if (/^https?:\/\//.test(link)) players.push({ name: name, url: link, order: e.order || 99 });
    });
  });
  players.sort(function (a, b) { return a.order - b.order; });
  return seqMap(players.slice(0, 8), async function (p) {
    return toResults('FullHDFilmizlesene', await resolveEmbed(p.url, url), p.name);
  });
};
