/* SetFilm: WordPress. Arama admin-ajax stf_live_search (JSON). Oynatıcı: admin-ajax get_video_url
 * (nonce: STF_AJAX.nonces.video, post_id, player_name, part_key) → setplay köprüsü (SPG.cerceve XOR)
 * → fastplay stfplay.php → STF_KOPRU.src (/manifests/<id>/master.txt, Referer fastplay kökü). */
var DEFAULT_DOMAIN = 'https://www.setfilmizle.ltd';

function itemFromUrl(url, title, poster, year) {
  return new MultimediaItem({ url: url, title: title, type: /\/dizi\//.test(url) ? 'series' : 'movie', posterUrl: poster, year: year });
}

globalThis.getHome = async function () {
  var base = await domainFor('setfilm', DEFAULT_DOMAIN);
  var doc = await parseHtml(await getText(base + '/'));
  var films = [], series = [], seen = {};
  doc.querySelectorAll('a[href*="/film/"], a[href*="/dizi/"]').forEach(function (a) {
    var href = absUrl(base, a.getAttribute('href'));
    if (!/\/(film|dizi)\/[^/]+\/?$/.test(href) || seen[href]) return;
    var img = a.querySelector('img');
    if (!img) return;
    var title = stripTitle(img.getAttribute('alt') || a.getAttribute('title'));
    if (!title) return;
    seen[href] = 1;
    var it = itemFromUrl(href, title, img.getAttribute('data-src') || img.getAttribute('src'));
    (it.type === 'series' ? series : films).push(it);
  });
  var out = {};
  if (films.length) out['Filmler'] = films.slice(0, 40);
  if (series.length) out['Diziler'] = series.slice(0, 40);
  return out;
};

globalThis.search = async function (query) {
  var base = await domainFor('setfilm', DEFAULT_DOMAIN);
  var j = await getJson(base + '/wp-admin/admin-ajax.php?action=stf_live_search&keyword=' + encodeURIComponent(query), { 'X-Requested-With': 'XMLHttpRequest' });
  var out = [];
  if (j && typeof j === 'object') {
    Object.keys(j).forEach(function (k) {
      var it = j[k];
      if (!it || !it.url || !it.title) return;
      var year = it.extra && it.extra.date ? parseInt(it.extra.date, 10) : undefined;
      out.push(itemFromUrl(it.url, clean(it.title), String(it.img || '').replace(/-\d+x\d+(\.\w+)$/, '$1'), year));
    });
  }
  return out;
};

globalThis.load = async function (url) {
  var html = await getText(url);
  var doc = await parseHtml(html);
  var h1 = doc.querySelector('h1');
  var og = doc.querySelector('meta[property="og:image"]');
  var desc = doc.querySelector('meta[name="description"]');
  var title = h1 ? h1.textContent : '';
  var item = new MultimediaItem({
    url: url, title: stripTitle(title) || 'SetFilm', year: yearOf(title),
    type: /\/dizi\//.test(url) ? 'series' : 'movie',
    description: clean(desc && desc.getAttribute('content')), posterUrl: og ? og.getAttribute('content') : null
  });
  if (item.type === 'series') {
    var eps = [], seen = {};
    doc.querySelectorAll('a[href*="/bolum/"]').forEach(function (a) {
      var href = a.getAttribute('href');
      var m = /-(\d+)-sezon-(\d+)-bolum/.exec(href || '');
      if (!m || seen[href]) return;
      seen[href] = 1;
      eps.push(new Episode({ url: href, season: parseInt(m[1], 10), episode: parseInt(m[2], 10), name: m[2] + '. Bölüm' }));
    });
    item.episodes = eps;
  }
  return item;
};

function spgFrame(html) {
  var m = /SPG\.cerceve\("\w+"\s*,\s*"([^"]+)"\s*,\s*"([^"]+)"\)/.exec(html);
  if (!m) return null;
  var a = b64bytes(m[1].replace(/\\\//g, '/')), k = b64bytes(m[2]), s = '';
  for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i] ^ k[i % k.length]);
  var u = s.split('|')[0];
  return /^https?:\/\//.test(u) ? u : null;
}

function b64bytes(s) {
  s = String(s || '').replace(/[^A-Za-z0-9+/]/g, '');
  var out = [], buf = 0, bits = 0;
  for (var i = 0; i < s.length; i++) {
    buf = (buf << 6) | B64.indexOf(s.charAt(i)); bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
  }
  return out;
}

async function resolveSetPlay(bridge, referer) {
  var bh = await getText(bridge, { 'Referer': referer, 'Sec-Fetch-Dest': 'iframe' });
  var inner = spgFrame(bh);
  if (!inner) return [];
  var ih = await getText(inner, { 'Referer': originOf(bridge) + '/', 'Sec-Fetch-Dest': 'iframe' });
  var src = first(/src\s*:\s*"([^"]+master[^"]*)"/, ih) || first(/src\s*:\s*"(\/manifests\/[^"]+)"/, ih);
  if (!src) return [];
  var origin = originOf(inner);
  var subs = [];
  var sm = /subtitles\s*:\s*(\[[\s\S]*?\])\s*,\s*\n/.exec(ih);
  if (sm) {
    try {
      JSON.parse(sm[1]).forEach(function (t) {
        if (t.file && t.kind !== 'thumbnails' && !t.forced) subs.push({ url: t.file, lang: /tur/i.test(t.lang) ? 'tr' : 'en', label: t.label || t.lang });
      });
    } catch (e) {}
  }
  var row = streamRow(absUrl(origin + '/', src), origin + '/', '1080p', subs);
  // fastplay tarayıcı UA'larında X-Sp imzası bekliyor; kısa UA ile imzasız açılıyor.
  row.headers = { 'Referer': origin + '/', 'User-Agent': 'Mozilla/5.0' };
  return [row];
}

globalThis.loadStreams = async function (url) {
  var base = originOf(url);
  var html = await getText(url);
  var nonce = first(/nonces\s*:\s*\{\s*video\s*:\s*"([^"]+)"/, html);
  var postId = first(/data-post-id="(\d+)"/, html);
  if (!nonce || !postId) return [];
  var players = [], re = /data-player-name="([^"]+)"\s+data-part-key="([^"]*)"/g, m;
  while ((m = re.exec(html)) !== null) players.push({ name: m[1], part: m[2] });
  if (!players.length) players.push({ name: 'SetPlay', part: '' });
  return seqMap(players, async function (p) {
    var body = 'action=get_video_url&nonce=' + nonce + '&post_id=' + postId + '&player_name=' + encodeURIComponent(p.name) + '&part_key=' + encodeURIComponent(p.part);
    var txt = await postText(base + '/wp-admin/admin-ajax.php', body, {
      'X-Requested-With': 'XMLHttpRequest', 'Referer': url, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
    });
    var j; try { j = JSON.parse(txt); } catch (e) { return []; }
    var st = j && j.data && j.data.stream;
    if (!st || !st.url) return [];
    var rows = /stfplay|setplay/.test(st.url) ? await resolveSetPlay(st.url, url) : await resolveEmbed(st.url, url);
    var lang = /dublaj/i.test(p.part) ? 'Türkçe Dublaj' : /altyazi/i.test(p.part) ? 'Türkçe Altyazı' : '';
    return toResults('SetFilm', rows, [lang, p.name].filter(Boolean).join(' · '));
  });
};
