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

    /** Translation key for the human-readable name. */
    public function label(): string
    {
        return 'avatar.'.$this->value;
    }
}
