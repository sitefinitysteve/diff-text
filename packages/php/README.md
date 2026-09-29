# php-diff-text

PHP library to generate HTML diff output with multiple diff strategies. Zero external dependencies.

> This is a PHP variant of [vue-diff-text](https://github.com/sitefinitysteve/vue-diff-text), a Vue 3 plugin for displaying text and HTML differences. Same diff strategies, same HTML output, same CSS classes — just in PHP.

**Author:** [Steve McNiven-Scott](https://www.sitefinitysteve.com)

## Installation

```bash
composer require sitefinitysteve/php-diff-text
```

That's it — Composer's autoloader handles the rest. No service providers, no config files.

## Usage

Each diff class takes old and new text and returns HTML with `.diff-added` and `.diff-removed` spans.

### Quick start (any PHP project)

```php
use PhpDiffText\DiffText;

// One-liner — pick your strategy
echo DiffText::words('The quick brown fox', 'The slow brown fox');
echo DiffText::chars('cat', 'car');
echo DiffText::lines($oldFile, $newFile);
```

Or use the individual classes directly:

```php
use PhpDiffText\DiffWords;

echo DiffWords::render('The quick brown fox', 'The slow brown fox');

// Get raw Change[] array for custom rendering
$changes = DiffWords::diff('old text', 'new text');
```

### Laravel Blade example

In your controller:

```php
use PhpDiffText\DiffText;

public function show()
{
    return view('document.diff', [
        'diffHtml' => DiffText::words($oldVersion, $newVersion),
    ]);
}
```

In your Blade template:

```blade
{{-- Include the diff styles (in your layout or the specific view) --}}
<link rel="stylesheet" href="{{ asset('vendor/php-diff-text/style.css') }}">

{{-- Render the diff output (already safe HTML) --}}
{!! $diffHtml !!}
```

> **Tip:** Copy `vendor/sitefinitysteve/php-diff-text/css/style.css` into `public/vendor/php-diff-text/style.css`, or add it to your Vite/Mix pipeline.

Output:

```html
<div class="text-diff text-diff-words">
  <span>The</span>
  <span class="diff-removed">quick</span>
  <span class="diff-added">slow</span>
  <span>brown</span>
  <span>fox</span>
</div>
```

### Available Diff Classes

| Class | Description |
|---|---|
| `DiffChars` | Character-level diff |
| `DiffWords` | Word-level diff (ignores whitespace) |
| `DiffWordsWithSpace` | Word-level diff (whitespace-aware) |
| `DiffLines` | Line-level diff |
| `DiffSentences` | Sentence-level diff |
| `DiffHtml` | HTML-aware diff with optional similarity threshold |

All methods are static — no instantiation needed.

### DiffText Facade

The `DiffText` class is the recommended entry point:

```php
use PhpDiffText\DiffText;

DiffText::chars($old, $new);
DiffText::words($old, $new);
DiffText::wordsWithSpace($old, $new);
DiffText::lines($old, $new);
DiffText::sentences($old, $new);
DiffText::html($old, $new, similarityThreshold: 0.3);
```

### Options

All text diff classes accept an options array:

```php
DiffWords::render('Hello World', 'hello world', ['ignoreCase' => true]);
```

### HTML Diff with Similarity Threshold

`DiffHtml` supports a similarity threshold (0-1). When the texts are less similar than the threshold, it renders a "full replacement" instead of a granular diff:

```php
use PhpDiffText\DiffText;

// Word-level diff (default)
echo DiffText::html('<p>Hello world</p>', '<p>Hello Vue world</p>');

// Full replacement when texts are very different
echo DiffText::html(
    'Original long paragraph about insurance policies...',
    'Item 1: House. Item 2: Car.',
    similarityThreshold: 0.3
);
```

### Similarity Utility

Compute text similarity directly:

```php
use PhpDiffText\Similarity;

$score = Similarity::compute('Hello world', 'Hello worlds');
// Returns float 0-1 (Dice coefficient)
```

### Styling

Include the bundled CSS for default diff styling:

```html
<link rel="stylesheet" href="vendor/sitefinitysteve/php-diff-text/css/style.css">
```

Or copy it into your asset pipeline. Customize with CSS variables:

```css
:root {
  --text-diff-added-bg: #ddfbe6;
  --text-diff-added-color: #008000;
  --text-diff-removed-bg: #fce9e9;
  --text-diff-removed-color: #c70000;
  --text-diff-removed-decoration: line-through;
}
```

## Testing

```bash
composer install
composer test
```

## Publishing to Packagist

### First-time setup

1. Create a GitHub repository:
   ```bash
   cd php-diff-text
   git init
   git add .
   git commit -m "Initial release"
   gh repo create sitefinitysteve/php-diff-text --public --source=. --push
   ```

2. Register on [Packagist](https://packagist.org):
   - Log in with your GitHub account
   - Click "Submit" and enter the GitHub repo URL
   - Packagist will auto-detect the `composer.json`

3. Set up auto-updating (recommended):
   - On Packagist, go to your package settings and grab the API token
   - On GitHub, go to repo Settings > Webhooks > Add webhook
   - Payload URL: `https://packagist.org/api/github?username=sitefinitysteve`
   - Content type: `application/json`
   - Secret: your Packagist API token
   - Events: "Just the push event"

### Releasing a new version

Tag a release and push:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Or use GitHub Releases:

```bash
gh release create v1.0.0 --title "v1.0.0" --notes "Initial release"
```

Packagist picks up the new tag automatically via the webhook.

### GitHub Actions (optional auto-test on release)

Create `.github/workflows/tests.yml`:

```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        php: ['8.1', '8.2', '8.3', '8.4']
    steps:
      - uses: actions/checkout@v4
      - uses: shivammathur/setup-php@v2
        with:
          php-version: ${{ matrix.php }}
      - run: composer install --no-interaction
      - run: composer test
```

## License

MIT

---

Made with ❤️ by [sitefinitysteve](https://www.sitefinitysteve.com)
