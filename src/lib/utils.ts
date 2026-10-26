import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge that text-fluid-* (from globals.css @theme) is a font
// size, not a text colour, so it survives next to text-fg-* and friends.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'fluid-xs',
            'fluid-s',
            'fluid-m',
            'fluid-l',
            'fluid-xl',
            'fluid-2xl',
            'fluid-3xl',
            'fluid-4xl',
            'fluid-5xl'
          ]
        }
      ]
    }
  }
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
