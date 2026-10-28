(function () {
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
    const res = await http_get(base, { 'User-Agent': 'Mozilla/5.0' });
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
        const title = titleEl.textContent.trim();
        let poster = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null;
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
    const res = await http_get(searchUrl, { 'User-Agent': 'Mozilla/5.0' });
    const doc = await parseHtml(res.body || res);
    const results = [];

    const elements = doc.querySelectorAll('li.film, div.film, .izle-titles li');
    for (const el of elements) {
      const linkEl = el.querySelector('a[href]');
      const titleEl = el.querySelector('.film-title, h2, h3, a');
      const imgEl = el.querySelector('img');

      if (linkEl && titleEl) {
        const href = linkEl.getAttribute('href');
        let poster = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null;
        if (poster && poster.startsWith('//')) poster = 'https:' + poster;

        results.push(new MultimediaItem({
          url: href.startsWith('http') ? href : base + href,
          title: titleEl.textContent.trim(),
          type: 'movie',
          posterUrl: poster
        }));
      }
    }
    return results;
  };

  globalThis.load = async function (url) {
    const base = await getBaseUrl();
    const targetUrl = url.startsWith('http') ? url : base + url;
    const res = await http_get(targetUrl, { 'User-Agent': 'Mozilla/5.0' });
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
    const res = await http_get(url, { 'User-Agent': 'Mozilla/5.0', 'Referer': url });
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

