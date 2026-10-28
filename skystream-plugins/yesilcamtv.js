(function () {
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
    const res = await http_get(base, { 'User-Agent': 'Mozilla/5.0' });
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
        const title = titleEl.textContent.trim();
        const poster = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null;
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
    const res = await http_get(searchUrl, { 'User-Agent': 'Mozilla/5.0' });
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
        const title = titleEl.textContent.trim();
        const poster = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null;
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
    return results;
  };

  globalThis.load = async function (url) {
    const base = await getBaseUrl();
    const targetUrl = url.startsWith('http') ? url : base + url;
    const res = await http_get(targetUrl, { 'User-Agent': 'Mozilla/5.0' });
    const doc = await parseHtml(res.body || res);

    const titleEl = doc.querySelector('h1, .film-ismi');
    const descEl = doc.querySelector('#film-aciklama, .aciklama, p');
    const imgEl = doc.querySelector('.film-afis img, .poster img, img');
    const poster = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null;

    return new MultimediaItem({
      url: targetUrl,
      title: titleEl ? titleEl.textContent.trim() : 'Yeşilçam Film',
      type: 'movie',
      description: descEl ? descEl.textContent.trim() : '',
      posterUrl: poster
    });
  };

  globalThis.loadStreams = async function (url) {
    const res = await http_get(url, { 'User-Agent': 'Mozilla/5.0', 'Referer': url });
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

