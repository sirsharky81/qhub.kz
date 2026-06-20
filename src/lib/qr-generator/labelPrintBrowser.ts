const LABEL_PRINT_CLASS = "qr-label-print-mode";

function setLabelPrintMode(on: boolean): void {
  document.documentElement.classList.toggle(LABEL_PRINT_CLASS, on);
  document.body.classList.toggle(LABEL_PRINT_CLASS, on);
}

/** Печать одной метки: только содержимое, левый верхний угол A4, реальный размер. */
export function printLabelSheet(): void {
  setLabelPrintMode(true);
  window.print();
  setLabelPrintMode(false);
}
