import type { ReactNode } from 'react';

type IfProps = {
  condition: unknown;
  children?: ReactNode;
  then?: ReactNode;
  else?: ReactNode;
};

/** Element-level conditional rendering: `<If condition={x}><Foo /></If>` or `then`/`else`. */
export default function If({
  condition,
  children,
  then,
  else: otherwise = null
}: IfProps) {
  return <>{condition ? (then ?? children) : otherwise}</>;
}

export { If };
