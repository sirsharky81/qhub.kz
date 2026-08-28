import { describe, expect, it } from "vitest";
import { appendMailSignature, effectiveMailSignature, formatMailFrom } from "./profile-utils";

describe("mail profile utils", () => {
  it("formats named From header", () => {
    expect(formatMailFrom("user@qhub.kz", "Boris Khmarnyy")).toBe(
      '"Boris Khmarnyy" <user@qhub.kz>',
    );
    expect(formatMailFrom("user@qhub.kz")).toBe("user@qhub.kz");
  });

  it("builds default signature from name and phone", () => {
    expect(
      effectiveMailSignature({
        fullName: "Boris Khmarnyy",
        phone: "+7 777 123 4567",
        signature: "",
      }),
    ).toBe("Boris Khmarnyy\n+7 777 123 4567");
  });

  it("prefers custom signature", () => {
    expect(
      effectiveMailSignature({
        fullName: "Boris",
        phone: "+7",
        signature: "С уважением,\nBoris",
      }),
    ).toBe("С уважением,\nBoris");
  });

  it("appends signature once", () => {
    const sig = "С уважением,\nBoris";
    expect(appendMailSignature("Привет", sig)).toBe(`Привет\n\n${sig}`);
    expect(appendMailSignature(`Привет\n\n${sig}`, sig)).toBe(`Привет\n\n${sig}`);
  });
});
