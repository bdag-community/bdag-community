import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind class names with conflict resolution.
 * clsx handles conditionals; tailwind-merge dedupes conflicting utilities.
 */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
