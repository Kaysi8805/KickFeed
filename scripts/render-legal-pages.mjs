import { readFileSync, writeFileSync } from 'node:fs';

const legal = JSON.parse(readFileSync(new URL('../content/legal.json', import.meta.url), 'utf8'));

function page(kind, filename) {
  const doc = legal[kind];
  const sections = doc.sections
    .map(
      (section) => `      <section>
        <h2>${section.heading}</h2>
        <p>${section.body}</p>
      </section>`,
    )
    .join('\n');
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${doc.title} — KickFeed</title>
    <meta name="theme-color" content="#050805" />
    <link rel="icon" href="./favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="./styles.css" />
    <style>
      .legal { max-width: 720px; margin: 0 auto; padding: 32px 20px 80px; }
      .legal h1 { font-size: 2rem; letter-spacing: -0.03em; margin: 0 0 8px; }
      .legal .updated { color: var(--muted); margin-top: 0; }
      .legal h2 { font-size: 1.05rem; margin: 28px 0 8px; }
      .legal p { margin: 0; color: var(--text); }
      .legal section + section h2 { margin-top: 28px; }
    </style>
  </head>
  <body>
    <header class="nav">
      <a class="brand" href="./index.html">
        <span class="mark" aria-hidden="true"></span>
        KickFeed
      </a>
      <nav>
        <a href="./privacy.html">Privacy</a>
        <a href="./terms.html">Terms</a>
      </nav>
    </header>
    <main class="legal">
      <h1>${doc.title}</h1>
      <p class="updated">Updated ${legal.updated}. The same text is in the KickFeed app under Profile.</p>
${sections}
    </main>
    <footer>
      <p>KickFeed · <a href="./index.html">Home</a> · <a href="./privacy.html">Privacy</a> · <a href="./terms.html">Terms</a></p>
    </footer>
  </body>
</html>
`;
  writeFileSync(new URL(`../landing/${filename}`, import.meta.url), html);
}

page('privacy', 'privacy.html');
page('terms', 'terms.html');
