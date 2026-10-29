import { createContext } from 'react';

/**
 * Changes when a list's rows, their order or nesting do. Rows measure layout for Motion only
 * then, so a title or selection change doesn't measure every row (research/06 §1.9.3).
 */
export const LayoutKey = createContext('');
