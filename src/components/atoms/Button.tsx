import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const VARIANT_CLASSES = {
  primary:
    'primary bg-surface-alternate py-fixed-s text-fluid-m text-fg-alternate disabled:cursor-not-allowed disabled:bg-gray-20',
  secondary:
    'secondary mt-fixed-xs bg-surface-secondary py-fixed-xs text-fluid-s text-fg-primary hover:bg-surface-tertiary'
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANT_CLASSES;
}

/** Full-width phone sheet action button. */
export default function Button({
  variant = 'primary',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'w-full cursor-pointer rounded-lg font-semibold',
        VARIANT_CLASSES[variant],
        className
      )}
      {...props}
    />
  );
}
