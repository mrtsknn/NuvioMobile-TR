/* WebDramaTurkey: bölüm sayfasında .nav-player-select button[data-embed=ID] (WDT, VK, Moly, …);
 * POST /ajax/embed id=ID → <iframe src=/video.php?hash=…> → iç iframe (dtpasn FirePlayer vb.). */
var DEFAULT_DOMAIN = 'https://webdramaturkey2.com';

function wdtCards(doc, base) {
  var out = [], seen = {};
  doc.querySelectorAll('.list-movie, div[class*="movie-item"], div.item').forEach(function (el) {
    var a = el.querySelector('a[href]');
    if (!a) return;
    var href = absUrl(base, a.getAttribute('href'));
    if (!href || seen[href] || !/\/(dizi|film)\//.test(href) || /-bolum/.test(href)) return;
    var t = el.querySelector('.list-title, h2, h3, .title');
    var img = el.querySelector('img');
    var title = clean((t && t.textContent) || (img && img.getAttribute('alt')) || a.getAttribute('title'));
    if (!title) return;
    seen[href] = 1;
    out.push(new MultimediaItem({
      url: href, title: title, type: /\/film\//.test(href) ? 'movie' : 'series',
      posterUrl: img ? (img.getAttribute('data-src') || img.getAttribute('src')) : null
    }));
  });
  return out;
}

globalThis.getHome = async function () {
  var base = await domainFor('webdramaturkey', DEFAULT_DOMAIN);
  var items = wdtCards(await parseHtml(await getText(base)), base);
  return items.length ? { 'Asya ve Web Dizileri': items.slice(0, 60) } : {};
};

globalThis.search = async function (query) {
  var base = await domainFor('webdramaturkey', DEFAULT_DOMAIN);
  return wdtCards(await parseHtml(await getText(base + '/arama/' + encodeURIComponent(query))), base);
};

globalThis.load = async function (url) {
  var doc = await parseHtml(await getText(url));
  var h1 = doc.querySelector('h1');
  var og = doc.querySelector('meta[property="og:image"]');
  var desc = doc.querySelector('meta[name="description"]');
  var isMovie = /\/film\//.test(url);
  var episodes = [], seen = {};
  if (!isMovie) {
    doc.querySelectorAll('a[href*="-sezon/"][href*="-bolum"]').forEach(function (a) {
      var href = absUrl(url, a.getAttribute('href'));
      var m = /\/(\d+)-sezon\/(\d+)-bolum/.exec(href || '');
      if (!m || seen[href]) return;
      seen[href] = 1;
      episodes.push(new Episode({ url: href, season: parseInt(m[1], 10), episode: parseInt(m[2], 10), name: m[2] + '. Bölüm' }));
    });
  }
  return new MultimediaItem({
    url: url, title: clean(h1 && h1.textContent) || 'WebDramaTurkey', type: isMovie ? 'movie' : 'series',
    description: clean(desc && desc.getAttribute('content')), posterUrl: og ? og.getAttribute('content') : null,
    episodes: episodes
  });
};

globalThis.loadStreams = async function (url) {
  var base = originOf(url);
  var html = await getText(url);
  var players = [], seen = {};
  var re = /<button[^>]*data-embed="(\d+)"[^>]*>\s*<span class="name">([^<]*)<\/span>/g, m;
  while ((m = re.exec(html)) !== null) {
    if (seen[m[1]]) continue;
    seen[m[1]] = 1;
    players.push({ id: m[1], name: clean(m[2]) });
  }
  if (!players.length) {
    var one = first(/data-embed="(\d+)"/, html);
    if (one) players.push({ id: one, name: 'WDT' });
  }
  // Reklamsız / çözülebilir kaynaklar önce
  players.sort(function (a, b) { return (/WDT/.test(b.name) ? 1 : 0) - (/WDT/.test(a.name) ? 1 : 0); });
  return seqMap(players.slice(0, 6), async function (p) {
    var frag = await postText(base + '/ajax/embed', 'id=' + p.id, {
      'X-Requested-With': 'XMLHttpRequest', 'Referer': url, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    });
    var src = absUrl(url, first(/<iframe[^>]+src="([^"]+)"/, frag));
    if (!src) return [];
    var rows = [];
    if (/\/video\.php\?/.test(src)) {
      var vh = await getText(src, { 'Referer': url, 'Sec-Fetch-Dest': 'iframe' });
      var inner = absUrl(src, first(/<iframe[^>]+id="main-iframe"[^>]+src="([^"]+)"/, vh) || first(/<iframe[^>]+src="([^"]+)"/, vh));
      if (inner) rows = await resolveEmbed(inner, base + '/');
      if (!rows.length) {
        var files = filesInScript(vh);
        rows = files.map(function (f) { return streamRow(f, src, qualityOf(f)); });
      }
    } else {
      rows = await resolveEmbed(src, url);
    }
    return toResults('WebDramaTurkey', rows, p.name.replace(/\s*\((Aşırı )?Reklamlı\)/i, ''));
  });
};
