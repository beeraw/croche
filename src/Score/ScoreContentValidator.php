<?php

declare(strict_types=1);

namespace App\Score;

use function count;
use function in_array;
use function is_array;
use function is_bool;
use function is_float;
use function is_int;
use function is_string;
use function sprintf;

/**
 * Validates and normalises a score document coming from the client.
 *
 * The client is never trusted for structure: anything that does not match
 * ScoreSchema is rejected, and what is accepted is rebuilt key by key so no
 * stray property survives into the database.
 */
final class ScoreContentValidator
{
    /**
     * @param mixed $content raw decoded JSON
     *
     * @return array<string, mixed> the normalised document
     *
     * @throws ScoreContentException
     */
    public function validate(mixed $content): array
    {
        if (!is_array($content)) {
            throw new ScoreContentException('api.content_not_object');
        }

        $version = $content['schemaVersion'] ?? null;

        if (ScoreSchema::VERSION !== $version) {
            throw new ScoreContentException('api.schema_version', ['%version%' => ScoreSchema::VERSION], 'schemaVersion');
        }

        $keySignature = $this->enum($content['keySignature'] ?? null, ScoreSchema::KEY_SIGNATURES, 'keySignature');
        $timeSignature = $this->enum($content['timeSignature'] ?? null, ScoreSchema::TIME_SIGNATURES, 'timeSignature');
        $tempo = $this->tempo($content['tempo'] ?? null);
        $staves = $this->staves($content['staves'] ?? null, $timeSignature);

        return [
            'schemaVersion' => ScoreSchema::VERSION,
            'keySignature' => $keySignature,
            'timeSignature' => $timeSignature,
            'tempo' => $tempo,
            'staves' => $staves,
        ];
    }

    /**
     * @param list<string> $allowed
     */
    private function enum(mixed $value, array $allowed, string $path): string
    {
        if (!is_string($value) || !in_array($value, $allowed, true)) {
            throw new ScoreContentException('api.invalid_value', ['%path%' => $path], $path);
        }

        return $value;
    }

    private function tempo(mixed $value): int
    {
        if (!is_int($value) && !(is_float($value) && floor($value) === $value)) {
            throw new ScoreContentException('api.tempo_integer', [], 'tempo');
        }

        $tempo = (int) $value;

        if ($tempo < ScoreSchema::TEMPO_MIN || $tempo > ScoreSchema::TEMPO_MAX) {
            throw new ScoreContentException('api.tempo_range', ['%min%' => ScoreSchema::TEMPO_MIN, '%max%' => ScoreSchema::TEMPO_MAX], 'tempo');
        }

        return $tempo;
    }

    /**
     * @return list<array{clef: string, measures: list<array{notes: list<array<string, mixed>>}>}>
     */
    private function staves(mixed $staves, string $timeSignature): array
    {
        if (!is_array($staves) || count($staves) !== count(ScoreSchema::CLEFS)) {
            throw new ScoreContentException('api.stave_count', ['%count%' => count(ScoreSchema::CLEFS)], 'staves');
        }

        $capacity = ScoreSchema::beatsPerMeasure($timeSignature);
        $normalised = [];
        $measureCount = null;

        foreach (array_values($staves) as $index => $stave) {
            $path = sprintf('staves[%d]', $index);

            if (!is_array($stave)) {
                throw new ScoreContentException('api.invalid_stave', [], $path);
            }

            $expectedClef = ScoreSchema::CLEFS[$index];

            if (($stave['clef'] ?? null) !== $expectedClef) {
                throw new ScoreContentException('api.wrong_clef', ['%index%' => $index + 1, '%clef%' => $expectedClef], $path.'.clef');
            }

            $measures = $stave['measures'] ?? null;

            if (!is_array($measures) || [] === $measures) {
                throw new ScoreContentException('api.measure_required', [], $path.'.measures');
            }

            if (count($measures) > ScoreSchema::MAX_MEASURES) {
                throw new ScoreContentException('api.too_many_measures', ['%max%' => ScoreSchema::MAX_MEASURES], $path.'.measures');
            }

            // The invariant the whole editor rests on: both staves stay in step.
            if (null === $measureCount) {
                $measureCount = count($measures);
            } elseif (count($measures) !== $measureCount) {
                throw new ScoreContentException('api.measures_must_match', [], $path.'.measures');
            }

            $normalised[] = [
                'clef' => $expectedClef,
                'measures' => $this->measures(array_values($measures), $capacity, $path),
            ];
        }

        return $normalised;
    }

    /**
     * @param list<mixed> $measures
     *
     * @return list<array{notes: list<array<string, mixed>>}>
     */
    private function measures(array $measures, float $capacity, string $parentPath): array
    {
        $normalised = [];

        foreach ($measures as $index => $measure) {
            $path = sprintf('%s.measures[%d]', $parentPath, $index);

            if (!is_array($measure)) {
                throw new ScoreContentException('api.invalid_measure', [], $path);
            }

            $notes = $measure['notes'] ?? [];

            if (!is_array($notes)) {
                throw new ScoreContentException('api.invalid_measure', [], $path.'.notes');
            }

            if (count($notes) > ScoreSchema::MAX_NOTES_PER_MEASURE) {
                throw new ScoreContentException('api.too_many_notes', [], $path.'.notes');
            }

            $beats = 0.0;
            $normalisedNotes = [];

            foreach (array_values($notes) as $noteIndex => $note) {
                $normalisedNote = $this->note($note, sprintf('%s.notes[%d]', $path, $noteIndex));
                $beats += ScoreSchema::DURATION_BEATS[$normalisedNote['duration']];
                $normalisedNotes[] = $normalisedNote;
            }

            // Same rule as the editor: a measure never holds more than it can.
            if ($beats - $capacity > 0.0001) {
                throw new ScoreContentException('api.measure_overfull', ['%index%' => $index + 1], $path.'.notes');
            }

            $normalised[] = ['notes' => $normalisedNotes];
        }

        return $normalised;
    }

    /**
     * @return array{keys: list<string>, duration: string, accidental: string|null, rest: bool}
     */
    private function note(mixed $note, string $path): array
    {
        if (!is_array($note)) {
            throw new ScoreContentException('api.invalid_note', [], $path);
        }

        $duration = $this->enum($note['duration'] ?? null, ScoreSchema::DURATIONS, $path.'.duration');
        $rest = $note['rest'] ?? false;

        if (!is_bool($rest)) {
            throw new ScoreContentException('api.invalid_note', [], $path.'.rest');
        }

        $keys = $note['keys'] ?? null;

        if (!is_array($keys) || [] === $keys || count($keys) > ScoreSchema::MAX_KEYS_PER_NOTE) {
            throw new ScoreContentException('api.invalid_pitch', [], $path.'.keys');
        }

        $normalisedKeys = [];

        foreach (array_values($keys) as $key) {
            if (!is_string($key) || 1 !== preg_match(ScoreSchema::KEY_PATTERN, $key)) {
                throw new ScoreContentException('api.invalid_pitch', [], $path.'.keys');
            }

            $normalisedKeys[] = $key;
        }

        $accidental = $note['accidental'] ?? null;

        if (null !== $accidental) {
            $accidental = $this->enum($accidental, ScoreSchema::ACCIDENTALS, $path.'.accidental');
        }

        // A rest has no accidental; its key only positions the glyph on the staff.
        if ($rest) {
            $accidental = null;
        }

        return [
            'keys' => $normalisedKeys,
            'duration' => $duration,
            'accidental' => $accidental,
            'rest' => $rest,
        ];
    }
}
