import { siteConfig } from "../data/site";

export function toAbsoluteUrl(pathOrUrl: string) {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  return new URL(pathOrUrl, siteConfig.siteUrl).toString();
}

export function stringifyStructuredData(data: object | object[] | undefined) {
  if (!data) {
    return "";
  }

  return JSON.stringify(data);
}
