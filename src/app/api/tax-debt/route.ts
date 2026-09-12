import { NextResponse } from "next/server";
import { handleCorsPreflight, withCors } from "@/lib/api/cors";
import { assertTurnstile } from "@/lib/captcha/turnstile";
import { checkTaxDebtRateLimit, getClientIp } from "@/lib/rate-limit";
import { lookupTaxDebt, KgdTaxDebtError } from "@/lib/tax-debt/client";
import { isTaxpayerCodeLengthValid, normalizeTaxpayerCode } from "@/lib/tax-debt/iin";
import type { Lang, TaxDebtLookupError } from "@/lib/tax-debt/types";

export const maxDuration = 30;

interface Body {
  taxpayerCode?: string;
  lang?: Lang;
  captchaToken?: string;
}

function jsonError(request: Request, body: TaxDebtLookupError, status: number, retryAfterSec?: number) {
  return withCors(
    NextResponse.json(body, {
      status,
      headers: retryAfterSec ? { "Retry-After": String(retryAfterSec) } : undefined,
    }),
    request,
  );
}

export async function OPTIONS(request: Request) {
  return handleCorsPreflight(request) ?? new Response(null, { status: 204 });
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const { allowed, retryAfterSec } = await checkTaxDebtRateLimit(ip);
  if (!allowed) {
    return jsonError(
      request,
      { error: "rate_limited", code: "rate_limited" },
      429,
      retryAfterSec,
    );
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return jsonError(request, { error: "invalid_code", code: "invalid_code" }, 400);
  }

  const captcha = await assertTurnstile(
    typeof body.captchaToken === "string" ? body.captchaToken : undefined,
    ip,
  );
  if (!captcha.ok) {
    return jsonError(request, { error: captcha.error, code: "captcha" }, captcha.status);
  }

  const taxpayerCode = normalizeTaxpayerCode(body.taxpayerCode ?? "");
  if (!isTaxpayerCodeLengthValid(taxpayerCode)) {
    return jsonError(request, { error: "invalid_code", code: "invalid_code" }, 400);
  }

  const lang = body.lang === "kk" ? "kk" : "ru";

  try {
    const result = await lookupTaxDebt(taxpayerCode, lang);
    return withCors(NextResponse.json({ result }), request);
  } catch (error) {
    if (error instanceof KgdTaxDebtError) {
      return jsonError(request, { error: error.code, code: error.code }, error.status);
    }
    return jsonError(request, { error: "upstream", code: "upstream" }, 502);
  }
}
