// Arabic letters → Latin, so a product typed only in Arabic still gets a readable URL (e.g. سارة → sara).
const AR: Record<string, string> = {
  ا: 'a', أ: 'a', إ: 'e', آ: 'a', ء: '', ؤ: 'o', ئ: 'e', ب: 'b', ت: 't', ث: 'th', ج: 'j', ح: 'h', خ: 'kh',
  د: 'd', ذ: 'th', ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's', ض: 'd', ط: 't', ظ: 'z', ع: 'a', غ: 'gh',
  ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', ة: 'a', و: 'w', ي: 'y', ى: 'a',
}

export function slugify(input: string): string {
  return input
    .replace(/[ً-ْـ]/g, '') // harakat and tatweel
    .replace(/[؀-ۿ]/g, (ch) => AR[ch] ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // accents
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '')
}
