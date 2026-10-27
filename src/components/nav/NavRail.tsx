'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CarFront,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  type LucideIcon
} from 'lucide-react';
import If from '@/lib/If';
import { cn } from '@/lib/utils';

const NAV_EXPANDED_STORAGE_KEY: string = 'mini-uber.nav-expanded.v1';
export const NAV_RAIL_ID: string = 'nav-rail';

interface NavItem {
  href: string;
  label: string;
  Icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Simulator', Icon: CarFront },
  { href: '/census', label: 'Census', Icon: Users }
];

/**
 * Fixed left rail: icons when collapsed (w-14, matched by the layout's
 * content padding), labels when expanded. Expanding overlays the page so the
 * maps underneath never resize.
 */
export default function NavRail() {
  const pathname: string = usePathname();
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  // Read after mount: the server always renders collapsed.
  useEffect(() => {
    try {
      setIsExpanded(localStorage.getItem(NAV_EXPANDED_STORAGE_KEY) === 'true');
    } catch {
      // Storage blocked: stay collapsed.
    }
  }, []);

  const handleToggle = () => {
    const nextIsExpanded: boolean = !isExpanded;
    setIsExpanded(nextIsExpanded);
    try {
      localStorage.setItem(NAV_EXPANDED_STORAGE_KEY, String(nextIsExpanded));
    } catch {
      // Storage blocked: the rail just won't remember its state.
    }
  };

  return (
    // Above the map drawers (z-1100) and Leaflet controls (z-1000).
    <nav
      id={NAV_RAIL_ID}
      aria-label="Main"
      className={cn(
        'nav-rail fixed inset-y-0 left-0 z-[1200] flex flex-col overflow-hidden border-r border-stroke-secondary bg-gray-90 text-fluid-s text-gray-10 transition-[width,box-shadow] duration-200 ease-out motion-reduce:transition-none',
        isExpanded ? 'w-50 shadow-xl' : 'w-14'
      )}
    >
      {/* 10 + 30 + 10px plus the list's 1px top border lines up with the
          top bars (py-fixed-2xs around a min-h-fixed-5xl control). */}
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={NAV_RAIL_ID}
        aria-label={isExpanded ? 'Collapse navigation' : 'Expand navigation'}
        onClick={handleToggle}
        className="m-fixed-2xs flex h-fixed-5xl w-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-gray-30 transition-colors duration-150 hover:bg-gray-80 hover:text-gray-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus"
      >
        <If
          condition={isExpanded}
          then={<PanelLeftClose className="size-5" aria-hidden />}
          else={<PanelLeftOpen className="size-5" aria-hidden />}
        />
      </button>
      <ul className="flex flex-col gap-1.5 border-t border-stroke-secondary p-fixed-2xs">
        {NAV_ITEMS.map(({ href, label, Icon }: NavItem) => {
          const isActive: boolean = pathname === href;
          return (
            <li key={href}>
              {/* The active item gets a teal bar on the rail's left edge. */}
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                title={isExpanded ? undefined : label}
                className="relative flex h-9 items-center gap-fixed-xs rounded-md px-2 whitespace-nowrap text-gray-30 transition-colors duration-150 before:absolute before:inset-y-1.5 before:-left-fixed-2xs before:w-1 before:rounded-r-full hover:bg-gray-80/60 hover:text-gray-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-stroke-focus aria-[current=page]:bg-gray-80 aria-[current=page]:font-semibold aria-[current=page]:text-fg-alternate aria-[current=page]:before:bg-surface-highlight"
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                {/* Stays in the accessible name; fades in once the rail has
                    mostly opened and out at once on collapse. */}
                <span
                  className={cn(
                    'transition-opacity duration-150 ease-out motion-reduce:transition-none',
                    isExpanded ? 'opacity-100 delay-100' : 'opacity-0'
                  )}
                >
                  {label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
