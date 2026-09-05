#!/usr/bin/env python3
"""Draft the next queued post and stage it as a review-pending draft.

Nothing this script writes ever goes live on its own: the post is added to
posts/index.json with "draft": true, and the workflow opens a pull request.
Two deliberate gates — merge the PR, then flip draft to false.
"""

import datetime as dt
import json
import os
import pathlib
import re
import sys

import anthropic

ROOT = pathlib.Path(__file__).resolve().parents[2]
POSTS = ROOT / "posts"
QUEUE = POSTS / "queue.md"
VOICE = POSTS / "VOICE.md"
INDEX = POSTS / "index.json"

MODEL = "claude-sonnet-5"


def next_topic(text):
    """First unticked queue item, with its line index."""
    for i, line in enumerate(text.splitlines()):
        m = re.match(r"^- \[ \] (.+?)\s*$", line)
        if m:
            return i, m.group(1)
    return None, None


def slugify(title):
    s = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return s[:70].rstrip("-")


def example_post():
    """Most recent existing post body, as a style anchor."""
    files = sorted(POSTS.glob("*.html"), reverse=True)
    if not files:
        return ""
    html = files[0].read_text(encoding="utf-8")
    m = re.search(r'<div class="prose open__body">(.*?)</div>', html, re.S)
    return m.group(1).strip() if m else ""


PROMPT = """You are drafting a blog post that will be published under Stuart Cameron Smith's \
name on his professional website, after he has read and approved it.

Write in his voice. The voice guide is authoritative — follow every rule in it:

<voice_guide>
{voice}
</voice_guide>

Here is a post he has already published, as a style anchor. Match its register, sentence \
rhythm and level of concreteness. Do not reuse its wording or its structure.

<example>
{example}
</example>

Today's topic:

<topic>{topic}</topic>

Write the body of the post as HTML: a sequence of <p> elements only. You may use <em> for \
emphasis, <q> for short quoted phrases, and <a href="..."> for links to primary sources. \
No headings, no lists, no images, no <div>. Use typographic punctuation — curly quotes, \
em dashes, en dashes in ranges.

Only link to a URL if you are confident it is real and stable — a DOI, an official EPO or \
UKIPO page, a journal landing page. It is better to describe a source in words than to \
invent a link. Do not state any fact about Stuart that is not in the voice guide.

Return a JSON object and nothing else:

{{"title": "<six words or fewer, sentence case, no colon>",
  "summary": "<one or two sentences for the index page>",
  "body_html": "<the <p> elements>"}}"""


TEMPLATE = """<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{title} — Stuart Cameron Smith</title>
<meta name="description" content="{summary_attr}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,600;1,6..72,400&display=swap">
<link rel="stylesheet" href="../site.css">
</head>
<body>

<a class="skip" href="#post">Skip to content</a>

<div class="topbar">
  <a class="topbar__mark" href="../index.html">Stuart&nbsp;C.&nbsp;Smith</a>
  <a class="topbar__link" href="../index.html#writing">All writing</a>
</div>

<main class="doc" style="padding-inline-start: max(var(--space-lg), env(safe-area-inset-left))">
  <article class="sec sec--open" id="post">
    <p class="open__creds">{date_readable} · Notes</p>
    <h1 style="margin-block-start: var(--space-md)">{title}</h1>

    <div class="prose open__body" style="margin-block-start: var(--space-lg)">
{body}
    </div>

    <hr class="hr">

    <div class="prose">
      <p class="sec__note">Nothing here is legal advice, and I am not yet qualified to give any.</p>
    </div>

    <div class="actions">
      <a class="btn" href="../index.html#writing">More writing</a>
      <a class="btn" href="../index.html#contact">Get in touch</a>
    </div>
  </article>
</main>

<footer class="colophon">
  <div class="colophon__inner" style="padding-inline-start: max(var(--space-lg), env(safe-area-inset-left))">
    <p>Stuart Cameron Smith. ORCID <a href="https://orcid.org/0000-0001-7149-0463" rel="noopener">0000-0001-7149-0463</a>. Views my own, not those of Durham University or any collaborator.</p>
  </div>
</footer>

</body>
</html>
"""


def main():
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        sys.exit("ANTHROPIC_API_KEY is not set. Add it as a repository secret.")

    queue_text = QUEUE.read_text(encoding="utf-8")
    line_no, topic = next_topic(queue_text)
    if not topic:
        print("::notice::Topic queue is empty — nothing to draft. Add topics to posts/queue.md.")
        return

    print(f"Drafting: {topic}")

    client = anthropic.Anthropic(api_key=key)
    msg = client.messages.create(
        model=MODEL,
        max_tokens=4000,
        messages=[{
            "role": "user",
            "content": PROMPT.format(
                voice=VOICE.read_text(encoding="utf-8"),
                example=example_post(),
                topic=topic,
            ),
        }],
    )

    raw = msg.content[0].text.strip()
    raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw).strip()
    post = json.loads(raw)

    today = dt.date.today()
    slug = slugify(post["title"])
    filename = f"{today.isoformat()}-{slug}.html"

    body = "\n".join(
        "      " + ln.strip()
        for ln in post["body_html"].strip().splitlines()
        if ln.strip()
    )

    (POSTS / filename).write_text(
        TEMPLATE.format(
            title=post["title"],
            summary_attr=post["summary"].replace('"', "&quot;"),
            date_readable=today.strftime("%-d %B %Y") if os.name != "nt" else today.strftime("%d %B %Y"),
            body=body,
        ),
        encoding="utf-8",
    )

    index = json.loads(INDEX.read_text(encoding="utf-8"))
    index["posts"].insert(0, {
        "date": today.isoformat(),
        "title": post["title"],
        "summary": post["summary"],
        "url": f"posts/{filename}",
        "venue": "Notes",
        "draft": True,
    })
    INDEX.write_text(json.dumps(index, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    lines = queue_text.splitlines()
    lines[line_no] = lines[line_no].replace("- [ ]", "- [x]", 1)
    QUEUE.write_text("\n".join(lines) + "\n", encoding="utf-8")

    with open(os.environ.get("GITHUB_OUTPUT", os.devnull), "a", encoding="utf-8") as fh:
        fh.write(f"title={post['title']}\n")
        fh.write(f"filename={filename}\n")
        fh.write("drafted=true\n")

    print(f"Wrote posts/{filename}")


if __name__ == "__main__":
    main()
