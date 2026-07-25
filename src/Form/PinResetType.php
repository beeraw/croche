<?php

declare(strict_types=1);

namespace App\Form;

use Symfony\Component\Form\AbstractType;
use Symfony\Component\Form\Extension\Core\Type\PasswordType;
use Symfony\Component\Form\FormBuilderInterface;
use Symfony\Component\OptionsResolver\OptionsResolver;
use Symfony\Component\Validator\Constraints as Assert;

final class PinResetType extends AbstractType
{
    public function buildForm(FormBuilderInterface $builder, array $options): void
    {
        $builder->add('pin', PasswordType::class, [
            'label' => 'Nouveau code à 4 chiffres',
            'always_empty' => true,
            'constraints' => [
                new Assert\NotBlank(message: 'Le code est obligatoire.'),
                new Assert\Regex(pattern: '/^\d{4}$/', message: 'Exactement 4 chiffres.'),
            ],
            'attr' => ['inputmode' => 'numeric', 'maxlength' => 4, 'autocomplete' => 'off'],
        ]);
    }

    public function configureOptions(OptionsResolver $resolver): void
    {
        $resolver->setDefaults(['data_class' => null]);
    }
}
