<?php

declare(strict_types=1);

/*
 * php-diff-text demo: the shared diff-text demo page, rendered server-side.
 *
 *   composer demo:sync                          # copy demo.css + content.json from ../../demo
 *   php -S 127.0.0.1:8080 -t packages/php/demo  # from the monorepo root (or: composer demo)
 *
 * Structure and class names follow demo/README.md (the template contract).
 * No JavaScript: the granularity switch is CSS-only radios, and collapsed rows are static.
 */

use PhpDiffText\DiffText;

$vendor = __DIR__ . '/../vendor/autoload.php';
if (is_file($vendor)) {
    require $vendor;
} else {
    // No `composer install` yet: autoload the library straight from src/.
    spl_autoload_register(static function (string $class): void {
        if (str_starts_with($class, 'PhpDiffText\\')) {
            $file = __DIR__ . '/../src/' . str_replace('\\', '/', substr($class, 12)) . '.php';
            if (is_file($file)) {
                require $file;
            }
        }
    });
}

/** @var array{hero: array{old: string, new: string}, modes: list<array<string, string>>, document: array{title: string, old: string, new: string}} $content */
$content = json_decode((string) file_get_contents(__DIR__ . '/content.json'), true, 512, JSON_THROW_ON_ERROR);

function e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
}

/** One text mode, by content key. */
function diffFor(string $mode, string $old, string $new): string
{
    return match ($mode) {
        'chars' => DiffText::chars($old, $new),
        'words' => DiffText::words($old, $new),
        'wordsWithSpace' => DiffText::wordsWithSpace($old, $new),
        'sentences' => DiffText::sentences($old, $new),
        'lines' => DiffText::lines($old, $new),
        'html' => DiffText::html($old, $new),
    };
}

$hero = $content['hero'];
$doc = $content['document'];
$grains = array_values(array_filter($content['modes'], static fn (array $m): bool => $m['key'] !== 'html'));
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>php-diff-text demo</title>
<meta name="description" content="Server-rendered demo of php-diff-text: character, word, sentence, line, and HTML diffs, plus side-by-side and unified document views.">
<?php /* The library stylesheet lives at ../css/style.css, outside this docroot, so it is inlined.
         In an app, serve or publish css/style.css and <link> it instead. */ ?>
<style><?= file_get_contents(__DIR__ . '/../css/style.css') ?></style>
<link rel="stylesheet" href="demo.css">
</head>
<body>
<div class="demo">
  <header class="demo-bar">
    <div class="demo-mark"><span class="del">diff</span><span class="add">text</span></div>
    <nav class="demo-platforms" aria-label="Platforms"><span>Vue</span><span>React</span><span aria-current="true">PHP</span></nav>
  </header>

  <section class="demo-hero">
    <div class="demo-hero-top">
      <h1>Show readers exactly what changed.</h1>
      <div>
        <p class="lede">Diff components for Vue, React, and PHP. Compare text by character, word, sentence, or line, or compare rich HTML without breaking its markup.</p>
        <code class="demo-install">composer require sitefinitysteve/php-diff-text</code>
      </div>
    </div>
    <div class="grain">
<?php foreach ($grains as $m): ?>
      <input type="radio" name="grain" id="g-<?= e($m['key']) ?>"<?= $m['key'] === 'words' ? ' checked' : '' ?>><label for="g-<?= e($m['key']) ?>"><?= e($m['title']) ?></label>
<?php endforeach; ?>
      <div class="stage">
<?php foreach ($grains as $m): ?>
        <div class="stage-out" data-grain="<?= e($m['key']) ?>"><?= diffFor($m['key'], $hero['old'], $hero['new']) ?><div class="stage-meta"><?= DiffText::stats($hero['old'], $hero['new'], ['mode' => $m['key']]) ?><code><?= e($m['php']) ?>()</code></div></div>
<?php endforeach; ?>
      </div>
    </div>
  </section>

  <section class="demo-section" id="granularity">
    <h2>Pick the right granularity</h2>
    <p>Each mode breaks the text into different pieces before comparing. Smaller pieces catch typos. Larger pieces keep rewrites readable.</p>
    <div class="specimens">
<?php foreach ($content['modes'] as $m): ?>
      <article class="specimen">
        <header><h3><?= e($m['title']) ?></h3><code><?= e($m['php']) ?>()</code></header>
        <p class="use"><?= e($m['use']) ?></p>
        <dl class="inputs"><dt class="old">&minus;</dt><dd><?= e($m['old']) ?></dd><dt class="new">+</dt><dd><?= e($m['new']) ?></dd></dl>
        <div class="result"><?= diffFor($m['key'], $m['old'], $m['new']) ?></div>
      </article>
<?php endforeach; ?>
    </div>
  </section>

  <section class="demo-section" id="document">
    <h2>Review a whole document</h2>
    <p>For longer text, compare line by line. Unchanged stretches fold away, and edited lines show which words changed.</p>
    <div class="doc">
      <div class="doc-head"><h3>Side by side</h3><div class="doc-tags"><code>DiffText::split()</code></div></div>
      <div class="doc-body"><?= DiffText::split($doc['old'], $doc['new']) ?></div>
    </div>
    <div class="doc">
      <div class="doc-head"><h3>Unified, with folded context</h3><div class="doc-tags"><?= DiffText::stats($doc['old'], $doc['new'], ['mode' => 'unified', 'contextLines' => 2]) ?><code>DiffText::unified()</code></div></div>
      <div class="doc-body"><?= DiffText::unified($doc['old'], $doc['new'], ['contextLines' => 2]) ?></div>
    </div>
  </section>

  <section class="demo-section" id="usage">
    <h2>Use it</h2>
    <pre class="usage"><span class="c">// composer require sitefinitysteve/php-diff-text</span>
use PhpDiffText\DiffText;

echo DiffText::words($before, $after);
echo DiffText::split($before, $after, ['contextLines' =&gt; 3]);
echo DiffText::stats($before, $after, ['mode' =&gt; 'unified']);
<span class="c">// then link css/style.css from the package</span></pre>
  </section>

  <footer class="demo-foot">MIT licensed. Available as vue-diff-text, react-diff-text, and sitefinitysteve/php-diff-text.</footer>
</div>
</body>
</html>
