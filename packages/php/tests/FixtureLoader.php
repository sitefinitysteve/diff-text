<?php

declare(strict_types=1);

namespace PhpDiffText\Tests;

use PHPUnit\Framework\TestCase;

/**
 * Loads the canonical cross-platform fixtures from the monorepo root
 * (`fixtures/*.json`, generated from packages/core). When the PHP package is
 * used outside the monorepo (e.g. from the split mirror) the files are absent
 * and the fixture tests are skipped.
 */
final class FixtureLoader
{
    public static function dir(): string
    {
        return __DIR__ . '/../../../fixtures';
    }

    public static function path(string $name): string
    {
        return self::dir() . '/' . $name . '.json';
    }

    public static function exists(string $name): bool
    {
        return is_file(self::path($name));
    }

    /**
     * Data-provider helper: returns [caseName => [case]] or a single
     * placeholder row when the file is missing (the test then skips).
     *
     * @return array<string, array{0: array<string, mixed>|null}>
     */
    public static function cases(string $name): array
    {
        if (!self::exists($name)) {
            return ['fixture file missing' => [null]];
        }
        $data = json_decode((string) file_get_contents(self::path($name)), true, 512, JSON_THROW_ON_ERROR);
        $rows = [];
        foreach ($data as $i => $case) {
            $rows[sprintf('%03d %s', $i, $case['name'] ?? '')] = [$case];
        }
        return $rows;
    }

    /** Call at the top of a fixture test. */
    public static function requireCase(TestCase $test, ?array $case, string $name): array
    {
        if ($case === null) {
            $test->markTestSkipped("fixtures/{$name}.json not found (only available inside the monorepo)");
        }
        return $case;
    }
}
