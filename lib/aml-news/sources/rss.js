const { parseRssItems } = require('../../amla-news');
const { stripHtml, toIsoDate } = require('./html');

function rssItemsToRaw(items, source) {
  return (items || []).map((item) => ({
    source,
    source_url: item.link || item.guid || '',
    title: item.title || '',
    published_at: toIsoDate(item.pubDate) || item.pubDate || '',
    raw_content: stripHtml(item.description || item.title || '')
  }));
}

async function fetchRssSource(source, urls, fetchText) {
  const collected = [];
  for (const url of urls) {
    try {
      const xml = await fetchText(url);
      if (!xml || !String(xml).includes('<item>')) continue;
      collected.push(...rssItemsToRaw(parseRssItems(xml), source));
    } catch (_) {
      /* isolated per URL */
    }
  }
  return collected;
}

module.exports = { rssItemsToRaw, fetchRssSource };
