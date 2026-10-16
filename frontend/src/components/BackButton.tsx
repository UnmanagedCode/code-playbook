import { ArrowLeftIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Phone only (below `md`): the list is hidden while something is open, and this returns to it. */
export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" size="sm" className="self-start md:hidden" onClick={onClick}>
      <ArrowLeftIcon />
      All playbooks
    </Button>
  );
}
