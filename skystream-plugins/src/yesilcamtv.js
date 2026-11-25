/* YesilcamTV: WordPress (filmplus teması). Arama wp-json/wp/v2/search; film sayfasında iframe (vidmoly vb.). */
var DEFAULT_DOMAIN = 'https://yesilcamtv.com.tr';

globalThis.getHome = async function () {
  var base = await domainFor('yesilcamtv', DEFAULT_DOMAIN);
  var doc = await parseHtml(await getText(base + '/'));
  var out = [], seen = {};
  doc.querySelectorAll('a[href]').forEach(function (a) {
    var href = a.getAttribute('href') || '';
    if (href.indexOf(base) !== 0 || !/-izle(-\d+)?\/$/.test(href) || seen[href]) return;
    var img = a.querySelector('img');
    if (!img) return;
    var title = stripTitle(img.getAttribute('alt'));
    if (!title) return;
    seen[href] = 1;
    out.push(new MultimediaItem({ url: href, title: title, type: 'movie', posterUrl: img.getAttribute('data-src') || img.getAttribute('src') }));
  });
  return out.length ? { 'Yeşilçam Klasikleri': out.slice(0, 40) } : {};
};

globalThis.search = async function (query) {
  var base = await domainFor('yesilcamtv', DEFAULT_DOMAIN);
  var j = await getJson(base + '/wp-json/wp/v2/search?per_page=20&subtype=post&search=' + encodeURIComponent(query));
  return (Array.isArray(j) ? j : []).filter(function (x) { return x && x.url && x.title; }).map(function (x) {
    return new MultimediaItem({ url: x.url, title: stripTitle(x.title), type: 'movie' });
  });
};

globalThis.load = async function (url) {
  var doc = await parseHtml(await getText(url));
  var h1 = doc.querySelector('h1');
  var og = doc.querySelector('meta[property="og:image"]');
  var desc = doc.querySelector('meta[property="og:description"], meta[name="description"], .entry-content p');
  var tags = doc.querySelectorAll('a[rel="tag"]').map(function (a) { return clean(a.textContent); });
  return new MultimediaItem({
    url: url, title: stripTitle(h1 && h1.textContent) || 'YesilcamTV', type: 'movie', tags: tags,
    description: clean(desc && (desc.getAttribute('content') || desc.textContent)), posterUrl: og ? og.getAttribute('content') : null
  });
};

globalThis.loadStreams = async function (url) {
  var html = await getText(url);
  var frames = [], re = /<iframe[^>]+(?:data-src|src)="([^"]+)"/g, m;
  while ((m = re.exec(html)) !== null) {
    var src = absUrl(url, m[1]);
    if (src && !/youtube|facebook|google|disqus/.test(src) && frames.indexOf(src) < 0) frames.push(src);
  }
  return seqMap(frames.slice(0, 5), async function (src) {
    var host = (first(/^https?:\/\/(?:www\.)?([^./]+)/, src) || '');
    return toResults('YesilcamTV', await resolveEmbed(src, url), host.charAt(0).toUpperCase() + host.slice(1));
  });
};
