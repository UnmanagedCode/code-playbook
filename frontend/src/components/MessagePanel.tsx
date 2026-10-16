import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BackButton } from './BackButton';

export function MessagePanel({ title, text, onBack }: { title: string; text?: string | null; onBack?: () => void }) {
  return (
    <div className="flex flex-col gap-3">
      {onBack && <BackButton onClick={onBack} />}
      <Card>
        <CardHeader>
          <CardTitle role="heading" aria-level={2}>{title}</CardTitle>
        </CardHeader>
        {text && (
          <CardContent>
            <p className="text-sm text-muted-foreground">{text}</p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
