#!/usr/bin/env python3
"""Safe public source rescue helper for WholesaleOS operators.

This tool only classifies public source URLs, tries lightweight address/source
rescue, and writes blocked items to a manual-review CSV. It never invents
property facts, valuations, comps, contacts, or seller motivation.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import urllib.robotparser
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple


USER_AGENT = "WholesaleOS-SourceRescue/1.0"
REDIRECT_KEYS = ("url", "q", "u", "target", "redirect", "destination", "dest", "to", "r", "adurl")
TRACKING_PREFIXES = ("utm_",)
TRACKING_KEYS = {
    "gclid",
    "gbraid",
    "wbraid",
    "yclid",
    "fbclid",
    "msclkid",
    "ref",
    "source",
    "campaign",
    "cmpid",
    "cid",
    "mkt_tok",
}
STREET_RE = re.compile(
    r"\b(?P<street>\d{2,7}\s+[A-Za-z0-9.'# -]+?\s+"
    r"(?:st|street|ave|avenue|rd|road|dr|drive|ln|lane|ct|court|cir|circle|"
    r"blvd|boulevard|way|pl|place|pkwy|parkway|hwy|highway|ter|terrace|trl|trail|loop))"
    r"(?:[,\s]+(?P<city>[A-Za-z][A-Za-z .'-]+?))?"
    r"(?:[,\s]+(?P<state>TX|Texas))?"
    r"(?:[,\s]+(?P<zip>\d{5})(?:-\d{4})?)?\b",
    re.I,
)


@dataclass
class RescueResult:
    input_url: str
    canonical_url: str
    final_url: str
    source_type: str
    blocker_type: str
    blocked_reason: str
    extracted_address: str
    title: str
    snippet: str
    recommended_manual_action: str


def clean_text(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def is_http_url(value: str) -> bool:
    return bool(re.match(r"^https?://", clean_text(value), re.I))


def decode_repeated(value: str, limit: int = 4) -> str:
    text = clean_text(value)
    for _ in range(limit):
        decoded = urllib.parse.unquote(text)
        if decoded == text:
            break
        text = decoded
    return text


def strip_tracking(url: str) -> str:
    if not is_http_url(url):
        return clean_text(url)
    parsed = urllib.parse.urlsplit(url)
    pairs = []
    for key, value in urllib.parse.parse_qsl(parsed.query, keep_blank_values=True):
        lower = key.lower()
        if lower in TRACKING_KEYS or any(lower.startswith(prefix) for prefix in TRACKING_PREFIXES):
            continue
        pairs.append((key, value))
    return urllib.parse.urlunsplit(
        (parsed.scheme, parsed.netloc, parsed.path, urllib.parse.urlencode(pairs, doseq=True), "")
    )


def extract_redirect_target(url: str) -> str:
    text = clean_text(url)
    if not is_http_url(text):
        return ""
    parsed = urllib.parse.urlsplit(text)
    params = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
    for key in REDIRECT_KEYS:
        for raw in params.get(key, []):
            decoded = decode_repeated(raw)
            if is_http_url(decoded):
                return strip_tracking(decoded)
            nested = re.search(r"https?://[^\s\"'<>)+\]]+", decoded, re.I)
            if nested:
                return strip_tracking(nested.group(0))
    decoded_full = decode_repeated(text)
    nested = re.search(r"https?://[^\s\"'<>)+\]]+", decoded_full, re.I)
    if nested and nested.group(0) != text:
        nested_parsed = urllib.parse.urlsplit(nested.group(0))
        if not (nested_parsed.netloc.lower() == parsed.netloc.lower() and nested_parsed.path == parsed.path):
            return strip_tracking(nested.group(0))
    return ""


def is_google_redirect(url: str) -> bool:
    try:
        parsed = urllib.parse.urlsplit(url)
    except ValueError:
        return False
    host = parsed.netloc.lower()
    path = parsed.path.lower()
    return (
        host.endswith("google.com")
        and path in ("/url", "/search")
    ) or (
        host.endswith("vertexaisearch.cloud.google.com") and "grounding-api-redirect" in path
    )


def canonicalize_url(url: str) -> Tuple[str, str]:
    text = clean_text(url)
    target = extract_redirect_target(text)
    if target:
        return target, "redirect_target"
    if is_http_url(text):
        stripped = strip_tracking(text)
        return stripped, "tracking_stripped" if stripped != text else "original"
    return text, "invalid"


def classify_source(url: str) -> str:
    if not is_http_url(url):
        return "invalid_url"
    parsed = urllib.parse.urlsplit(url)
    host = parsed.netloc.lower()
    path = parsed.path.lower()
    if "foreclosure.com" in host:
        return "blocked_foreclosure_com"
    if is_google_redirect(url):
        return "google_redirect_or_search"
    if host.endswith("har.com") and "/homedetail/" in path:
        return "listing_property_page"
    if host.endswith("realtor.com") and "/realestateandhomes-detail/" in path:
        return "listing_property_page"
    if host.endswith("redfin.com") and "/home/" in path:
        return "listing_property_page"
    if host.endswith("zillow.com") and "/homedetails/" in path:
        return "listing_property_page"
    if host.endswith("auction.com") and re.search(r"/(details|detail|property|auction)/", path):
        return "auction_property_page"
    if any(site in host for site in ("har.com", "realtor.com", "redfin.com", "zillow.com", "auction.com")):
        if re.search(r"/(search|homes|for-sale|realestateandhomes-search|foreclosure-bank-owned-auctions)", path):
            return "listing_or_auction_search_page"
        if path in ("", "/"):
            return "generic_homepage"
    if host.endswith(".gov") or "dallascounty" in host:
        return "official_public_source"
    return "unknown_source"


def title_case_address(value: str) -> str:
    specials = {
        "tx": "TX", "st": "St", "ave": "Ave", "rd": "Rd", "dr": "Dr", "ln": "Ln",
        "ct": "Ct", "cir": "Cir", "blvd": "Blvd", "pkwy": "Pkwy", "hwy": "Hwy",
        "ter": "Ter", "trl": "Trl", "pl": "Pl",
    }
    words = []
    for word in clean_text(value).split():
        lower = word.lower()
        words.append(specials.get(lower, lower.capitalize() if not word.isdigit() else word))
    return " ".join(words)


def extract_address_from_text(*values: str) -> str:
    haystack = " ".join(clean_text(v).replace("_", " ").replace("-", " ") for v in values if v)
    match = STREET_RE.search(haystack)
    if not match:
        return ""
    street = title_case_address(match.group("street") or "")
    city = title_case_address(match.group("city") or "")
    state = "TX" if match.group("state") else ""
    zipcode = match.group("zip") or ""
    parts = [street]
    city_state = ", ".join(p for p in (city, " ".join(p for p in (state, zipcode) if p)) if p)
    if city_state:
        parts.append(city_state)
    return ", ".join(p for p in parts if p)


def html_title(body: str) -> str:
    match = re.search(r"<title[^>]*>(.*?)</title>", body or "", re.I | re.S)
    return html.unescape(clean_text(re.sub(r"<[^>]+>", " ", match.group(1)))) if match else ""


def visible_snippet(body: str, limit: int = 400) -> str:
    text = re.sub(r"<(script|style)[^>]*>.*?</\1>", " ", body or "", flags=re.I | re.S)
    text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    return clean_text(text)[:limit]


def robots_allowed(url: str) -> Tuple[bool, str]:
    parsed = urllib.parse.urlsplit(url)
    if not parsed.scheme or not parsed.netloc:
        return False, "invalid URL"
    robots_url = urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "/robots.txt", "", ""))
    rp = urllib.robotparser.RobotFileParser()
    rp.set_url(robots_url)
    try:
        rp.read()
        return rp.can_fetch(USER_AGENT, url), "robots.txt checked"
    except Exception as exc:  # noqa: BLE001 - safe diagnostic only
        return True, f"robots.txt unavailable: {type(exc).__name__}"


def fetch_public_url(url: str, timeout: int = 12) -> Tuple[str, str, str, str]:
    allowed, robots_note = robots_allowed(url)
    if not allowed:
        return "", "", "ROBOTS_DISALLOWED", robots_note
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:  # nosec B310 - bounded public fetch
            final_url = response.geturl()
            content_type = response.headers.get("Content-Type", "")
            raw = response.read(512_000)
            body = raw.decode(response.headers.get_content_charset() or "utf-8", errors="replace")
            if "captcha" in body.lower() or "verify you are human" in body.lower():
                return final_url, "", "MANUAL_REVIEW_CAPTCHA_OR_BOT_CHECK", "login/CAPTCHA style response detected"
            if response.status >= 400:
                return final_url, body, f"HTTP_{response.status}", f"HTTP {response.status}"
            if "login" in final_url.lower() or "signin" in final_url.lower():
                return final_url, body, "MANUAL_REVIEW_LOGIN_REQUIRED", "login redirected"
            return final_url, body, "", f"fetched {content_type}".strip()
    except Exception as exc:  # noqa: BLE001 - return safe operator error
        return "", "", "MANUAL_REVIEW_FETCH_FAILED", type(exc).__name__


def alternative_sources(address: str, limit: int) -> List[Dict[str, str]]:
    query = clean_text(address)
    if not query:
        return []
    encoded = urllib.parse.quote_plus(query)
    out = [
        {"label": "Realtor property search", "url": f"https://www.realtor.com/realestateandhomes-search/{encoded}"},
        {"label": "Redfin property search", "url": f"https://www.redfin.com/stingray/do/query-location?location={encoded}"},
        {"label": "HAR property search", "url": f"https://www.har.com/site-search/for_sale?search={encoded}"},
        {"label": "Zillow property search", "url": f"https://www.zillow.com/homes/{encoded}_rb/"},
        {"label": "Google exact property search", "url": f"https://www.google.com/search?q={encoded}+property+Dallas+TX"},
        {"label": "Dallas CAD public search", "url": f"https://www.dallascad.org/SearchAddr.aspx"},
    ]
    return out[: max(0, min(limit, 10))]


def append_manual_review(csv_path: Optional[Path], address: str, result: RescueResult) -> None:
    if not csv_path:
        return
    csv_path.parent.mkdir(parents=True, exist_ok=True)
    exists = csv_path.exists()
    with csv_path.open("a", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=[
            "address", "input_url", "canonical_url", "final_url", "blocker_type",
            "blocked_reason", "recommended_manual_action",
        ])
        if not exists:
            writer.writeheader()
        writer.writerow({
            "address": address,
            "input_url": result.input_url,
            "canonical_url": result.canonical_url,
            "final_url": result.final_url,
            "blocker_type": result.blocker_type,
            "blocked_reason": result.blocked_reason,
            "recommended_manual_action": result.recommended_manual_action,
        })


def rescue_url(input_url: str, address: str, no_fetch: bool = False) -> RescueResult:
    canonical, source = canonicalize_url(input_url)
    source_type = classify_source(canonical)
    if source_type == "blocked_foreclosure_com":
        return RescueResult(input_url, canonical, "", source_type, "BLOCKED_SOURCE", "Foreclosure.com is not allowed.", "", "", "", "Use official/public non-Foreclosure.com source.")
    if source_type in {"google_redirect_or_search", "generic_homepage", "listing_or_auction_search_page", "invalid_url"}:
        extracted = extract_address_from_text(canonical, address)
        return RescueResult(input_url, canonical, "", source_type, "NEEDS_SOURCE_PROOF", "Source is generic/search/redirect, not property proof.", extracted, "", "", "Find exact public property page or official source record.")
    if no_fetch:
        extracted = extract_address_from_text(canonical, address)
        return RescueResult(input_url, canonical, "", source_type, "", "Not fetched by --no-fetch.", extracted, "", "", "Verify public page manually before offer.")
    final_url, body, blocker, note = fetch_public_url(canonical)
    final = final_url or canonical
    title = html_title(body)
    snippet = visible_snippet(body)
    extracted = extract_address_from_text(address, final, title, snippet)
    if blocker:
        return RescueResult(input_url, canonical, final, source_type, blocker, note, extracted, title, snippet, "Manual review needed. Do not bypass login/CAPTCHA/paywall.")
    if not extracted:
        return RescueResult(input_url, canonical, final, source_type, "NEEDS_ADDRESS_REPAIR", "No usable address found in URL/title/visible text.", "", title, snippet, "Use exact property page or official source with visible address.")
    return RescueResult(input_url, canonical, final, source_type, "", "Public source checked; verify facts before offer.", extracted, title, snippet, "Safe to review as source-backed candidate; no valuation unlocked.")


def main(argv: Optional[Iterable[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Safe public source rescue and manual review queue.")
    parser.add_argument("--address", default="", help="Known or suspected property address.")
    parser.add_argument("--urls", nargs="+", required=True, help="Public source URLs to classify/rescue.")
    parser.add_argument("--manual-review-csv", default="", help="CSV path for blocked/manual-review items.")
    parser.add_argument("--delay-seconds", type=float, default=1.0, help="Delay between bounded public fetches.")
    parser.add_argument("--timeout", type=int, default=12, help="Fetch timeout seconds.")
    parser.add_argument("--max-urls", type=int, default=10, help="Hard cap on URL count.")
    parser.add_argument("--max-alternative-sources", type=int, default=6, help="Alternative source suggestion cap.")
    parser.add_argument("--no-fetch", action="store_true", help="Classify/canonicalize only; no network fetch.")
    args = parser.parse_args(list(argv) if argv is not None else None)

    csv_path = Path(args.manual_review_csv) if args.manual_review_csv else None
    urls = args.urls[: max(1, min(args.max_urls, 25))]
    results: List[RescueResult] = []
    for idx, url in enumerate(urls):
        result = rescue_url(url, args.address, no_fetch=args.no_fetch)
        results.append(result)
        if result.blocker_type:
            append_manual_review(csv_path, args.address, result)
        if idx < len(urls) - 1 and not args.no_fetch:
            time.sleep(max(0.0, min(args.delay_seconds, 5.0)))

    payload = {
        "ok": True,
        "address": clean_text(args.address),
        "results": [asdict(item) for item in results],
        "manual_review_count": sum(1 for item in results if item.blocker_type),
        "alternative_public_sources_suggested": alternative_sources(args.address, args.max_alternative_sources),
        "safety": {
            "no_fake_owner_phone_email": True,
            "no_fake_arv_mao_comps": True,
            "no_login_paywall_captcha_bypass": True,
            "foreclosure_com_blocked": True,
            "lead_mutation": False,
        },
    }
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main())
