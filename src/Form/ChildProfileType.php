<?php

declare(strict_types=1);

namespace App\Form;

use App\Entity\User;
use App\Enum\AvatarIcon;
use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Extension\Core\Type\ChoiceType;
use Symfony\Component\Form\Extension\Core\Type\PasswordType;
use Symfony\Component\Form\Extension\Core\Type\TextType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;
use Symfony\Component\Validator\Constraints as Assert;

/**
 * Create or edit a child profile. The PIN is only asked for on creation, or
 * when the admin deliberately resets it.
 */
final class ChildProfileType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder
            ->add('displayName', TextType::class, [
                'label' => 'Prénom',
                'attr' => ['autocapitalize' => 'words'],
            ])
            ->add('username', TextType::class, [
                'label' => 'Identifiant',
                'help' => 'Minuscules, sans espace. Sert uniquement en interne.',
                'attr' => ['autocapitalize' => 'none', 'spellcheck' => 'false'],
            ])
            ->add('avatarIcon', ChoiceType::class, [
                'label' => 'Avatar',
                'choices' => AvatarIcon::cases(),
                'choice_label' => static fn (AvatarIcon $icon): string => $icon->label(),
                'choice_value' => static fn (?AvatarIcon $icon): string => $icon?->value ?? '',
                'expanded' => true,
                'multiple' => false,
            ]);

        if ($options['require_pin']) {
            $builder->add('pin', PasswordType::class, [
                'label' => 'Code à 4 chiffres',
                'mapped' => false,
                'always_empty' => true,
                'constraints' => [
                    new Assert\NotBlank(message: 'Le code est obligatoire.'),
                    new Assert\Regex(pattern: '/^\d{4}$/', message: 'Exactement 4 chiffres.'),
                ],
                'attr' => ['inputmode' => 'numeric', 'maxlength' => 4, 'autocomplete' => 'off'],
            ]);
        }
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults([
            'data_class' => User::class,
            'require_pin' => false,
        ]);

        $resolver->setAllowedTypes('require_pin', 'bool');
    }
}
