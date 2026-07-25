<?php

declare(strict_types=1);

namespace App\Tests\Unit;

use App\Score\ScoreContentException;
use App\Score\ScoreContentValidator;
use App\Score\ScoreSchema;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

use function sprintf;

/**
 * The client is never trusted for structure, so this is the load-bearing test:
 * anything that does not match ScoreSchema has to be refused.
 */
final class ScoreContentValidatorTest extends TestCase
{
    private ScoreContentValidator $validator;

    protected function setUp(): void
    {
        $this->validator = new ScoreContentValidator();
    }

    public function testAcceptsABlankDocument(): void
    {
        $content = ScoreSchema::blankContent();

        self::assertSame($content, $this->validator->validate($content));
    }

    public function testAcceptsARealisticDocument(): void
    {
        $content = $this->document([
            ['notes' => [$this->note('c/4', 'q'), $this->note('d/4', 'q'), $this->note('e/4', 'h')]],
        ], [
            ['notes' => [$this->note('c/3', 'w')]],
        ]);

        self::assertSame($content, $this->validator->validate($content));
    }

    /**
     * The normalised document is rebuilt key by key, so anything the client
     * slipped in that the schema does not describe never reaches the database.
     */
    public function testStripsUnknownProperties(): void
    {
        $content = $this->document([['notes' => [
            $this->note('c/4', 'q') + ['colour' => 'red', 'velocity' => 99],
        ]]], [['notes' => []]]);
        $content['injected'] = 'nope';

        $result = $this->validator->validate($content);

        self::assertArrayNotHasKey('injected', $result);
        self::assertSame(
            ['keys', 'duration', 'accidental', 'rest'],
            array_keys($result['staves'][0]['measures'][0]['notes'][0]),
        );
    }

    public function testRejectsAnotherSchemaVersion(): void
    {
        $content = ScoreSchema::blankContent();
        $content['schemaVersion'] = 2;

        $this->expectExceptionKey('api.schema_version', $content);
    }

    public function testRejectsStavesOfDifferentLengths(): void
    {
        $content = $this->document(
            [['notes' => []], ['notes' => []]],
            [['notes' => []]],
        );

        $this->expectExceptionKey('api.measures_must_match', $content);
    }

    public function testRejectsAnOverfullMeasure(): void
    {
        $content = $this->document(
            [['notes' => [$this->note('c/4', 'w'), $this->note('d/4', 'q')]]],
            [['notes' => []]],
        );

        $this->expectExceptionKey('api.measure_overfull', $content);
    }

    public function testAcceptsAMeasureFilledExactly(): void
    {
        $content = $this->document(
            [['notes' => array_fill(0, 8, $this->note('c/4', '8'))]],
            [['notes' => []]],
        );

        self::assertSame($content, $this->validator->validate($content));
    }

    public function testRejectsASwappedClef(): void
    {
        $content = $this->document([['notes' => []]], [['notes' => []]]);
        $content['staves'][1]['clef'] = 'treble';

        $this->expectExceptionKey('api.wrong_clef', $content);
    }

    public function testRejectsAThirdStave(): void
    {
        $content = $this->document([['notes' => []]], [['notes' => []]]);
        $content['staves'][] = ['clef' => 'treble', 'measures' => [['notes' => []]]];

        $this->expectExceptionKey('api.stave_count', $content);
    }

    #[DataProvider('badPitches')]
    public function testRejectsAnInvalidPitch(mixed $keys): void
    {
        $content = $this->document(
            [['notes' => [['keys' => $keys, 'duration' => 'q', 'accidental' => null, 'rest' => false]]]],
            [['notes' => []]],
        );

        $this->expectExceptionKey('api.invalid_pitch', $content);
    }

    /**
     * @return iterable<string, array{mixed}>
     */
    public static function badPitches(): iterable
    {
        yield 'letter beyond G' => [['h/4']];
        yield 'octave out of range' => [['c/9']];
        yield 'accidental baked into the key' => [['c#/4']];
        yield 'not an array' => ['c/4'];
        yield 'empty' => [[]];
        yield 'wrong separator' => [['c-4']];
    }

    #[DataProvider('badTempos')]
    public function testRejectsAnInvalidTempo(mixed $tempo, string $key): void
    {
        $content = ScoreSchema::blankContent();
        $content['tempo'] = $tempo;

        $this->expectExceptionKey($key, $content);
    }

    /**
     * @return iterable<string, array{mixed, string}>
     */
    public static function badTempos(): iterable
    {
        yield 'too slow' => [10, 'api.tempo_range'];
        yield 'too fast' => [400, 'api.tempo_range'];
        yield 'a string' => ['90', 'api.tempo_integer'];
        yield 'fractional' => [90.5, 'api.tempo_integer'];
    }

    public function testRejectsAnUnknownDuration(): void
    {
        $content = $this->document(
            [['notes' => [['keys' => ['c/4'], 'duration' => '16', 'accidental' => null, 'rest' => false]]]],
            [['notes' => []]],
        );

        $this->expectExceptionKey('api.invalid_value', $content);
    }

    /**
     * A rest is positioned by its key but carries no accidental, so one sent
     * by the client is dropped rather than stored.
     */
    public function testClearsTheAccidentalOfARest(): void
    {
        $content = $this->document(
            [['notes' => [['keys' => ['b/4'], 'duration' => 'q', 'accidental' => '#', 'rest' => true]]]],
            [['notes' => []]],
        );

        $result = $this->validator->validate($content);

        self::assertNull($result['staves'][0]['measures'][0]['notes'][0]['accidental']);
    }

    public function testRejectsMoreMeasuresThanAllowed(): void
    {
        $measures = array_fill(0, ScoreSchema::MAX_MEASURES + 1, ['notes' => []]);

        $this->expectExceptionKey('api.too_many_measures', $this->document($measures, $measures));
    }

    public function testRejectsAStaveWithoutMeasures(): void
    {
        $this->expectExceptionKey('api.measure_required', $this->document([], []));
    }

    public function testRejectsSomethingThatIsNotAnObject(): void
    {
        $this->expectException(ScoreContentException::class);
        $this->validator->validate('not a document');
    }

    /**
     * @param array<string, mixed> $content
     */
    private function expectExceptionKey(string $key, array|string $content): void
    {
        try {
            $this->validator->validate($content);
        } catch (ScoreContentException $exception) {
            self::assertSame($key, $exception->getKey());

            return;
        }

        self::fail(sprintf('Expected the document to be refused with "%s".', $key));
    }

    /**
     * @param list<array<string, mixed>> $treble
     * @param list<array<string, mixed>> $bass
     *
     * @return array<string, mixed>
     */
    private function document(array $treble, array $bass): array
    {
        return [
            'schemaVersion' => ScoreSchema::VERSION,
            'keySignature' => 'C',
            'timeSignature' => '4/4',
            'tempo' => 90,
            'staves' => [
                ['clef' => 'treble', 'measures' => $treble],
                ['clef' => 'bass', 'measures' => $bass],
            ],
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function note(string $key, string $duration): array
    {
        return ['keys' => [$key], 'duration' => $duration, 'accidental' => null, 'rest' => false];
    }
}
