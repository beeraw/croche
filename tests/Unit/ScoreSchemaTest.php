<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Score\ScoreSchema;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

final class ScoreSchemaTest extends TestCase
{
    #[DataProvider('timeSignatures')]
    public function testBeatsPerMeasure(string $signature, float $expected): void
    {
        self::assertSame($expected, ScoreSchema::beatsPerMeasure($signature));
    }

    /**
     * @return iterable<string, array{string, float}>
     */
    public static function timeSignatures(): iterable
    {
        yield 'common time' => ['4/4', 4.0];
        yield 'waltz' => ['3/4', 3.0];
        yield 'two four' => ['2/4', 2.0];
        yield 'compound' => ['6/8', 3.0];
        yield 'three eight' => ['3/8', 1.5];
    }

    public function testABlankDocumentHasTwoStavesInStep(): void
    {
        $content = ScoreSchema::blankContent(6);

        self::assertCount(2, $content['staves']);
        self::assertSame('treble', $content['staves'][0]['clef']);
        self::assertSame('bass', $content['staves'][1]['clef']);
        self::assertCount(6, $content['staves'][0]['measures']);
        self::assertCount(6, $content['staves'][1]['measures']);
    }

    public function testABlankDocumentAlwaysHasAtLeastOneMeasure(): void
    {
        $content = ScoreSchema::blankContent(0);

        self::assertCount(1, $content['staves'][0]['measures']);
    }

    /**
     * The four durations of the palette must add up the way the editor and the
     * validator both assume, or a measure's capacity check drifts.
     */
    public function testDurationsAreExpressedInQuarterBeats(): void
    {
        self::assertSame(4.0, ScoreSchema::DURATION_BEATS['w']);
        self::assertSame(2.0, ScoreSchema::DURATION_BEATS['h']);
        self::assertSame(1.0, ScoreSchema::DURATION_BEATS['q']);
        self::assertSame(0.5, ScoreSchema::DURATION_BEATS['8']);
        // PHP normalises the numeric key '8' to an int, hence the cast.
        self::assertSame(
            ScoreSchema::DURATIONS,
            array_map(strval(...), array_keys(ScoreSchema::DURATION_BEATS)),
        );
    }
}
