// WordCraft 分页的纯计算：A4 96dpi 页高 1123px、页宽 794px。
// 不碰 DOM，输入是内容高度 / 滚动位置 / 总页数，输出是页数与当前页。

export const PAGE_HEIGHT = 1123;
export const PAGE_WIDTH = 794;

// 总页数：空内容（contentH <= 0）算 1 页；内容恰好等于页高也算 1 页；
// 多 1 像素就进到第 2 页。
export function pageCount(contentH, pageH) {
  const ph = pageH > 0 ? pageH : PAGE_HEIGHT;
  const c = Number(contentH) || 0;
  if (c <= 0) return 1;
  return Math.max(1, Math.ceil(c / ph));
}

// 当前页：按滚动容器 scrollTop 估算，+200 是「视口已越过页首一点」的偏置，
// 结果夹取到 [1, pages]。
export function currentPage(scrollTop, pageH, pages) {
  const ph = pageH > 0 ? pageH : PAGE_HEIGHT;
  const p = Number(pages) || 1;
  const n = Math.min(p, Math.floor(((Number(scrollTop) || 0) + 200) / ph) + 1);
  return Math.max(1, n);
}

// 便捷组合：一次算出 { pages, page }。
export function paginate(contentH, scrollTop, pageH) {
  const ph = pageH > 0 ? pageH : PAGE_HEIGHT;
  const pages = pageCount(contentH, ph);
  return { pages: pages, page: currentPage(scrollTop, ph, pages) };
}
