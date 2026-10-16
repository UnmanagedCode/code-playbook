import type { LocatedError } from '@/model/types';

export function ErrorList({ errors }: { errors: LocatedError[] | undefined }) {
  if (!errors?.length) return null;
  return (
    <ul className="list-disc pl-5 text-sm text-destructive">
      {errors.map((e, i) => <li key={i} className="break-words">{e.message}</li>)}
    </ul>
  );
}
