/** Сброс горизонтального смещения и позиции после закрытия клавиатуры на мобильных. */
export function resetMobileViewport(): void {
  if (typeof window === "undefined") return;

  const apply = () => {
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;

    const vv = window.visualViewport;
    const top =
      vv && vv.offsetTop > 0
        ? Math.max(0, window.scrollY + vv.offsetTop)
        : window.scrollY;

    if (window.scrollX !== 0 || (vv && vv.offsetTop > 0)) {
      window.scrollTo(0, top);
    }
  };

  requestAnimationFrame(apply);
  window.setTimeout(apply, 80);
  window.setTimeout(apply, 320);
}
