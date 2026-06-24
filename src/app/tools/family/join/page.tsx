import { redirect } from "next/navigation";

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function LegacyJoinRedirect({ searchParams }: Props) {
  const params = await searchParams;
  const token = params.token;
  if (token) {
    redirect(`/tools/family/parent/join?token=${encodeURIComponent(token)}`);
  }
  redirect("/tools/family/child");
}
