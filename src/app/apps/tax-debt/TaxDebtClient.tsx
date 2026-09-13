"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { TurnstileWidget } from "@/components/TurnstileWidget";
import { CAPTCHA_REQUIRED_MSG } from "@/lib/captcha/turnstile-client";
import { useTurnstileConfig } from "@/lib/captcha/useTurnstileConfig";
import { useIosPwaKeyboardShell } from "@/lib/platform/ios-pwa-keyboard-shell";
import { MOBILE_SAFE_INPUT_CLASS } from "@/lib/platform/mobile-viewport";
import { platformFetch } from "@/lib/platform/api-client";
import { formatTenge } from "@/lib/tax-debt/format";
import { LANG_OPTIONS, t } from "@/lib/tax-debt/i18n";
import { isTaxpayerCodeLengthValid, isValidIinBin, normalizeTaxpayerCode } from "@/lib/tax-debt/iin";
import type { Lang, TaxDebtLookupError, TaxDebtLookupResponse, TaxDebtResult, TaxOrgDebt } from "@/lib/tax-debt/types";

const KGD_SOURCE_URL = "https://portal.kgd.gov.kz/ru/pages/info-services/info-absence-tax-debt";

const inputClass =
  `w-full px-3 py-2.5 text-gray-800 bg-white border border-gray-200 rounded-lg outline-none focus:border-gray-400 focus:ring-2 focus:ring-gray-900/5 transition-colors tabular-nums tracking-wider scroll-mt-4 ${MOBILE_SAFE_INPUT_CLASS}`;
const labelClass = "block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-1.5";
const btnPrimary =
  "px-4 py-2.5 rounded-xl text-sm font-semibold bg-gray-900 hover:bg-gray-700 text-white transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed";
const btnSecondary =
  "px-4 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors";

function errorMessage(lang: Lang, code?: TaxDebtLookupError["code"]): string {
  switch (code) {
    case "invalid_code":
      return t(lang, "err.length");
    case "not_found":
      return t(lang, "err.not_found");
    case "forbidden":
      return t(lang, "err.forbidden");
    case "unauthorized":
      return t(lang, "err.unauthorized");
    case "not_configured":
      return t(lang, "err.not_configured");
    case "captcha":
      return t(lang, "err.captcha");
    case "rate_limited":
      return t(lang, "err.rate_limited");
    case "upstream":
      return t(lang, "err.upstream");
    default:
      return t(lang, "err.generic");
  }
}

function SummaryCard({ label, value, emphasize }: { label: string; value: number; emphasize?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <div className={"mt-1 text-sm tabular-nums " + (emphasize ? "font-semibold text-gray-900" : "text-gray-800")}>
        {formatTenge(value)}
      </div>
    </div>
  );
}

function OrgCard({ org, lang }: { org: TaxOrgDebt; lang: Lang }) {
  const [open, setOpen] = useState(org.bccArrears.length > 0);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full text-left px-4 sm:px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {t(lang, "org.code")} {org.charCode || "—"}
            </div>
            <div className="mt-1 text-sm font-medium text-gray-900">{org.name || t(lang, "org.name")}</div>
            {org.taxpayerName ? <div className="mt-1 text-xs text-gray-500">{org.taxpayerName}</div> : null}
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] uppercase tracking-wider text-gray-400">{t(lang, "org.total")}</div>
            <div className="mt-1 text-sm font-semibold tabular-nums text-gray-900">{formatTenge(org.totalArrear)}</div>
          </div>
        </div>
      </button>

      {open ? (
        <div className="border-t border-gray-100 px-4 sm:px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <SummaryCard label={t(lang, "sum.tax")} value={org.totalTaxArrear} />
            <SummaryCard label={t(lang, "sum.pension")} value={org.pensionContributionArrear} />
            <SummaryCard label={t(lang, "sum.social")} value={org.socialContributionArrear} />
            <SummaryCard label={t(lang, "sum.health")} value={org.socialHealthInsuranceArrear} />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <SummaryCard label={t(lang, "bcc.tax")} value={org.taxpayerArrears.taxArrear} />
            <SummaryCard label={t(lang, "bcc.penalty")} value={org.taxpayerArrears.poenaArrear} />
            <SummaryCard label={t(lang, "bcc.percent")} value={org.taxpayerArrears.percentArrear} />
            <SummaryCard label={t(lang, "bcc.fine")} value={org.taxpayerArrears.fineArrear} />
            <SummaryCard label={t(lang, "bcc.total")} value={org.taxpayerArrears.totalArrear} emphasize />
          </div>

          {org.bccArrears.length > 0 ? (
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-50 text-[10px] uppercase tracking-wider text-gray-500">
                    <th className="px-3 py-2 text-left font-semibold">{t(lang, "bcc.code")}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t(lang, "bcc.name")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t(lang, "bcc.tax")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t(lang, "bcc.penalty")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t(lang, "bcc.fine")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t(lang, "bcc.percent")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t(lang, "bcc.total")}</th>
                  </tr>
                </thead>
                <tbody>
                  {org.bccArrears.map((row) => (
                    <tr key={`${org.charCode}-${row.bcc}`} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-mono text-xs text-gray-700">{row.bcc}</td>
                      <td className="px-3 py-2 text-gray-700">{row.bccName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatTenge(row.taxArrear)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatTenge(row.poenaArrear)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatTenge(row.fineArrear)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatTenge(row.percentArrear)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{formatTenge(row.totalArrear)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-gray-500">{t(lang, "org.empty")}</p>
          )}
        </div>
      ) : null}
    </section>
  );
}

export default function TaxDebtClient() {
  const [lang, setLang] = useState<Lang>("ru");
  const [iin, setIin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TaxDebtResult | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const turnstile = useTurnstileConfig();
  const captchaRequired = turnstile.enabled;
  const mainRef = useRef<HTMLDivElement>(null);
  useIosPwaKeyboardShell(mainRef, true);

  const code = useMemo(() => normalizeTaxpayerCode(iin), [iin]);

  function resetCaptcha() {
    setCaptchaToken(null);
    setCaptchaReset((key) => key + 1);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!code) {
      setError(t(lang, "err.required"));
      return;
    }
    if (!isTaxpayerCodeLengthValid(code)) {
      setError(t(lang, "err.length"));
      return;
    }
    if (captchaRequired && !captchaToken) {
      setError(t(lang, "err.captcha") || CAPTCHA_REQUIRED_MSG);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await platformFetch("/api/tax-debt", {
        method: "POST",
        body: JSON.stringify({ taxpayerCode: code, lang, captchaToken: captchaToken ?? undefined }),
      });
      const payload = (await response.json()) as TaxDebtLookupResponse & TaxDebtLookupError;
      if (!response.ok) {
        setResult(null);
        setError(errorMessage(lang, payload.code));
        resetCaptcha();
        return;
      }
      setResult(payload.result);
      resetCaptcha();
    } catch {
      setResult(null);
      setError(t(lang, "err.upstream"));
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setIin("");
    setError(null);
    setResult(null);
    resetCaptcha();
  }

  return (
    <div
      ref={mainRef}
      className="flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y [-webkit-overflow-scrolling:touch] bg-dot-grid print:bg-white print:overflow-visible"
    >
      <div className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">{t(lang, "app.title")}</h1>
            <p className="text-sm text-gray-500 mt-1">{t(lang, "app.subtitle")}</p>
          </div>
          <div className="flex gap-1 self-start">
            {LANG_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLang(opt.id)}
                className={
                  "px-2.5 py-1 text-xs rounded-md border transition-colors " +
                  (lang === opt.id
                    ? "bg-gray-900 text-white border-gray-900"
                    : "border-gray-200 text-gray-500 hover:border-gray-400")
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5 space-y-4 print:hidden"
        >
          <div>
            <label htmlFor="tax-debt-iin" className={labelClass}>
              {t(lang, "lbl.iin")}
            </label>
            <input
              id="tax-debt-iin"
              inputMode="numeric"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="done"
              maxLength={12}
              className={inputClass}
              style={{ fontSize: 16 }}
              placeholder={t(lang, "placeholder.iin")}
              value={iin}
              onChange={(event) => setIin(normalizeTaxpayerCode(event.target.value))}
            />
            <p className="mt-1.5 text-xs text-gray-400">{t(lang, "hint.iin")}</p>
            {code.length === 12 && !isValidIinBin(code) ? (
              <p className="mt-1 text-xs text-amber-700">{t(lang, "err.checksum")}</p>
            ) : null}
          </div>

          <TurnstileWidget
            siteKey={turnstile.siteKey}
            enabled={captchaRequired}
            loading={turnstile.loading}
            resetKey={captchaReset}
            align="start"
            onToken={setCaptchaToken}
            onExpire={() => setCaptchaToken(null)}
            onError={() => setCaptchaToken(null)}
          />

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                className={btnPrimary}
                disabled={loading || turnstile.loading || (captchaRequired && !captchaToken)}
              >
                {loading ? "…" : t(lang, "btn.find")}
              </button>
              <button type="button" className={btnSecondary} onClick={handleReset}>
                {t(lang, "btn.reset")}
              </button>
            </div>
            <a
              href={KGD_SOURCE_URL}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-gray-500 hover:text-gray-800"
            >
              {t(lang, "source.label")}: {t(lang, "source.name")}
            </a>
          </div>
        </form>

        {!result && !error ? (
          <p className="text-sm text-gray-500 print:hidden">{t(lang, "empty.hint")}</p>
        ) : null}

        {result ? (
          <div className="space-y-4">
            <section
              className={
                "rounded-2xl border px-4 sm:px-5 py-5 " +
                (result.hasDebt
                  ? "border-red-200 bg-red-50"
                  : "border-emerald-200 bg-emerald-50")
              }
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div>
                  <div
                    className={
                      "text-lg sm:text-xl font-bold " +
                      (result.hasDebt ? "text-red-800" : "text-emerald-800")
                    }
                  >
                    {result.hasDebt ? t(lang, "hero.debt") : t(lang, "hero.clear")}
                  </div>
                  <div className="mt-2 text-sm text-gray-700">
                    {t(lang, "hero.taxpayer")}:{" "}
                    <span className="font-medium">{result.taxpayerName || "—"}</span>
                    <span className="text-gray-400"> · </span>
                    <span className="font-mono tabular-nums">{result.taxpayerCode}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {t(lang, "hero.as_of")} {result.asOf}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-wider text-gray-500">{t(lang, "sum.total")}</div>
                  <div
                    className={
                      "mt-1 text-2xl font-bold tabular-nums " +
                      (result.hasDebt ? "text-red-800" : "text-emerald-800")
                    }
                  >
                    {formatTenge(result.totalArrear)}
                  </div>
                  <button type="button" onClick={() => window.print()} className={btnSecondary + " mt-3 print:hidden"}>
                    {t(lang, "btn.print")}
                  </button>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <SummaryCard label={t(lang, "sum.tax")} value={result.totalTaxArrear} emphasize />
              <SummaryCard label={t(lang, "sum.pension")} value={result.pensionContributionArrear} />
              <SummaryCard label={t(lang, "sum.social")} value={result.socialContributionArrear} />
              <SummaryCard label={t(lang, "sum.health")} value={result.socialHealthInsuranceArrear} />
            </div>

            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-800">{t(lang, "org.title")}</h2>
              {result.taxOrgs.length === 0 ? (
                <p className="text-sm text-gray-500">{t(lang, "org.empty")}</p>
              ) : (
                result.taxOrgs.map((org) => <OrgCard key={org.charCode || org.name} org={org} lang={lang} />)
              )}
            </div>
          </div>
        ) : null}

        <p className="text-xs text-gray-400 leading-relaxed">{t(lang, "disclaimer")}</p>
      </div>
    </div>
  );
}
