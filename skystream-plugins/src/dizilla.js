/* Dizilla: Next.js sitesi. Kartlar aria-label="Ad, Yıl, IMDb …"; bölümler JSON-LD (TVSeries.containsSeason);
 * bölüm sayfasında RSC verisinde "sources":[{langLabel, name, src: pichive iframe}] bulunur. */
var DEFAULT_DOMAIN = 'https://dizilla.la';

function cards(doc, base) {
  var out = [], seen = {};
  doc.querySelectorAll('a[href*="/dizi/"]').forEach(function (a) {
    var href = absUrl(base, a.getAttribute('href'));
    if (!href || seen[href] || /\/dizi-turu\//.test(href)) return;
    var aria = clean(a.getAttribute('aria-label'));
    var img = a.querySelector('img');
    var title = stripTitle(img && img.getAttribute('alt')) || (aria && !/^\d+\.\s*sırada/i.test(aria) ? aria.split(/,\s*/)[0] : '');
    if (!title) return;
    seen[href] = 1;
    out.push(new MultimediaItem({
      url: href, title: title, type: 'series', year: yearOf(aria),
      posterUrl: img ? (img.getAttribute('data-src') || img.getAttribute('src')) : null
    }));
  });
  return out;
}

globalThis.getHome = async function () {
  var base = await domainFor('dizilla', DEFAULT_DOMAIN);
  var doc = await parseHtml(await getText(base));
  var items = cards(doc, base);
  return items.length ? { 'Popüler Diziler': items.slice(0, 40) } : {};
};

globalThis.search = async function (query) {
  var base = await domainFor('dizilla', DEFAULT_DOMAIN);
  var doc = await parseHtml(await getText(base + '/ara?q=' + encodeURIComponent(query)));
  return cards(doc, base);
};

function ldSeries(html) {
  var re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g, m;
  while ((m = re.exec(html)) !== null) {
    try { var j = JSON.parse(m[1]); if (j && j.containsSeason) return j; } catch (e) {}
  }
  return null;
}

globalThis.load = async function (url) {
  var html = await getText(url);
  var ld = ldSeries(html) || {};
  var episodes = [];
  (ld.containsSeason || []).forEach(function (s) {
    (s.episode || []).forEach(function (e) {
      var sm = first(/-(\d+)-sezon-\d+-bolum/, e.url);
      episodes.push(new Episode({
        name: clean(e.name), description: clean(e.description), url: e.url,
        season: sm ? parseInt(sm, 10) : 1, episode: Number(e.episodeNumber) || parseInt(first(/-(\d+)-bolum/, e.url) || '0', 10)
      }));
    });
  });
  return new MultimediaItem({
    url: url, title: clean(ld.name) || clean(first(/<h1[^>]*>([\s\S]*?)<\/h1>/, html)).replace(/<[^>]+>/g, ''),
    type: 'series', description: clean(ld.description), posterUrl: ld.image, episodes: episodes
  });
};

globalThis.loadStreams = async function (url) {
  var html = await getText(url);
  var t = html.replace(/\\"/g, '"').replace(/\\\//g, '/');
  var re = /\{"key":"[^"]*","lang":"(\w+)","langLabel":"([^"]*)","n":\d+,"name":"([^"]*)","quality":"([^"]*)","src":"([^"]+)"/g, m;
  var players = [], seen = {};
  while ((m = re.exec(t)) !== null) {
    if (seen[m[5]]) { seen[m[5]].lang = 'Dublaj & Altyazı'; continue; }
    seen[m[5]] = { lang: m[2], name: m[3], quality: m[4], src: m[5] };
    players.push(seen[m[5]]);
  }
  if (!players.length) {
    var re2 = /https?:\/\/[a-z0-9.-]*pichive\.[a-z]+\/iframe\.php\?v=[a-f0-9]+/g;
    while ((m = re2.exec(t)) !== null) if (!seen[m[0]]) { seen[m[0]] = 1; players.push({ lang: '', name: '', quality: '', src: m[0] }); }
  }
  return seqMap(players, async function (p) {
    var rows = await resolveEmbed(p.src, url);
    rows.forEach(function (r) { if (r.quality === 'Auto' && p.quality) r.quality = p.quality.toLowerCase(); });
    return toResults('Dizilla', rows, [p.lang, p.name].filter(Boolean).join(' '));
  });
};
