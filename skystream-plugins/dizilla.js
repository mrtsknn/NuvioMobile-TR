(function () {
  const DEFAULT_DOMAIN = 'https://dizilla.now';

  async function getBaseUrl() {
    try {
      const res = await http_get('https://raw.githubusercontent.com/manitux-app/cs-plugins/main/domains.json', {});
      const domains = JSON.parse(res.body || res);
      return domains.dizilla || (typeof manifest !== 'undefined' && manifest.baseUrl) || DEFAULT_DOMAIN;
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

    const elements = doc.querySelectorAll('a[href^="/dizi/"], a[href*="/dizi/"]');
    for (const el of elements) {
      const href = el.getAttribute('href');
      const titleEl = el.querySelector('h2, h3, .title, .dizi-adi, span') || el;
      const imgEl = el.querySelector('img');

      if (href && titleEl) {
        const title = titleEl.textContent.trim();
        const poster = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null;

        if (title && !items.some(i => i.url === href) && !href.includes('/kategori/')) {
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
      categories['Popüler Diziler'] = items.slice(0, 30);
    }
    return categories;
  };

  globalThis.search = async function (query, page) {
    const base = await getBaseUrl();
    const results = [];

    // Önce searchContent API'sini dene
    try {
      const apiUrl = `${base}/api/bg/searchContent?searchterm=${encodeURIComponent(query)}`;
      const res = await http_get(apiUrl, { 'User-Agent': 'Mozilla/5.0', 'X-Requested-With': 'XMLHttpRequest' });
      const data = JSON.parse(res.body || res);
      if (Array.isArray(data)) {
        data.forEach(item => {
          const href = item.url || item.slug || (item.id ? `/dizi/${item.id}` : null);
          if (href && item.title) {
            results.push(new MultimediaItem({
              url: href.startsWith('http') ? href : base + href,
              title: item.title,
              type: 'series',
              posterUrl: item.poster || item.image
            }));
          }
        });
      }
    } catch (e) {}

    if (results.length === 0) {
      const searchUrl = `${base}/arama?q=${encodeURIComponent(query)}`;
      const res = await http_get(searchUrl, { 'User-Agent': 'Mozilla/5.0' });
      const doc = await parseHtml(res.body || res);
      const elements = doc.querySelectorAll('a[href*="/dizi/"]');
      for (const el of elements) {
        const href = el.getAttribute('href');
        const titleEl = el.querySelector('h2, h3, .title') || el;
        const imgEl = el.querySelector('img');
        if (href && titleEl) {
          const title = titleEl.textContent.trim();
          if (title && !results.some(r => r.url === href)) {
            results.push(new MultimediaItem({
              url: href.startsWith('http') ? href : base + href,
              title: title,
              type: 'series',
              posterUrl: imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null
            }));
          }
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

    const titleEl = doc.querySelector('h1, .dizi-baslik');
    const descEl = doc.querySelector('.dizi-ozet, .ozet, p');
    const imgEl = doc.querySelector('.dizi-afis img, .poster img, img');
    const poster = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null;

    const episodes = [];
    const epElements = doc.querySelectorAll('a[href*="-sezon-"][href*="-bolum"], .bolum-item a, a.episode-link');

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
      title: titleEl ? titleEl.textContent.trim() : 'Dizilla',
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

    const iframes = doc.querySelectorAll('iframe[src], iframe[data-src]');
    for (const iframe of iframes) {
      let src = iframe.getAttribute('src') || iframe.getAttribute('data-src');
      if (src && !src.includes('youtube.com')) {
        if (src.startsWith('//')) src = 'https:' + src;
        streams.push(new StreamResult({
          url: src,
          source: 'Dizilla Player',
          quality: '1080p',
          headers: { 'Referer': url }
        }));
      }
    }

    return streams;
  };
})();

