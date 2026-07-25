<?php

declare(strict_types=1);

namespace App\Score;

/**
 * The shape of Score::$content, version 1.
 *
 * Kept in one place so the validator, the factory and the fixtures agree, and
 * so a future version 2 has an obvious place to diverge from.
 *
 * The JavaScript counterpart is assets/js/score/schema.js — change both.
 */
final class ScoreSchema
{
    public const int VERSION = 1;

    public const int MAX_MEASURES = 64;
    public const int MAX_NOTES_PER_MEASURE = 32;
    public const int MAX_KEYS_PER_NOTE = 4;

    public const int TEMPO_MIN = 40;
    public const int TEMPO_MAX = 208;
    public const int TEMPO_DEFAULT = 90;

    /** Treble first, bass second. The editor assumes exactly these two. */
    public const array CLEFS = ['treble', 'bass'];

    public const array KEY_SIGNATURES = [
        'C', 'G', 'D', 'A', 'E', 'B', 'F#',
        'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb',
    ];

    public const array TIME_SIGNATURES = ['2/4', '3/4', '4/4', '6/8', '3/8'];

    /** Whole, half, quarter, eighth — the four the palette offers. */
    public const array DURATIONS = ['w', 'h', 'q', '8'];

    /** Duration in quarter-note beats. */
    public const array DURATION_BEATS = [
        'w' => 4.0,
        'h' => 2.0,
        'q' => 1.0,
        '8' => 0.5,
    ];

    public const array ACCIDENTALS = ['#', 'b', 'n'];

    /** Lowest and highest pitch the virtual keyboard and the staves accept. */
    public const int MIN_OCTAVE = 1;
    public const int MAX_OCTAVE = 7;

    public const string KEY_PATTERN = '/^[a-g]\/[1-7]$/';

    /**
     * How many quarter-note beats a measure holds under this time signature.
     */
    public static function beatsPerMeasure(string $timeSignature): float
    {
        [$beats, $unit] = array_map(intval(...), explode('/', $timeSignature));

        if ($unit <= 0) {
            return 4.0;
        }

        return $beats * (4.0 / $unit);
    }

    /**
     * A brand-new, empty two-stave document.
     *
     * @return array<string, mixed>
     */
    public static function blankContent(int $measures = 4): array
    {
        $emptyMeasures = array_fill(0, max(1, $measures), ['notes' => []]);

        return [
            'schemaVersion' => self::VERSION,
            'keySignature' => 'C',
            'timeSignature' => '4/4',
            'tempo' => self::TEMPO_DEFAULT,
            'staves' => [
                ['clef' => 'treble', 'measures' => $emptyMeasures],
                ['clef' => 'bass', 'measures' => $emptyMeasures],
            ],
        ];
    }
}
