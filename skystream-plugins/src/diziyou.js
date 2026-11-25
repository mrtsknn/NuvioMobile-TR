/* DiziYou: WordPress. Bölüm sayfasında iframe#diziyouPlayer → /player/<id>.html;
 * akış storage.<alan>/episodes/<id>/play.m3u8 (altyazılı), <id>_tr (Türkçe dublaj), altyazılar subtitles/<id>/{tr,en}.vtt. */
var DEFAULT_DOMAIN = 'https://www.diziyou.one';

function seriesCards(doc) {
  var out = [], seen = {};
  doc.querySelectorAll('a[href]').forEach(function (a) {
    var href = a.getAttribute('href') || '';
    if (!/^https?:\/\/[^/]+\/[^/?#]+\/$/.test(href) || /-sezon-|-bolum|\/(category|page|tag|dizi-arsivi|iletisim|giris|kayit)/.test(href) || seen[href]) return;
    var img = a.querySelector('img');
    if (!img) return;
    var title = stripTitle(img.getAttribute('alt') || a.getAttribute('title') || a.textContent);
    if (!title || /^(dublaj|altyaz)/i.test(title)) return;
    seen[href] = 1;
    out.push(new MultimediaItem({ url: href, title: title, type: 'series', posterUrl: img.getAttribute('data-src') || img.getAttribute('src') }));
  });
  return out;
}

globalThis.getHome = async function () {
  var base = await domainFor('diziyou', DEFAULT_DOMAIN);
  var items = seriesCards(await parseHtml(await getText(base + '/')));
  return items.length ? { 'Popüler Diziler': items.slice(0, 40) } : {};
};

globalThis.search = async function (query) {
  var base = await domainFor('diziyou', DEFAULT_DOMAIN);
  var doc = await parseHtml(await getText(base + '/?s=' + encodeURIComponent(query)));
  var out = [], seen = {};
  doc.querySelectorAll('#list-series').forEach(function (el) {
    var a = el.querySelector('#categorytitle a') || el.querySelector('a');
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || seen[href]) return;
    seen[href] = 1;
    var img = el.querySelector('img');
    out.push(new MultimediaItem({ url: href, title: clean(a.textContent), type: 'series', posterUrl: img ? img.getAttribute('src') : null }));
  });
  return out;
};

globalThis.load = async function (url) {
  var html = await getText(url);
  var doc = await parseHtml(html);
  var h1 = doc.querySelector('h1');
  var img = doc.querySelector('#icerikcat img, .category_image img, img[src*="/posters/"]');
  var desc = doc.querySelector('.diziyou_desc, #icerikcatright p, .category_desc');
  var episodes = [], seen = {};
  doc.querySelectorAll('a[href*="-sezon-"][href*="-bolum"]').forEach(function (a) {
    var href = a.getAttribute('href');
    var m = /-(\d+)-sezon-(\d+)-bolum/.exec(href || '');
    if (!m || seen[href]) return;
    seen[href] = 1;
    var name = first(/\(([^)]+)\)/, a.textContent);
    episodes.push(new Episode({ url: href, season: parseInt(m[1], 10), episode: parseInt(m[2], 10), name: name ? clean(name) : (m[2] + '. Bölüm') }));
  });
  return new MultimediaItem({
    url: url, title: clean(h1 && h1.textContent) || 'DiziYou', type: 'series',
    description: clean(desc && desc.textContent), posterUrl: img ? img.getAttribute('src') : null, episodes: episodes
  });
};

globalThis.loadStreams = async function (url) {
  var html = await getText(url);
  var player = absUrl(url, first(/<iframe[^>]+id="diziyouPlayer"[^>]+src="([^"]+)"/, html) || first(/<iframe[^>]+src="([^"]*\/player\/\d+\.html[^"]*)"/, html));
  if (!player) return [];
  var ph = await getText(player, { 'Referer': url });
  var src = first(/<source[^>]+src="([^"]+\.m3u8[^"]*)"/, ph) || first(/["'](https?:\/\/[^"']+\/episodes\/[^"']+\.m3u8)["']/, ph);
  if (!src) return [];
  var subs = [];
  var re = /["'](https?:\/\/[^"']+\/subtitles\/[^"']+\/(\w+)\.vtt)["']/g, m;
  while ((m = re.exec(ph)) !== null) {
    if (subs.some(function (s) { return s.url === m[1]; })) continue;
    subs.push({ url: m[1], lang: m[2], label: m[2] === 'tr' ? 'Türkçe' : m[2] === 'en' ? 'İngilizce' : m[2] });
  }
  var out = [];
  var dub = src.replace(/\/episodes\/(\d+)\//, '/episodes/$1_tr/');
  if (dub !== src) {
    var probe = await http_get(dub, hdr({ 'Referer': originOf(url) + '/' }));
    if (Number(probe && probe.status) === 200 && /#EXTM3U/.test(String(probe.body || probe))) {
      out.push(streamRow(dub, originOf(url) + '/', '1080p', [], 'Türkçe Dublaj'));
    }
  }
  out.push(streamRow(src, originOf(url) + '/', '1080p', subs, 'Altyazılı'));
  return toResults('DiziYou', out);
};
