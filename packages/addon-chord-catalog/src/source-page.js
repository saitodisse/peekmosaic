function publicUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value, base);
    if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch { /* An optional malformed URL should not block an import. */ }
  return undefined;
}

export function sourcePageUrls(page, sourceUrl) {
  const canonicalUrl = publicUrl(page?.canonicalUrl, sourceUrl);
  const imageUrl = publicUrl(page?.imageUrl, canonicalUrl ?? sourceUrl);
  return {
    ...(canonicalUrl ? { canonicalUrl } : {}),
    ...(imageUrl ? { imageUrl } : {}),
  };
}
