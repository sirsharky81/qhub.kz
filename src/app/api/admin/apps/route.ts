import { NextResponse } from "next/server";
import { apps, sortApps } from "@/data/apps";
import { getHiddenAppIds, toggleAppHidden } from "@/lib/admin/store";
import { isAdminAuthenticated } from "@/lib/admin/session";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  try {
    const hiddenIds = new Set(await getHiddenAppIds());
    const list = sortApps(apps).map((app) => ({
      id: app.id,
      title: app.title,
      href: app.href,
      comingSoon: !!app.comingSoon,
      devOnly: !!app.devOnly,
      hiddenFromPublic: hiddenIds.has(app.id),
    }));

    return NextResponse.json({ apps: list });
  } catch {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте через минуту." },
      { status: 503 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  let body: { appId?: string; hidden?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Неверный формат запроса" }, { status: 400 });
  }

  const appId = typeof body.appId === "string" ? body.appId.trim() : "";
  if (!appId || !apps.some((a) => a.id === appId)) {
    return NextResponse.json({ error: "Неизвестное приложение" }, { status: 400 });
  }

  const hidden = body.hidden === true;
  const hiddenIds = await toggleAppHidden(appId, hidden);
  return NextResponse.json({ ok: true, hiddenAppIds: hiddenIds });
}
