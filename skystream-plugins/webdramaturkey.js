(function () {
  const DEFAULT_DOMAIN = 'https://webdramaturkey2.com';

  async function getBaseUrl() {
    try {
      const res = await http_get('https://raw.githubusercontent.com/manitux-app/cs-plugins/main/domains.json', {});
      const domains = JSON.parse(res.body || res);
      return domains.webdramaturkey || (typeof manifest !== 'undefined' && manifest.baseUrl) || DEFAULT_DOMAIN;
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

    const elements = doc.querySelectorAll('.list-movie, div[class*="movie-item"], div.item');
    for (const el of elements) {
      const linkEl = el.querySelector('a[href]');
      const titleEl = el.querySelector('h2, h3, .title, a') || el;
      const imgEl = el.querySelector('img');

      if (linkEl && titleEl) {
        const href = linkEl.getAttribute('href');
        const title = titleEl.textContent.trim();
        const poster = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null;

        if (title && href && !items.some(i => i.url === href)) {
          items.push(new MultimediaItem({
            url: href.startsWith('http') ? href : base + href,
            title: title,
            type: 'series',
            posterUrl: poster
          }));
        }
      }
    }

    if (items.length > 0) {
      categories['Asya ve Web Dizileri'] = items;
    }
    return categories;
  };

  globalThis.search = async function (query, page) {
    const base = await getBaseUrl();
    const searchUrl = `${base}/?s=${encodeURIComponent(query)}`;
    const res = await http_get(searchUrl, { 'User-Agent': 'Mozilla/5.0' });
    const doc = await parseHtml(res.body || res);
    const results = [];

    const elements = doc.querySelectorAll('.list-movie, div[class*="movie-item"], div.item');
    for (const el of elements) {
      const linkEl = el.querySelector('a[href]');
      const titleEl = el.querySelector('h2, h3, .title, a') || el;
      const imgEl = el.querySelector('img');

      if (linkEl && titleEl) {
        const href = linkEl.getAttribute('href');
        const title = titleEl.textContent.trim();
        const poster = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null;

        if (title && href && !results.some(r => r.url === href)) {
          results.push(new MultimediaItem({
            url: href.startsWith('http') ? href : base + href,
            title: title,
            type: 'series',
            posterUrl: poster
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

    const titleEl = doc.querySelector('h1, .entry-title');
    const descEl = doc.querySelector('.entry-content, .desc, p');
    const imgEl = doc.querySelector('.poster img, img, meta[property="og:image"]');
    const poster = imgEl ? (imgEl.getAttribute('content') || imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null;

    const episodes = [];
    const epElements = doc.querySelectorAll('a[href*="-sezon/"][href*="-bolum"], a[href*="-bolum/"], .episodes-list a');

    epElements.forEach((el, index) => {
      const href = el.getAttribute('href');
      const name = el.textContent.trim();
      const sMatch = name.match(/(\d+)\.\s*Sezon/i) || href.match(/(\d+)-sezon/i);
      const eMatch = name.match(/(\d+)\.\s*Bölüm/i) || href.match(/(\d+)-bolum/i);

      episodes.push(new Episode({
        name: name || `${index + 1}. Bölüm`,
        season: sMatch ? parseInt(sMatch[1], 10) : 1,
        episode: eMatch ? parseInt(eMatch[1], 10) : (index + 1),
        url: href.startsWith('http') ? href : base + href
      }));
    });

    return new MultimediaItem({
      url: targetUrl,
      title: titleEl ? titleEl.textContent.trim() : 'WebDramaTurkey',
      type: 'series',
      description: descEl ? descEl.textContent.trim() : '',
      posterUrl: poster,
      episodes: episodes
    });
  };

  globalThis.loadStreams = async function (url) {
    const res = await http_get(url, { 'User-Agent': 'Mozilla/5.0', 'Referer': url });
    const doc = await parseHtml(res.body || res);
    const streams = [];

    const iframes = doc.querySelectorAll('.app-detail-embed iframe[src], iframe[src], iframe[data-src]');
    for (const iframe of iframes) {
      let src = iframe.getAttribute('src') || iframe.getAttribute('data-src');
      if (src && !src.includes('youtube.com')) {
        if (src.startsWith('//')) src = 'https:' + src;
        streams.push(new StreamResult({
          url: src,
          source: 'WebDrama Player',
          quality: '1080p',
          headers: { 'Referer': url }
        }));
      }
    }

    return streams;
  };
})();

