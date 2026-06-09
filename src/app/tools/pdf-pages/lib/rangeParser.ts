/**
 * Parses a page-range string like "1-3,7,9-12" into sorted unique 1-based page numbers.
 */
export function parsePageRanges(input: string, totalPages: number): number[] {
  const trimmed = input.trim();
  if (!trimmed) return [];

  const parts = trimmed.split(",");
  const result = new Set<number>();

  for (const part of parts) {
    const segment = part.trim();
    if (!segment) continue;

    if (segment.includes("-")) {
      const [startStr, endStr] = segment.split("-").map((s) => s.trim());
      const start = Number(startStr);
      const end = Number(endStr);

      if (!Number.isInteger(start) || !Number.isInteger(end)) {
        throw new RangeError("invalid_range");
      }
      if (start < 1 || end < 1 || start > end) {
        throw new RangeError("invalid_range");
      }
      if (start > totalPages || end > totalPages) {
        throw new RangeError("out_of_bounds");
      }

      for (let i = start; i <= end; i++) {
        result.add(i);
      }
    } else {
      const page = Number(segment);
      if (!Number.isInteger(page) || page < 1) {
        throw new RangeError("invalid_range");
      }
      if (page > totalPages) {
        throw new RangeError("out_of_bounds");
      }
      result.add(page);
    }
  }

  return Array.from(result).sort((a, b) => a - b);
}

/**
 * Validates a page-range string and returns an error message key suffix or null if valid.
 */
export function validateRanges(input: string, totalPages: number): string | null {
  const trimmed = input.trim();
  if (!trimmed) return "empty";

  const rangePattern = /^(\d+(-\d+)?)(,\s*\d+(-\d+)?)*$/;
  if (!rangePattern.test(trimmed.replace(/\s/g, ""))) {
    return "invalid_format";
  }

  try {
    parsePageRanges(trimmed, totalPages);
    return null;
  } catch (error) {
    if (error instanceof RangeError) {
      if (error.message === "out_of_bounds") return "out_of_bounds";
      return "invalid_format";
    }
    return "invalid_format";
  }
}
