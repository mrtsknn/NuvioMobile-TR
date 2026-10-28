(function () {
  const DEFAULT_DOMAIN = 'https://selcukflix.app';

  async function getBaseUrl() {
    try {
      const res = await http_get('https://raw.githubusercontent.com/manitux-app/cs-plugins/main/domains.json', {});
      const domains = JSON.parse(res.body || res);
      return domains.selcukflix || (typeof manifest !== 'undefined' && manifest.baseUrl) || DEFAULT_DOMAIN;
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

    const elements = doc.querySelectorAll('a[href*="/film/"], a[href*="/dizi/"]');
    for (const el of elements) {
      const href = el.getAttribute('href');
      const titleEl = el.querySelector('h2, h3, .title, .name') || el;
      const imgEl = el.querySelector('img');

      if (href && titleEl) {
        const title = titleEl.textContent.trim();
        const poster = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null;
        const isSeries = href.includes('/dizi/');

        if (title && !items.some(i => i.url === href)) {
          items.push(new MultimediaItem({
            url: href.startsWith('http') ? href : base + href,
            title: title,
            type: isSeries ? 'series' : 'movie',
            posterUrl: poster
          }));
        }
      }
    }

    if (items.length > 0) {
      categories['Öne Çıkanlar'] = items.slice(0, 30);
    }
    return categories;
  };

  globalThis.search = async function (query, page) {
    const base = await getBaseUrl();
    const searchUrl = `${base}/kesfet?q=${encodeURIComponent(query)}`;
    const res = await http_get(searchUrl, { 'User-Agent': 'Mozilla/5.0' });
    const doc = await parseHtml(res.body || res);
    const results = [];

    const elements = doc.querySelectorAll('a[href*="/film/"], a[href*="/dizi/"]');
    for (const el of elements) {
      const href = el.getAttribute('href');
      const titleEl = el.querySelector('h2, h3, .title, .name') || el;
      const imgEl = el.querySelector('img');

      if (href && titleEl) {
        const title = titleEl.textContent.trim();
        const poster = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null;
        const isSeries = href.includes('/dizi/');

        if (title && !results.some(r => r.url === href)) {
          results.push(new MultimediaItem({
            url: href.startsWith('http') ? href : base + href,
            title: title,
            type: isSeries ? 'series' : 'movie',
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

    const titleEl = doc.querySelector('h1, .movie-title');
    const descEl = doc.querySelector('.description, .overview, p');
    const imgEl = doc.querySelector('.poster img, img');
    const poster = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null;
    const isSeries = targetUrl.includes('/dizi/');

    const episodes = [];
    if (isSeries) {
      const epLinks = doc.querySelectorAll('a[href*="/sezon-"]');
      epLinks.forEach((aTag, index) => {
        const href = aTag.getAttribute('href');
        const name = aTag.textContent.trim();
        const sMatch = name.match(/(\d+)\.\s*Sezon/i) || href.match(/sezon-(\d+)/i);
        const eMatch = name.match(/(\d+)\.\s*Bölüm/i) || href.match(/bolum-(\d+)/i);

        episodes.push(new Episode({
          name: name || `${index + 1}. Bölüm`,
          season: sMatch ? parseInt(sMatch[1], 10) : 1,
          episode: eMatch ? parseInt(eMatch[1], 10) : (index + 1),
          url: href.startsWith('http') ? href : base + href
        }));
      });
    }

    return new MultimediaItem({
      url: targetUrl,
      title: titleEl ? titleEl.textContent.trim() : 'SelcukFlix',
      type: isSeries ? 'series' : 'movie',
      description: descEl ? descEl.textContent.trim() : '',
      posterUrl: poster,
      episodes: episodes
    });
  };

  globalThis.loadStreams = async function (url) {
    const res = await http_get(url, { 'User-Agent': 'Mozilla/5.0', 'Referer': url });
    const text = String(res.body || res);
    const doc = await parseHtml(text);
    const streams = [];

    // 1. Doğrudan m3u8 veya mp4 regex
    const m3u8Matches = text.match(/https?:\/\/[^\s"'<>\\]+\.(?:m3u8|mp4)(?:\?[^\s"'<>\\]*)?/g);
    if (m3u8Matches) {
      m3u8Matches.forEach(streamUrl => {
        if (!streamUrl.includes('thumb') && !streamUrl.includes('preview')) {
          streams.push(new StreamResult({
            url: streamUrl,
            source: 'SelcukFlix HLS',
            quality: '1080p',
            headers: { 'Referer': url }
          }));
        }
      });
    }

    // 2. Iframe player'lar
    const iframes = doc.querySelectorAll('iframe[src], iframe[data-src]');
    for (const iframe of iframes) {
      let src = iframe.getAttribute('src') || iframe.getAttribute('data-src');
      if (src && !src.includes('youtube.com')) {
        if (src.startsWith('//')) src = 'https:' + src;
        streams.push(new StreamResult({
          url: src,
          source: 'SelcukFlix Player',
          quality: '1080p',
          headers: { 'Referer': url }
        }));
      }
    }

    return streams;
  };
})();

