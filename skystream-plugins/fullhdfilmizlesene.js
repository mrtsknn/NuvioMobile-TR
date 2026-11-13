(function () {
  // Posteri img, lazy-load data-* veya arka plan stilinden oku.
  function cardPoster(el) {
    const img = el.querySelector && el.querySelector('img');
    if (img) {
      const p = img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original') || img.getAttribute('src');
      if (p && !p.startsWith('data:')) return p;
    }
    const lazy = el.querySelector && el.querySelector('[data-src], [data-bg], [style*="background"]');
    if (lazy) {
      const d = lazy.getAttribute('data-src') || lazy.getAttribute('data-bg');
      if (d) return d;
      const m = /url\((['"]?)([^'")]+)\1\)/.exec(lazy.getAttribute('style') || '');
      if (m) return m[2];
    }
    return null;
  }

  // Arama sonucu sayılmayacak kategori linkleri (Filmler, Diziler...).
  function isCategoryLink(r) {
    return /^(filmler|diziler|film|dizi|tümü|tum|anime|belgesel)$/i.test(String(r.title || '').trim());
  }

  // Kart başlığını rozet/puan metinleri karışmadan oku: aria-label > img alt > başlık etiketi > title.
  function cardTitle(el, titleEl) {
    const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
    const strip = (s) => clean(s).replace(/\s+(full\s*hd\s*)?(izle|izleyin)$/i, '').trim();
    const aria = clean(el.getAttribute && el.getAttribute('aria-label'));
    if (aria) return strip(aria.split(/,\s*\d{4}\b/)[0]);
    const img = el.querySelector && el.querySelector('img');
    const alt = img ? strip(img.getAttribute('alt') || img.getAttribute('title')) : '';
    if (alt) return alt;
    if (titleEl && titleEl !== el) { const t = strip(titleEl.textContent); if (t) return t; }
    const attr = strip(el.getAttribute && el.getAttribute('title'));
    if (attr) return attr;
    return strip(el.textContent);
  }

  const DEFAULT_DOMAIN = 'https://www.fullhdfilmizlesene.now';

  async function getBaseUrl() {
    try {
      const res = await http_get('https://raw.githubusercontent.com/manitux-app/cs-plugins/main/domains.json', {});
      const domains = JSON.parse(res.body || res);
      return domains.fullhdfilmizlesene || (typeof manifest !== 'undefined' && manifest.baseUrl) || DEFAULT_DOMAIN;
    } catch (e) {
      return (typeof manifest !== 'undefined' && manifest.baseUrl) || DEFAULT_DOMAIN;
    }
  }

  globalThis.getHome = async function () {
    const base = await getBaseUrl();
    const res = await http_get(base, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
    const doc = await parseHtml(res.body || res);
    const categories = {};
    const items = [];

    const elements = doc.querySelectorAll('li.film, div.film, .izle-titles li');
    for (const el of elements) {
      const linkEl = el.querySelector('a[href]');
      const titleEl = el.querySelector('.film-title, h2, h3, a');
      const imgEl = el.querySelector('img');

      if (linkEl && titleEl) {
        const href = linkEl.getAttribute('href');
        const title = cardTitle(el, titleEl);
        let poster = cardPoster(el);
        if (poster && poster.startsWith('//')) poster = 'https:' + poster;

        items.push(new MultimediaItem({
          url: href.startsWith('http') ? href : base + href,
          title: title,
          type: 'movie',
          posterUrl: poster
        }));
      }
    }

    if (items.length > 0) {
      categories['Son Filmler'] = items;
    }
    return categories;
  };

  globalThis.search = async function (query, page) {
    const base = await getBaseUrl();
    const searchUrl = `${base}/arama/${encodeURIComponent(query)}`;
    const res = await http_get(searchUrl, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
    const doc = await parseHtml(res.body || res);
    const results = [];

    const elements = doc.querySelectorAll('li.film, div.film, .izle-titles li');
    for (const el of elements) {
      const linkEl = el.querySelector('a[href]');
      const titleEl = el.querySelector('.film-title, h2, h3, a');
      const imgEl = el.querySelector('img');

      if (linkEl && titleEl) {
        const href = linkEl.getAttribute('href');
        let poster = cardPoster(el);
        if (poster && poster.startsWith('//')) poster = 'https:' + poster;

        results.push(new MultimediaItem({
          url: href.startsWith('http') ? href : base + href,
          title: cardTitle(el, titleEl),
          type: 'movie',
          posterUrl: poster
        }));
      }
    }
    return results.filter((r) => !isCategoryLink(r));
  };

  globalThis.load = async function (url) {
    const base = await getBaseUrl();
    const targetUrl = url.startsWith('http') ? url : base + url;
    const res = await http_get(targetUrl, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
    const doc = await parseHtml(res.body || res);

    const titleEl = doc.querySelector('.izle-titles h1, h1, .film-title');
    const descEl = doc.querySelector('.film-info, .dd, .ozet, p');
    const imgEl = doc.querySelector('.film-info img, .izle img, meta[property="og:image"]');
    let poster = null;
    if (imgEl) {
      poster = imgEl.getAttribute('content') || imgEl.getAttribute('data-src') || imgEl.getAttribute('src');
      if (poster && poster.startsWith('//')) poster = 'https:' + poster;
    }

    return new MultimediaItem({
      url: targetUrl,
      title: titleEl ? titleEl.textContent.trim() : 'Film',
      type: 'movie',
      description: descEl ? descEl.textContent.trim() : '',
      posterUrl: poster
    });
  };

  globalThis.loadStreams = async function (url) {
    const res = await http_get(url, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Referer': url });
    const doc = await parseHtml(res.body || res);
    const streams = [];

    const iframes = doc.querySelectorAll('iframe[src], iframe[data-src]');
    for (const iframe of iframes) {
      let src = iframe.getAttribute('src') || iframe.getAttribute('data-src');
      if (src && !src.includes('youtube.com')) {
        if (src.startsWith('//')) src = 'https:' + src;
        streams.push(new StreamResult({
          url: src,
          source: 'FullHDFilmizlesene Player',
          quality: '1080p',
          headers: { 'Referer': url }
        }));
      }
    }
    return streams;
  };
})();

