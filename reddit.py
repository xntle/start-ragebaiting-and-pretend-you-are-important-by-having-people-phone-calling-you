#!/usr/bin/env python3
"""
reddit_top10_scrape.py
Scrape Reddit front page HTML and return the top 10 posts (by order or by score if available).

Dependencies:
    pip install requests beautifulsoup4 lxml
"""

import requests
from bs4 import BeautifulSoup
import time
import json
import csv
import re
from typing import List, Dict, Optional

HEADERS = {
    # Polite browser-like User-Agent is important to avoid quick blocking
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/120.0.0.0 Safari/537.36 TerranRedditScraper/0.1"
}

DEFAULT_URLS = [
    "https://old.reddit.com/",   # static, easiest to parse
    "https://www.reddit.com/"    # fallback — more dynamic, but we attempt basic parsing
]

REQUEST_TIMEOUT = 10  # seconds
SLEEP_BETWEEN_REQUESTS = 2  # be polite


def fetch(url: str) -> Optional[str]:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=REQUEST_TIMEOUT)
        if resp.status_code != 200:
            print(f"Error: {url} returned HTTP {resp.status_code}")
            return None
        return resp.text
    except requests.RequestException as e:
        print("Request failed:", e)
        return None


def parse_old_reddit(html: str, limit: int = 50) -> List[Dict]:
    """Parse old.reddit.com HTML which is the most stable for scraping."""
    soup = BeautifulSoup(html, "lxml")
    posts = []
    # each post is a div.thing
    things = soup.find_all("div", class_="thing", limit=limit * 3)  # grab a few in case some are ads
    for t in things:
        # skip promoted posts
        if t.get("data-promoted") == "true":
            continue

        title_tag = t.find("a", class_="title")
        if not title_tag:
            continue
        title = title_tag.get_text(strip=True)

        subreddit = t.get("data-subreddit") or (t.find("a", class_="subreddit") and t.find("a", class_="subreddit").get_text(strip=True))
        post_url = title_tag.get("href")
        if post_url and post_url.startswith("/"):
            post_url = "https://old.reddit.com" + post_url

        # score can be in data-score or in span.score
        score = t.get("data-score")
        if score is None:
            score_span = t.find("div", class_="score unvoted") or t.find("span", class_="score")
            score = score_span.get_text(strip=True) if score_span else None

        # normalize score to int when possible
        try:
            score_int = int(score)
        except Exception:
            # sometimes score is '•' or empty
            score_int = None

        # comments link
        comments_tag = t.find("a", class_="comments")
        comments_text = comments_tag.get_text(strip=True) if comments_tag else ""
        # extract comments count if it looks like "123 comments" or "comment"
        comments_count = None
        m = re.search(r"(\d+)", comments_text)
        if m:
            comments_count = int(m.group(1))
        comments_url = None
        if comments_tag:
            comments_url = comments_tag.get("href")
            if comments_url and comments_url.startswith("/"):
                comments_url = "https://old.reddit.com" + comments_url

        posts.append({
            "title": title,
            "subreddit": subreddit,
            "score": score_int,
            "comments_count": comments_count,
            "post_url": post_url,
            "comments_url": comments_url,
            "source": "old.reddit"
        })

        if len(posts) >= limit:
            break

    return posts


def parse_new_reddit(html: str, limit: int = 50) -> List[Dict]:
    """Fallback parser for the modern reddit.com HTML. This is less stable."""
    soup = BeautifulSoup(html, "lxml")
    posts = []

    # New Reddit often has article or div elements with data-testid="post-container"
    containers = soup.find_all(attrs={"data-testid": "post-container"}, limit=limit * 3)
    for c in containers:
        # title is typically in an h3
        h3 = c.find("h3")
        if not h3:
            continue
        title = h3.get_text(strip=True)

        # subreddit often inside 'a' with href like '/r/...'
        subreddit = None
        sub_link = c.find("a", href=re.compile(r"^/r/"))
        if sub_link:
            subreddit = sub_link.get_text(strip=True)

        # find link to post
        post_link = None
        a_tag = c.find("a", href=re.compile(r"^/r/"))
        if a_tag:
            href = a_tag.get("href")
            if href.startswith("/"):
                post_link = "https://www.reddit.com" + href
            else:
                post_link = href

        # public metrics: score may be in aria-label or span text like '123 points'
        score_int = None
        score_span = c.find("div", string=re.compile(r"points|point|\d+"))
        if score_span:
            m = re.search(r"(\d+)", score_span.get_text())
            if m:
                score_int = int(m.group(1))

        # comments
        comments_count = None
        comments_link = None
        comm_tag = c.find("a", href=re.compile(r"/comments/"))
        if comm_tag:
            comments_link = comm_tag.get("href")
            if comments_link.startswith("/"):
                comments_link = "https://www.reddit.com" + comments_link
            m = re.search(r"(\d+)", comm_tag.get_text())
            if m:
                comments_count = int(m.group(1))

        posts.append({
            "title": title,
            "subreddit": subreddit,
            "score": score_int,
            "comments_count": comments_count,
            "post_url": post_link,
            "comments_url": comments_link,
            "source": "www.reddit"
        })

        if len(posts) >= limit:
            break

    # If that didn't find anything, as a last resort try to pick 'div.Post'
    if not posts:
        posts_found = soup.find_all("div", class_=re.compile(r"\bPost\b"), limit=limit)
        for p in posts_found:
            title_tag = p.find("h3")
            if not title_tag:
                continue
            posts.append({
                "title": title_tag.get_text(strip=True),
                "subreddit": None,
                "score": None,
                "comments_count": None,
                "post_url": None,
                "comments_url": None,
                "source": "www.reddit-fallback"
            })
            if len(posts) >= limit:
                break

    return posts


def save_json(posts: List[Dict], filename: str = "top_posts.json"):
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(posts, f, ensure_ascii=False, indent=2)


def save_csv(posts: List[Dict], filename: str = "top_posts.csv"):
    keys = ["title", "subreddit", "score", "comments_count", "post_url", "comments_url", "source"]
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=keys)
        writer.writeheader()
        for p in posts:
            writer.writerow({k: p.get(k, "") for k in keys})


def main():
    html = None
    used_url = None
    for url in DEFAULT_URLS:
        print(f"Fetching {url}")
        html = fetch(url)
        if html:
            used_url = url
            time.sleep(SLEEP_BETWEEN_REQUESTS)
            break

    if not html:
        print("Failed to fetch Reddit front page. Consider using the API (PRAW) or a headless browser.")
        return

    # try parsing old reddit first
    posts = parse_old_reddit(html, limit=50)
    if not posts:
        print("No posts parsed from old.reddit; trying new reddit parser...")
        posts = parse_new_reddit(html, limit=50)

    # if still empty and we fetched www.reddit.com first, try old.reddit explicitly
    if not posts and used_url and "www.reddit.com" in used_url:
        print("Attempting to fetch old.reddit.com as a fallback...")
        html_old = fetch("https://old.reddit.com/")
        if html_old:
            posts = parse_old_reddit(html_old, limit=50)

    if not posts:
        print("No posts found. Reddit's front page may require JavaScript or be blocking requests. Consider using PRAW (API) or Selenium.")
        return

    # If scores are present, sort by score descending. Otherwise keep the page order.
    if any(p.get("score") is not None for p in posts):
        posts = sorted(posts, key=lambda x: (x.get("score") is not None, x.get("score") or 0), reverse=True)

    top_10 = posts[:50]

    print("\nTop posts:")
    for i, p in enumerate(top_10, 1):
        print(f"{i}. {p['title'][:120]}")
        print(f"    subreddit: {p.get('subreddit')}, score: {p.get('score')}, comments: {p.get('comments_count')}")
        print(f"    post: {p.get('post_url')}")
        print()

    save_json(top_10)
    save_csv(top_10)
    print("Saved to top_posts.json and top_posts.csv")


if __name__ == "__main__":
    main()
