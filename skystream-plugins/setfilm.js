(function () {
  const DEFAULT_DOMAIN = 'https://www.setfilmizle.ltd';

  async function getBaseUrl() {
    try {
      const res = await http_get('https://raw.githubusercontent.com/manitux-app/cs-plugins/main/domains.json', {});
      const domains = JSON.parse(res.body || res);
      return domains.setfilm || (typeof manifest !== 'undefined' && manifest.baseUrl) || DEFAULT_DOMAIN;
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

    const elements = doc.querySelectorAll('.fbox, .film-box, div[class*="fbox"]');
    for (const el of elements) {
      const linkEl = el.querySelector('a[href]');
      const titleEl = el.querySelector('.fbox-title-tx, .title, h2, h3, a');
      const imgEl = el.querySelector('img');

      if (linkEl && titleEl) {
        const href = linkEl.getAttribute('href');
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
      categories['Son Eklenenler'] = items;
    }
    return categories;
  };

  globalThis.search = async function (query, page) {
    const base = await getBaseUrl();
    const results = [];

    // Önce live search ajax dene, olmazsa klasik arama
    try {
      const ajaxUrl = `${base}/wp-admin/admin-ajax.php?action=stf_live_search&keyword=${encodeURIComponent(query)}`;
      const res = await http_get(ajaxUrl, { 'User-Agent': 'Mozilla/5.0', 'X-Requested-With': 'XMLHttpRequest' });
      const text = String(res.body || res);
      const doc = await parseHtml(text);

      const elements = doc.querySelectorAll('a[href]');
      for (const el of elements) {
        const href = el.getAttribute('href');
        const title = el.textContent.trim();
        const imgEl = el.querySelector('img');
        if (href && title) {
          results.push(new MultimediaItem({
            url: href.startsWith('http') ? href : base + href,
            title: title,
            type: href.includes('/dizi/') ? 'series' : 'movie',
            posterUrl: imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null
          }));
        }
      }
    } catch (e) {}

    if (results.length === 0) {
      const searchUrl = `${base}/?s=${encodeURIComponent(query)}`;
      const res = await http_get(searchUrl, { 'User-Agent': 'Mozilla/5.0' });
      const doc = await parseHtml(res.body || res);
      const elements = doc.querySelectorAll('.fbox, .film-box, a[href*="/film/"], a[href*="/dizi/"]');
      for (const el of elements) {
        const linkEl = el.tagName === 'A' ? el : el.querySelector('a[href]');
        const titleEl = el.querySelector('.fbox-title-tx, h2, a') || el;
        const imgEl = el.querySelector('img');
        if (linkEl) {
          const href = linkEl.getAttribute('href');
          const title = titleEl.textContent.trim();
          if (href && title && !results.some(r => r.url === href)) {
            results.push(new MultimediaItem({
              url: href.startsWith('http') ? href : base + href,
              title: title,
              type: href.includes('/dizi/') ? 'series' : 'movie',
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

    const titleEl = doc.querySelector('.fbox-title-tx, h1');
    const descEl = doc.querySelector('.fbox-desc, p');
    const imgEl = doc.querySelector('.poster img, img.wp-post-image, img');
    const poster = imgEl ? (imgEl.getAttribute('data-src') || imgEl.getAttribute('src')) : null;
    const isSeries = targetUrl.includes('/dizi/');

    const episodes = [];
    if (isSeries) {
      const epLinks = doc.querySelectorAll('a[href*="/sezon/"], a[href*="/bolum/"], .bolum-item a');
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
      title: titleEl ? titleEl.textContent.trim() : 'SetFilm',
      type: isSeries ? 'series' : 'movie',
      description: descEl ? descEl.textContent.trim() : '',
      posterUrl: poster,
      episodes: episodes
    });
  };

  globalThis.loadStreams = async function (url) {
    const res = await http_get(url, { 'User-Agent': 'Mozilla/5.0', 'Referer': url });
    const doc = await parseHtml(res.body || res);
    const streams = [];

    const iframes = doc.querySelectorAll('#stfPlayer iframe[src], iframe[src], iframe[data-src]');
    for (const iframe of iframes) {
      let src = iframe.getAttribute('src') || iframe.getAttribute('data-src');
      if (src && !src.includes('youtube.com')) {
        if (src.startsWith('//')) src = 'https:' + src;
        streams.push(new StreamResult({
          url: src,
          source: 'SetFilm Player',
          quality: '1080p',
          headers: { 'Referer': url }
        }));
      }
    }

    return streams;
  };
})();

