import { redirect } from "next/navigation";

/** Legacy URL → universal OBD tool with Mitsubishi tab. */
export default function MitsubishiDiagRedirectPage() {
  redirect("/tools/obd-diag?tab=mitsubishi");
}
