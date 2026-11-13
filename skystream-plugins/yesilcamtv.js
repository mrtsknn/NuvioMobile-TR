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

  const DEFAULT_DOMAIN = 'https://yesilcamtv.com.tr';

  async function getBaseUrl() {
    try {
      const res = await http_get('https://raw.githubusercontent.com/manitux-app/cs-plugins/main/domains.json', {});
      const domains = JSON.parse(res.body || res);
      return domains.yesilcamtv || (typeof manifest !== 'undefined' && manifest.baseUrl) || DEFAULT_DOMAIN;
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

    const elements = doc.querySelectorAll('.gallery-item, div.film, div[class*="post"]');
    for (const el of elements) {
      const linkEl = el.querySelector('.film-ismi a[href], a[href]');
      const titleEl = el.querySelector('.film-ismi, h2, h3, a') || el;
      const imgEl = el.querySelector('.film-afis img, img');
      const yearEl = el.querySelector('.film-yil');

      if (linkEl && titleEl) {
        const href = linkEl.getAttribute('href');
        const title = cardTitle(el, titleEl);
        const poster = cardPoster(el);
        const year = yearEl ? parseInt(yearEl.textContent.trim(), 10) : undefined;

        if (title && href && !items.some(i => i.url === href)) {
          items.push(new MultimediaItem({
            url: href.startsWith('http') ? href : base + href,
            title: title,
            type: 'movie',
            posterUrl: poster,
            year: year
          }));
        }
      }
    }

    if (items.length > 0) {
      categories['Yeşilçam Klasikleri'] = items;
    }
    return categories;
  };

  globalThis.search = async function (query, page) {
    const base = await getBaseUrl();
    const searchUrl = `${base}/?s=${encodeURIComponent(query)}`;
    const res = await http_get(searchUrl, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
    const doc = await parseHtml(res.body || res);
    const results = [];

    const elements = doc.querySelectorAll('.gallery-item, div.film, div[class*="post"]');
    for (const el of elements) {
      const linkEl = el.querySelector('.film-ismi a[href], a[href]');
      const titleEl = el.querySelector('.film-ismi, h2, h3, a') || el;
      const imgEl = el.querySelector('.film-afis img, img');
      const yearEl = el.querySelector('.film-yil');

      if (linkEl && titleEl) {
        const href = linkEl.getAttribute('href');
        const title = cardTitle(el, titleEl);
        const poster = cardPoster(el);
        const year = yearEl ? parseInt(yearEl.textContent.trim(), 10) : undefined;

        if (title && href && !results.some(r => r.url === href)) {
          results.push(new MultimediaItem({
            url: href.startsWith('http') ? href : base + href,
            title: title,
            type: 'movie',
            posterUrl: poster,
            year: year
          }));
        }
      }
    }
    return results.filter((r) => !isCategoryLink(r));
  };

  globalThis.load = async function (url) {
    const base = await getBaseUrl();
    const targetUrl = url.startsWith('http') ? url : base + url;
    const res = await http_get(targetUrl, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' });
    const doc = await parseHtml(res.body || res);

    const titleEl = doc.querySelector('h1, .film-ismi');
    const descEl = doc.querySelector('#film-aciklama, .aciklama, p');
    const imgEl = doc.querySelector('.film-afis img, .poster img, img');
    const poster = cardPoster(el);

    return new MultimediaItem({
      url: targetUrl,
      title: titleEl ? titleEl.textContent.trim() : 'Yeşilçam Film',
      type: 'movie',
      description: descEl ? descEl.textContent.trim() : '',
      posterUrl: poster
    });
  };

  globalThis.loadStreams = async function (url) {
    const res = await http_get(url, { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36', 'Referer': url });
    const text = String(res.body || res);
    const doc = await parseHtml(text);
    const streams = [];

    // Rumble embed ayıklama
    const rumbleMatch = text.match(/https?:\/\/rumble\.com\/embedJS\/[^\s"'<>\\]+/i) || text.match(/https?:\/\/rumble\.com\/embed\/[^\s"'<>\\]+/i);
    if (rumbleMatch) {
      streams.push(new StreamResult({
        url: rumbleMatch[0],
        source: 'Rumble Video',
        quality: '1080p',
        headers: { 'Referer': url }
      }));
    }

    const iframes = doc.querySelectorAll('iframe[src], iframe[data-src]');
    for (const iframe of iframes) {
      let src = iframe.getAttribute('src') || iframe.getAttribute('data-src');
      if (src && !src.includes('youtube.com')) {
        if (src.startsWith('//')) src = 'https:' + src;
        streams.push(new StreamResult({
          url: src,
          source: 'Yeşilçam Player',
          quality: '1080p',
          headers: { 'Referer': url }
        }));
      }
    }

    return streams;
  };
})();

