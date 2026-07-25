<?php

declare(strict_types=1);

namespace App\Enum;

/**
 * Closed list of Tabler icons a profile may use as an avatar.
 *
 * Every value must have a matching file in assets/icons/tabler/, vendored with
 * `bin/console ux:icons:import tabler:<value>`. No file upload, ever.
 */
enum AvatarIcon: string
{
    case Cat = 'cat';
    case Dog = 'dog';
    case Fish = 'fish';
    case Bug = 'bug';
    case Ghost = 'ghost';
    case Robot = 'robot';
    case Alien = 'alien';
    case Star = 'star';
    case Heart = 'heart';
    case Crown = 'crown';
    case Diamond = 'diamond';
    case Rocket = 'rocket';
    case Planet = 'planet';
    case Sun = 'sun';
    case Moon = 'moon';
    case Cloud = 'cloud';
    case Snowflake = 'snowflake';
    case Umbrella = 'umbrella';
    case Leaf = 'leaf';
    case Apple = 'apple';
    case Cherry = 'cherry';
    case IceCream = 'ice-cream';
    case Balloon = 'balloon';
    case Feather = 'feather';
    case Palette = 'palette';
    case Brush = 'brush';
    case Music = 'music';
    case Headphones = 'headphones';
    case GuitarPick = 'guitar-pick';

    public function label(): string
    {
        return match ($this) {
            self::Cat => 'Chat',
            self::Dog => 'Chien',
            self::Fish => 'Poisson',
            self::Bug => 'Coccinelle',
            self::Ghost => 'Fantôme',
            self::Robot => 'Robot',
            self::Alien => 'Extraterrestre',
            self::Star => 'Étoile',
            self::Heart => 'Cœur',
            self::Crown => 'Couronne',
            self::Diamond => 'Diamant',
            self::Rocket => 'Fusée',
            self::Planet => 'Planète',
            self::Sun => 'Soleil',
            self::Moon => 'Lune',
            self::Cloud => 'Nuage',
            self::Snowflake => 'Flocon',
            self::Umbrella => 'Parapluie',
            self::Leaf => 'Feuille',
            self::Apple => 'Pomme',
            self::Cherry => 'Cerise',
            self::IceCream => 'Glace',
            self::Balloon => 'Ballon',
            self::Feather => 'Plume',
            self::Palette => 'Palette',
            self::Brush => 'Pinceau',
            self::Music => 'Note',
            self::Headphones => 'Casque',
            self::GuitarPick => 'Médiator',
        };
    }

    /**
     * @return array<string, string> label => value, for a form choice list
     */
    public static function choices(): array
    {
        $choices = [];

        foreach (self::cases() as $case) {
            $choices[$case->label()] = $case->value;
        }

        return $choices;
    }
}
