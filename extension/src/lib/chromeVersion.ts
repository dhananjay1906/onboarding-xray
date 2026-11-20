// Chrome version check for the welcome page (the on-device model needs Chrome 139 or newer).
export const MIN_CHROME = 139;

interface Brand {
  brand: string;
  version: string;
}

/** Major Chrome/Chromium version from user-agent client hints (preferred) or the user-agent string. */
export function parseChromeMajor(userAgent: string, brands?: Brand[]): number | null {
  for (const name of ["Google Chrome", "Chromium", "Microsoft Edge"]) {
    const found = brands?.find((b) => b.brand === name);
    const major = found ? Number.parseInt(found.version, 10) : NaN;
    if (Number.isFinite(major)) return major;
  }
  const m = /Chrom(?:e|ium)\/(\d+)/.exec(userAgent);
  return m ? Number.parseInt(m[1], 10) : null;
}

export function chromeMajor(): number | null {
  if (typeof navigator === "undefined") return null;
  const brands = (navigator as Navigator & { userAgentData?: { brands: Brand[] } }).userAgentData?.brands;
  return parseChromeMajor(navigator.userAgent, brands);
}
